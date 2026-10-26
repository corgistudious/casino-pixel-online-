import type { BjtTableSummary } from '@casino/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { Button } from '../ui/Button';

/** Blackjack entry: solo table or one of the shared 5-seat tables. */
export function BjtLobbyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tables, setTables] = useState<BjtTableSummary[] | null>(null);
  const fmt = (n: number) => formatChips(n, i18n.language);
  useEffect(() => {
    const load = () => void api<{ tables: BjtTableSummary[] }>('/api/bjt/tables').then((r) => setTables(r.tables), () => setTables([]));
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-3 lg:p-5">
        <PageHeader icon="rooms" title={t('bjt.lobby')} subtitle={t('bjt.lobbySub')} />
        <Link to="/play/blackjack" className="group relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-br from-[#0d4a33] via-[#0b2a22] to-[#0b0f1a] p-5 shadow-panel transition hover:border-emerald-200/60">
          <div className="font-display text-2xl font-heading text-white">🂡 {t('bjt.solo')}</div>
          <p className="text-sm text-white/60">{t('bjt.soloDesc')}</p>
        </Link>
        <section className="glass flex flex-col gap-2 p-3">
          <h2 className="px-1 font-display text-lg font-heading">{t('bjt.tables')}</h2>
          {tables?.map((tb) => (
            <div key={tb.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-strong text-white">{tb.name[i18n.language === 'en' ? 'en' : 'vi']}</div>
                <div className="text-xs text-white/55">{t('bjt.limits', { min: fmt(tb.minBet), max: fmt(tb.maxBet) })}</div>
              </div>
              <div className="flex gap-1" aria-label={t('bjt.seated', { n: tb.seated, max: tb.seats })}>
                {Array.from({ length: tb.seats }, (_, i) => (
                  <span key={i} className={`h-3 w-3 rounded-full ${i < tb.seated ? 'bg-gold-300 shadow-glow' : 'bg-white/15'}`} />
                ))}
              </div>
              <Button variant="gold" size="sm" disabled={tb.status !== 'open'} onClick={() => navigate(`/bjt/${tb.id}`)}>
                {t('bjt.enter')}
              </Button>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
