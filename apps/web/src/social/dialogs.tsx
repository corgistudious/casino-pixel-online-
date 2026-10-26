import { SOCIAL_RULES, type GiftsOverview, type PlayerCard, type PlayerProfileView } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { newIdempotencyKey } from '../net/adminApi';
import { useCatalog } from '../store/catalog';
import { Button } from '../ui/Button';
import { TitleBadge } from '../ui/Cosmetics';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { RankEmblem } from '../ui/RankEmblem';
import { toast } from '../ui/toast';
import { GuildCrest, Modal, PlayerChip, useFail } from './parts';

const PRESETS = [500, 1_000, 2_000, 5_000];

/**
 * Two steps: pick the gift, then confirm recipient and content. One idempotency key per opened
 * dialog, so a double click or a retried request can never send twice.
 */
export function GiftDialog({ to, onClose, onSent }: { to: PlayerCard; onClose: () => void; onSent?: () => void }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const items = useCatalog((c) => c.items);
  const [data, setData] = useState<GiftsOverview | null>(null);
  const [kind, setKind] = useState<'silver' | 'item'>('silver');
  const [amount, setAmount] = useState(1_000);
  const [instance, setInstance] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const rules = SOCIAL_RULES.gift;
  const fmt = (n: number) => formatChips(n, i18n.language);
  const itemName = (id: string) => items[id]?.name[i18n.language === 'en' ? 'en' : 'vi'] ?? id;

  useEffect(() => void api<GiftsOverview>('/api/gifts').then(setData, fail), []); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = kind === 'silver' ? amount >= rules.minSilver && amount <= rules.maxSilver : !!instance;
  const what = kind === 'silver' ? `${fmt(amount)} ${t('social.gift.silver')}` : itemName(data?.items.find((i) => i.instanceId === instance)?.itemId ?? '');
  const send = async () => {
    setBusy(true);
    try {
      await api('/api/gifts', {
        method: 'POST',
        body: kind === 'silver' ? { id: key, kind, uid: to.uid, amount, message } : { id: key, kind, uid: to.uid, instanceId: instance, message },
      });
      toast(t('social.gift.sent'), 'success');
      onSent?.();
      onClose();
    } catch (err) {
      fail(err);
      setStep('pick');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={step === 'pick' ? t('social.gift.title', { name: to.displayName }) : t('social.gift.confirmTitle')} onClose={onClose}>
      {step === 'pick' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['silver', 'item'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-xl border px-3 py-3 font-label text-sm transition ${kind === k ? 'border-pink-300/70 bg-pink-500/15 text-white' : 'border-white/10 bg-black/20 text-white/60 hover:text-white'}`}
              >
                {k === 'silver' ? '🪙 ' : '🎁 '}
                {t(`social.gift.${k}`)}
              </button>
            ))}
          </div>
          {kind === 'silver' ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-white/55" htmlFor="gift-amount">{t('social.gift.amount')}</label>
              <div className="flex items-center gap-2">
                <CurrencyIcon currency="silver" size={28} />
                <input id="gift-amount" className="field" inputMode="numeric" value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)))} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setAmount(p)} className={`rounded-lg px-2.5 py-1 text-xs font-label ${amount === p ? 'bg-pink-500/30 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
                    {fmt(p)}
                  </button>
                ))}
              </div>
            </div>
          ) : data && data.items.length === 0 ? (
            <p className="rounded-xl bg-black/20 p-3 text-sm text-white/50">{t('social.gift.noItems')}</p>
          ) : (
            <ul className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto">
              {data?.items.map((i) => (
                <li key={i.instanceId}>
                  <button
                    type="button"
                    onClick={() => setInstance(i.instanceId)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${instance === i.instanceId ? 'border-pink-300/70 bg-pink-500/15' : 'border-white/10 bg-black/20 hover:border-white/25'}`}
                  >
                    {itemName(i.itemId)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input className="field" maxLength={rules.messageMax} placeholder={t('social.gift.message')} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="text-[11px] leading-snug text-white/45">
            {t('social.gift.rules', { min: fmt(rules.minSilver), max: fmt(rules.maxSilver), daily: fmt(rules.dailySilver), count: rules.dailyCount, hours: rules.friendForHours })}
          </p>
          {data && <p className="text-xs text-white/60">{t('social.gift.today', { silver: fmt(data.today.silver), count: data.today.count, max: rules.dailyCount })}</p>}
          <Button variant="gold" disabled={!valid} onClick={() => setStep('confirm')}>
            {t('social.gift.review')}
          </Button>
        </>
      ) : (
        <>
          <PlayerChip card={to} size={52} />
          <p className="rounded-xl border border-pink-300/30 bg-pink-500/10 p-3 text-sm text-white/85">{t('social.gift.confirmBody', { what, name: to.displayName, uid: to.uid })}</p>
          {message && <p className="text-sm italic text-white/60">“{message}”</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setStep('pick')} disabled={busy}>
              {t('nav.back')}
            </Button>
            <Button variant="gold" onClick={() => void send()} disabled={busy}>
              {t('social.gift.send')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Public profile of another player, with the actions that fit our relationship. */
export function ProfileDialog({ uid, onClose, onChanged }: { uid: number; onClose: () => void; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  const fail = useFail();
  const navigate = useNavigate();
  const [p, setP] = useState<PlayerProfileView | null>(null);
  const load = () => void api<{ player: PlayerProfileView }>(`/api/players/${uid}`).then((r) => setP(r.player), fail);
  useEffect(load, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (path: string) => {
    try {
      await api(path, { method: 'POST', body: { uid } });
      load();
      onChanged?.();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <Modal title={t('social.friends.profile')} onClose={onClose}>
      {!p ? (
        <p className="text-sm text-white/50">{t('app.loading')}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-600/25 via-violet-600/15 to-transparent p-4">
            <PlayerChip card={p} size={64} online={p.online} nameClass="text-lg" />
            {p.title && <TitleBadge itemId={p.title} size="sm" />}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-black/25 p-3">
              <dt className="text-[11px] text-white/45">{t('social.profile.rank')}</dt>
              <dd className="mt-1 flex items-center gap-2">{p.rank ? <><RankEmblem division={p.rank.division} size={26} /> <span className="tabular-nums text-white/80">{p.rank.rp} RP</span></> : t('social.profile.noRank')}</dd>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <dt className="text-[11px] text-white/45">{t('social.profile.guild')}</dt>
              <dd className="mt-1 flex items-center gap-2">{p.guild ? <><GuildCrest emblem={p.guild.emblem} color={p.guild.color} size={20} /> <span className="truncate">{p.guild.name}</span></> : t('social.profile.noGuild')}</dd>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <dt className="text-[11px] text-white/45">{t('social.profile.rounds')}</dt>
              <dd className="mt-1 font-strong tabular-nums">{formatChips(p.stats.rounds, i18n.language)}</dd>
            </div>
            <div className="rounded-xl bg-black/25 p-3">
              <dt className="text-[11px] text-white/45">{t('social.profile.biggest')}</dt>
              <dd className="mt-1 font-strong tabular-nums text-gold-100">{formatChips(p.stats.biggestWin, i18n.language)}</dd>
            </div>
          </dl>
          <p className="text-xs text-white/45">{t('social.profile.joined', { date: new Date(p.createdAt).toLocaleDateString(i18n.language) })}</p>
          <div className="flex flex-wrap gap-2">
            {p.relation === 'friend' && (
              <Button variant="gold" onClick={() => navigate(`/chat?dm=${p.uid}`)}>
                {t('social.friends.message')}
              </Button>
            )}
            {p.relation === 'none' && <Button variant="gold" onClick={() => void act('/api/friends/request')}>{t('social.friends.add')}</Button>}
            {p.relation === 'incoming' && <Button variant="gold" onClick={() => void act('/api/friends/accept')}>{t('social.friends.accept')}</Button>}
            {p.relation === 'outgoing' && <Button onClick={() => void act('/api/friends/cancel')}>{t('social.friends.cancel')}</Button>}
          </div>
        </>
      )}
    </Modal>
  );
}
