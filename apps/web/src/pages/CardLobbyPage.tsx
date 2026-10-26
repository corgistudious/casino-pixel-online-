import { CARD_GAMES, type CardGame, type CardTableSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { socket } from '../net/socket';
import { useSession } from '../store/session';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

/** Card room lobby: casual tables (Cxu Bạc buy-in) per game, and ranked matchmaking (match chips, RP). */
export function CardLobbyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const game = (CARD_GAMES as readonly string[]).includes(params.get('game') ?? '') ? (params.get('game') as CardGame) : 'poker';
  const [tables, setTables] = useState<CardTableSummary[] | null>(null);
  const [queued, setQueued] = useState<{ game: CardGame; since: number } | null>(null);
  const [, setTick] = useState(0);
  const status = useSession((s) => s.status);
  const fmt = (n: number) => formatChips(n, i18n.language);

  useEffect(() => {
    const load = () => void api<{ tables: CardTableSummary[] }>('/api/cards/tables').then((r) => setTables(r.tables), () => setTables([]));
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () =>
      socket.listen((ev) => {
        if (ev.event === 'cardMatch') {
          setQueued(null);
          navigate(`/cards/${ev.data.tableId}`);
        }
      }),
    [navigate],
  );

  useEffect(() => {
    if (!queued) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [queued]);

  const queue = async () => {
    try {
      await socket.request('card.queue', { game });
      setQueued({ game, since: Date.now() });
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    }
  };
  const unqueue = async () => {
    await socket.request('card.unqueue', {}).catch(() => {});
    setQueued(null);
  };

  const list = (tables ?? []).filter((x) => x.game === game);
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="rooms" title={t('cards.lobby')} subtitle={t('cards.lobbySub')} />
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1" role="tablist">
          {CARD_GAMES.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={g === game}
              onClick={() => setParams({ game: g })}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm transition ${g === game ? 'bg-gold-sheen text-ink-900 shadow-button' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
            >
              {t(`games.${g}.name`)}
            </button>
          ))}
        </div>

        <section className="relative overflow-hidden rounded-2xl border border-gold-300/30 bg-gradient-to-br from-[#3a0f2a] via-ink-900 to-ink-800 p-5 shadow-panel">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-extrabold text-gold-100">{t('cards.rankedTitle', { game: t(`games.${game}.name`) })}</h2>
              <p className="mt-1 text-sm text-white/65">{t('cards.rankedDesc')}</p>
            </div>
            {queued ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-white/80" role="status">
                  {t('cards.searching', { s: Math.floor((Date.now() - queued.since) / 1000) })}
                </span>
                <Button onClick={() => void unqueue()}>{t('cards.cancel')}</Button>
              </div>
            ) : (
              <Button variant="gold" size="lg" onClick={() => void queue()} disabled={status !== 'online'}>
                {t('cards.findMatch')}
              </Button>
            )}
          </div>
          <Link to="/rank" className="mt-2 inline-block text-xs text-white/50 underline">
            {t('rank.title')}
          </Link>
        </section>

        <section className="glass p-3">
          <h2 className="mb-2 px-1 font-display text-lg font-bold">{t('cards.casualTables')}</h2>
          {tables === null ? (
            <p className="p-3 text-sm text-white/50">{t('app.loading')}</p>
          ) : list.length === 0 ? (
            <p className="p-3 text-sm text-white/50">{t('cards.noTables')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{x.name[i18n.language === 'en' ? 'en' : 'vi']}</div>
                    <div className="text-xs text-white/55">
                      {x.game === 'poker' ? t('cards.blinds', { sb: fmt(x.config.smallBlind), bb: fmt(x.config.bigBlind) }) : t('cards.ante', { ante: fmt(x.config.ante) })} · {t('cards.buyIn', { min: fmt(x.config.minBuyIn), max: fmt(x.config.maxBuyIn) })}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-white/75">
                    {x.seated}/{x.config.seats}
                  </span>
                  <Button variant="gold" size="sm" onClick={() => navigate(`/cards/${x.id}`)} disabled={x.status !== 'open'}>
                    {t('cards.enter')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-[11px] text-white/35">{t('app.disclaimer')}</p>
      </div>
    </AppShell>
  );
}
