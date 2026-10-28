import { SOCIAL_RULES, type FollowListEntry, type InventoryEntry, type PlayerProfileView, type ProfilePrivacy } from '@casino/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { errorText } from '../lib/errors';
import { formatChips } from '../lib/format';
import { api } from '../net/api';
import { ACHIEVEMENT_TITLES } from '../pages/AchievementsPage';
import { GuildCrest, Modal, PlayerChip } from '../social/parts';
import { assetSrc, itemName, useCatalog } from '../store/catalog';
import { AppShell, CharmIcon } from '../ui/AppShell';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { TitleBadge } from '../ui/Cosmetics';
import { Amount, PlayerName } from '../ui/OfficialAssets';
import { RankEmblem, useRankName } from '../ui/RankEmblem';
import { toast } from '../ui/toast';
import { VipEmblem } from '../ui/VipEmblem';
import { onRelationChange, PlayerTrigger, usePlayerActionItems } from './PlayerActions';
import { ReportDialog } from './ReportDialog';
import { AvatarCropDialog } from './AvatarCropDialog';
import { GiftHistory, GiftShowcase } from './GiftShowcase';
import { PlayerAvatar, PlayerRankBadge, useLiveCounts } from './identity';

/** Full public profile of a player (or my own, with privacy settings). */
export function PlayerProfilePage() {
  const { uid: raw } = useParams();
  const uid = Number(raw);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const rankName = useRankName();
  const catalog = useCatalog((s) => s.items);
  const [p, setP] = useState<PlayerProfileView | null>(null);
  const [missing, setMissing] = useState(false);
  const [report, setReport] = useState(false);
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const [cropping, setCropping] = useState(false);
  const fmt = (n: number) => formatChips(n, i18n.language);

  const load = useCallback(() => {
    if (!Number.isInteger(uid) || uid < 1) return setMissing(true);
    api<{ player: PlayerProfileView }>(`/api/players/${uid}`).then(
      (r) => {
        setP(r.player);
        setMissing(false);
      },
      (err) => {
        setMissing(true);
        toast(errorText(t, err, i18n.language), 'error');
      },
    );
  }, [uid, t, i18n.language]);
  useEffect(load, [load]);
  useEffect(() => onRelationChange(load), [load]);
  useEffect(() => {
    if (location.hash === '#privacy' && p?.privacy) document.getElementById('privacy')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, p]);

  const items = usePlayerActionItems(p, load, { onReport: () => setReport(true) });
  const counts = useLiveCounts(uid, { followers: p?.counts.followers ?? 0, likes: p?.counts.likes ?? 0, charm: p?.counts.charm ?? 0 });

  const item = (id: string) => catalog[id];
  const statCard = (label: string, value: string, tone = 'text-white') => (
    <div className="rounded-xl bg-black/25 p-3">
      <div className="text-[11px] text-white/45">{label}</div>
      <div className={`mt-1 font-strong tabular-nums ${tone}`}>{value}</div>
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 lg:p-5">
        <div>
          <Button size="sm" onClick={() => navigate(-1)}>
            ← {t('people.profile.back')}
          </Button>
        </div>
        {missing && !p && <p className="glass p-6 text-center text-white/60">{t('errors.not_found')}</p>}
        {!p && !missing && <p className="glass p-6 text-center text-white/50">{t('app.loading')}</p>}
        {p && (
          <>
            {/* Header */}
            <section className="glass relative overflow-hidden p-4 lg:p-6">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-600/20 via-violet-700/10 to-transparent" />
              <div className="relative flex flex-wrap items-center gap-4">
                <div className="flex flex-col items-center gap-1.5">
                  <PlayerAvatar player={p} size={104} status={p.presence} animated />
                  {p.relation === 'self' && (
                    <button type="button" onClick={() => setCropping(true)} className="rounded-full border border-gold-300/40 bg-black/40 px-3 py-1 text-[11px] text-gold-100 hover:bg-black/60">
                      📷 {t('avatarUpload.change')}
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlayerName name={p.displayName} badges={p.badges} size={22} className="min-w-0 font-display text-2xl font-bold text-white" />
                    <PlayerRankBadge rank={p.rank} size={26} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span className="tabular-nums">UID {p.uid}</span>
                    <span className="rounded bg-gold-300/15 px-1.5 font-label text-gold-100">{t('social.level', { level: p.level })}</span>
                    <span>{p.presence === null ? t('people.profile.hiddenOnline') : t(`identity.presence.${p.presence}`)}</span>
                    <span>· {t('people.profile.joined', { date: new Date(p.createdAt).toLocaleDateString(i18n.language) })}</span>
                  </div>
                  {p.title && (
                    <div className="mt-2">
                      <TitleBadge itemId={p.title} size="sm" />
                    </div>
                  )}
                  {(p.social.blockedBy || p.social.blocked || p.social.followedBy) && (
                    <p className="mt-2 text-xs text-white/60">{p.social.blockedBy ? t('people.blockedBy') : p.social.blocked ? t('people.youBlocked') : t('people.followsYou')}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <VipEmblem level={p.vip.level} size={56} />
                    <span className="text-[11px] text-fuchsia-100">{t('people.profile.vip', { level: p.vip.level })}</span>
                  </div>
                  {p.rank && (
                    <div className="flex flex-col items-center gap-1">
                      <RankEmblem division={p.rank.division} top={p.rank.topTitle} size={64} />
                      <span className="max-w-28 truncate text-center text-[11px] font-strong text-gold-100">{rankName(p.rank.division, p.rank.topTitle)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Counts */}
              <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <button type="button" onClick={() => setList('followers')} className="rounded-xl bg-black/25 p-3 text-left transition hover:bg-white/10">
                  <div className="text-[11px] text-white/45">{t('people.profile.followers')}</div>
                  <div className="mt-1 font-strong tabular-nums">{fmt(counts.followers)}</div>
                </button>
                <button type="button" onClick={() => setList('following')} className="rounded-xl bg-black/25 p-3 text-left transition hover:bg-white/10">
                  <div className="text-[11px] text-white/45">{t('people.profile.following')}</div>
                  <div className="mt-1 font-strong tabular-nums">{fmt(p.counts.following)}</div>
                </button>
                {statCard(t('people.profile.likes'), fmt(counts.likes), 'text-ruby-200')}
                <div className="rounded-xl border border-pink-300/20 bg-black/25 p-3" title={t('player.charmDesc')}>
                  <div className="flex items-center gap-1 text-[11px] text-white/45">
                    <CharmIcon size={14} /> {t('player.charm')}
                  </div>
                  <div className="mt-1 font-strong tabular-nums text-pink-100">{fmt(counts.charm)}</div>
                </div>
                {statCard(t('people.profile.friends'), p.counts.friends === null ? t('people.profile.hidden') : fmt(p.counts.friends))}
              </div>
              {/* Actions */}
              {p.relation !== 'self' && (
                <div className="relative mt-4 flex flex-wrap gap-2">
                  {items.map((it) => (
                    <Button
                      key={it.key}
                      size="sm"
                      variant={it.tone === 'gold' || it.key === 'follow' || it.key === 'add' || it.key === 'accept' ? 'gold' : it.tone === 'danger' ? 'ruby' : 'glass'}
                      disabled={it.disabled}
                      onClick={() => (it.confirm ? window.confirm(it.confirm) && it.onSelect() : it.onSelect())}
                    >
                      {it.key === 'like' ? '♥ ' : it.key === 'unlike' ? '♡ ' : ''}
                      {it.label}
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Wallet */}
              <section className="glass p-4">
                <h2 className="mb-3 font-display text-lg text-gold-100">{t('people.profile.wallet')}</h2>
                <div className="flex flex-wrap gap-4">
                  <Amount currency="silver" value={fmt(p.wallet.silver)} size={24} className="text-lg font-semibold" />
                  <Amount currency="gold" value={fmt(p.wallet.gold)} size={24} className="text-lg font-semibold" />
                </div>
                <p className="mt-2 text-[11px] text-white/45">{t('people.profile.walletNote')}</p>
              </section>
              {/* Rank & guild */}
              <section className="glass p-4">
                <h2 className="mb-3 font-display text-lg text-gold-100">{t('people.profile.rank')}</h2>
                {p.rank ? (
                  <div className="flex items-center gap-3">
                    <RankEmblem division={p.rank.division} top={p.rank.topTitle} size={48} />
                    <div className="text-sm">
                      <div className="font-strong text-white">{rankName(p.rank.division, p.rank.topTitle)}</div>
                      <div className="text-xs text-white/55">
                        {t('people.profile.rp', { rp: p.rank.rp })}
                        {p.rank.topPosition ? ` · ${t('people.profile.topPos', { pos: p.rank.topPosition })}` : ''} · {t('people.profile.record', { wins: p.rank.wins, losses: p.rank.losses })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/50">{t('people.profile.noRank')}</p>
                )}
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-white/45">{t('people.profile.guild')}:</span>
                  {p.guild ? (
                    <>
                      <GuildCrest emblem={p.guild.emblem} color={p.guild.color} size={22} />
                      <span className="truncate">{p.guild.name}</span>
                    </>
                  ) : (
                    <span className="text-white/50">{t('people.profile.noGuild')}</span>
                  )}
                </div>
              </section>
            </div>

            {/* Statistics */}
            <section className="glass p-4">
              <h2 className="mb-3 font-display text-lg text-gold-100">{t('people.profile.stats')}</h2>
              {!p.stats ? (
                <p className="text-sm text-white/50">{t('people.profile.statsHidden')}</p>
              ) : p.stats.rounds === 0 ? (
                <p className="text-sm text-white/50">{t('people.profile.noRounds')}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {statCard(t('people.profile.rounds'), fmt(p.stats.rounds))}
                    {statCard(t('people.profile.wins'), fmt(p.stats.wins), 'text-emerald-300')}
                    {statCard(t('people.profile.losses'), fmt(p.stats.losses), 'text-ruby-200')}
                    {statCard(t('people.profile.pushes'), fmt(p.stats.pushes))}
                    {statCard(t('people.profile.winRate'), `${Math.round((p.stats.wins / Math.max(1, p.stats.rounds)) * 1000) / 10}%`)}
                    {statCard(t('people.profile.biggest'), fmt(p.stats.biggestWin), 'text-gold-100')}
                  </div>
                  <h3 className="mb-2 mt-4 text-sm text-white/70">{t('people.profile.byGame')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <tbody>
                        {p.stats.byGame.map((g) => (
                          <tr key={g.game} className="border-t border-white/5">
                            <td className="py-1.5 pr-3 text-white/85">{t(`games.${g.game}.name`, { defaultValue: g.game })}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(g.rounds)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-300">{fmt(g.wins)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-ruby-200">{fmt(g.losses)}</td>
                            <td className="py-1.5 text-right tabular-nums text-white/60">{Math.round((g.wins / Math.max(1, g.rounds)) * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Achievements & badges */}
              <section className="glass p-4">
                <h2 className="mb-3 font-display text-lg text-gold-100">{t('people.profile.achievements')}</h2>
                {p.achievements.length === 0 ? (
                  <p className="text-sm text-white/50">{t('people.profile.noAchievements')}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {p.achievements.map((a) => (
                      <li key={a} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                        🏆 {ACHIEVEMENT_TITLES[a]?.[i18n.language.startsWith('vi') ? 0 : 1] ?? a}
                      </li>
                    ))}
                  </ul>
                )}
                {p.badges.length > 0 && (
                  <p className="mt-3 text-xs text-white/55">
                    {t('people.profile.badges')}: {p.badges.map((b) => t(`badges.${b}`, { defaultValue: b })).join(', ')}
                  </p>
                )}
              </section>
              {/* Collection */}
              <section className="glass p-4">
                <h2 className="mb-3 flex items-baseline justify-between font-display text-lg text-gold-100">
                  {t('people.profile.collection')}
                  {p.collection && <span className="text-xs text-white/50">{t('people.profile.collectionCount', { n: p.collection.total })}</span>}
                </h2>
                {!p.collection ? (
                  <p className="text-sm text-white/50">{t('people.profile.collectionHidden')}</p>
                ) : (
                  <>
                    <h3 className="mb-1 text-xs text-white/60">{t('people.profile.showcase')}</h3>
                    {p.collection.showcase.length === 0 ? (
                      <p className="mb-3 text-xs text-white/40">{t('people.profile.noShowcase')}</p>
                    ) : (
                      <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {p.collection.showcase.map((id, i) => (
                          <li key={`${id}-${i}`} className="flex flex-col items-center gap-1 rounded-xl border border-gold-300/30 bg-gold-300/[0.06] p-2" title={itemName(item(id), i18n.language, id)}>
                            {item(id)?.assetUrl ? <img src={assetSrc(item(id)!.assetUrl)} alt="" className="h-10 w-10 object-contain" /> : <span className="text-2xl">✦</span>}
                            <span className="w-full truncate text-center text-[10px] text-white/70">{itemName(item(id), i18n.language, id)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <h3 className="mb-1 text-xs text-white/60">{t('people.profile.titles')}</h3>
                    {p.collection.titles.length === 0 ? (
                      <p className="mb-3 text-xs text-white/40">{t('people.profile.noTitles')}</p>
                    ) : (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {p.collection.titles.map((id) => (
                          <TitleBadge key={id} itemId={id} size="sm" />
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {p.collection.items.map((id) => (
                        <span key={id} className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/70">
                          {itemName(item(id), i18n.language, id)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            <GiftShowcase owner={p} />
            {p.relation === 'self' && <GiftHistory />}

            {p.privacy && <PrivacyPanel privacy={p.privacy} onSaved={load} />}
          </>
        )}
      </div>
      {p && report && <ReportDialog target={{ uid: p.uid, displayName: p.displayName }} context={`profile:${p.uid}`} onClose={() => setReport(false)} />}
      {p && list && <FollowListDialog uid={p.uid} which={list} onClose={() => setList(null)} />}
      {p && cropping && (
        <AvatarCropDialog
          hasPhoto={!!p.customAvatar}
          onClose={() => setCropping(false)}
          onSaved={(url) => {
            const me = useSession.getState().user;
            if (me) useSession.getState().setUser({ ...me, customAvatar: url });
            load();
          }}
        />
      )}
    </AppShell>
  );
}

/** Followers / following of a player; every row opens the interaction menu. */
function FollowListDialog({ uid, which, onClose }: { uid: number; which: 'followers' | 'following'; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<FollowListEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const page = useCallback(
    (before?: string) =>
      api<{ players: FollowListEntry[] }>(`/api/players/${uid}/${which}${before ? `?before=${encodeURIComponent(before)}` : ''}`).then(
        (r) => {
          setRows((cur) => [...(before ? (cur ?? []) : []), ...r.players]);
          setMore(r.players.length === 50);
        },
        (err) => toast(errorText(t, err, i18n.language), 'error'),
      ),
    [uid, which, t, i18n.language],
  );
  useEffect(() => void page(), [page]);
  return (
    <Modal title={t(`people.profile.${which}`)} onClose={onClose}>
      {rows === null ? (
        <p className="text-sm text-white/50">{t('app.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/50">{t('people.profile.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.uid}>
              <PlayerTrigger uid={r.uid} label={r.displayName} context={`profile:${uid}:${which}`} className="w-full p-2 hover:bg-white/5">
                <PlayerChip card={r} size={38} online={r.online ?? undefined} />
              </PlayerTrigger>
            </li>
          ))}
        </ul>
      )}
      {more && rows && (
        <Button size="sm" onClick={() => void page(rows[rows.length - 1]!.since)}>
          {t('people.profile.loadMore')}
        </Button>
      )}
    </Modal>
  );
}

/** My privacy switches and showcase picker. */
function PrivacyPanel({ privacy, onSaved }: { privacy: ProfilePrivacy & { showcase: string[] }; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog((s) => s.items);
  const [draft, setDraft] = useState(privacy);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(privacy), [privacy]);
  useEffect(() => {
    void api<{ items: InventoryEntry[] }>('/api/me/inventory').then((r) => setInventory(r.items.filter((i) => i.active)), () => {});
  }, []);
  const toggle = (k: keyof ProfilePrivacy) => setDraft((d) => ({ ...d, [k]: !d[k] }));
  const pick = (id: string) =>
    setDraft((d) => ({ ...d, showcase: d.showcase.includes(id) ? d.showcase.filter((x) => x !== id) : d.showcase.length >= SOCIAL_RULES.showcaseMax ? d.showcase : [...d.showcase, id] }));
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/me/privacy', { method: 'PUT', body: draft });
      toast(t('people.privacyPanel.saved'), 'success');
      onSaved();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="privacy" className="glass scroll-mt-4 p-4">
      <h2 className="font-display text-lg text-gold-100">{t('people.privacyPanel.title')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{t('people.privacyPanel.intro')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(['showOnline', 'showFriends', 'showCollection', 'showStats', 'showGifts'] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm">
            {t(`people.privacyPanel.${k}`)}
            <input type="checkbox" checked={draft[k]} onChange={() => toggle(k)} className="h-5 w-5 accent-amber-400" />
          </label>
        ))}
      </div>
      <h3 className="mb-1 mt-4 text-sm text-white/80">{t('people.privacyPanel.showcase', { max: SOCIAL_RULES.showcaseMax })}</h3>
      <p className="mb-2 text-[11px] text-white/45">{t('people.privacyPanel.showcaseHint')}</p>
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {inventory.map((i) => {
          const on = draft.showcase.includes(i.instanceId);
          return (
            <button
              key={i.instanceId}
              type="button"
              aria-pressed={on}
              onClick={() => pick(i.instanceId)}
              className={`rounded-lg border px-2 py-1 text-[11px] transition ${on ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10'}`}
            >
              {itemName(catalog[i.itemId], i18n.language, i.itemId)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="gold" disabled={busy} onClick={() => void save()}>
          {t('room.form.save')}
        </Button>
      </div>
    </section>
  );
}
