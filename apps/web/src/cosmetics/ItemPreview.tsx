import { cosmeticDef, type CatalogItem, type ItemKind } from '@casino/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assetSrc } from '../store/catalog';
import { useSession } from '../store/session';
import { Avatar } from '../ui/Avatar';
import { CardBack, ChatBubble, GlyphIcon, TitleBadge } from '../ui/Cosmetics';
import { PlayerName } from '../ui/OfficialAssets';
import { TableSkinCanvas } from './TableSkinCanvas';
import type { TableLayout } from './tableArt';
import { previewVictory } from './VictoryEffect';

/** Compact preview of any cosmetic (shop and inventory tiles). */
export function ItemThumb({ itemId, kind, item, size = 72 }: { itemId: string; kind: ItemKind; item?: CatalogItem; size?: number }) {
  const { t } = useTranslation();
  const user = useSession((s) => s.user)!;
  if (kind === 'frame') return <span className="p-2"><Avatar index={user.avatar} customAvatar={user.customAvatar} avatarItem={user.avatarItem} frame={itemId} size={Math.round(size * 0.7)} /></span>;
  if (kind === 'title') return <TitleBadge itemId={itemId} size={size > 100 ? 'md' : 'sm'} />;
  if (kind === 'chat_bubble') return <div className="scale-90"><ChatBubble itemId={itemId}>{t('collection.bubbleSample')}</ChatBubble></div>;
  if (kind === 'card_back') return <CardBack itemId={itemId} width={Math.round(size * 0.62)} />;
  if (kind === 'table_skin') {
    return (
      <div className="overflow-hidden rounded-lg border border-white/10" style={{ width: size * 1.5, height: size }}>
        <TableSkinCanvas skinId={itemId} layout="oval" />
      </div>
    );
  }
  if (kind === 'victory_effect') {
    const def = cosmeticDef(itemId);
    const art = def?.kind === 'victory_effect' ? def.art : null;
    return (
      <span className="relative flex items-center justify-center rounded-full" style={{ width: size, height: size, background: art ? `radial-gradient(circle, ${art.glow}55, transparent 70%)` : undefined }}>
        {art && <GlyphIcon glyph={art.centre ?? art.particles[0]!} size={size * 0.5} color={art.colors[0]!} />}
        {art?.particles.slice(0, 3).map((g, i) => (
          <span key={i} className="absolute" style={{ left: `${[8, 70, 40][i]}%`, top: `${[12, 20, 70][i]}%` }}>
            <GlyphIcon glyph={g} size={size * 0.18} color={art.colors[(i + 1) % art.colors.length]!} />
          </span>
        ))}
      </span>
    );
  }
  return item?.assetUrl ? <img src={assetSrc(item.assetUrl)} alt="" className="object-contain" style={{ width: size, height: size }} /> : null;
}

const LAYOUTS: { id: TableLayout; label: string }[] = [
  { id: 'oval', label: 'preview.layoutCards' },
  { id: 'arc', label: 'preview.layoutBlackjack' },
  { id: 'board', label: 'preview.layoutBoard' },
];

/** Large interactive preview: sample table per game, playable effect, sample chat, mini profile. */
export function ItemPreviewLarge({ itemId, kind }: { itemId: string; kind: ItemKind }) {
  const { t } = useTranslation();
  const user = useSession((s) => s.user)!;
  const [layout, setLayout] = useState<TableLayout>('oval');
  if (kind === 'table_skin') {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-gold-300/30">
          <TableSkinCanvas skinId={itemId} layout={layout} />
        </div>
        <div className="flex justify-center gap-1">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLayout(l.id)} aria-pressed={layout === l.id} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${layout === l.id ? 'border-gold-300/70 bg-gold-300/15 text-gold-100' : 'border-white/10 text-white/60'}`}>
              {t(l.label)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'victory_effect') {
    return (
      <div className="flex flex-col items-center gap-2">
        <ItemThumb itemId={itemId} kind={kind} size={130} />
        <button type="button" onClick={() => previewVictory(itemId)} className="rounded-full border border-gold-300/60 bg-gold-300/15 px-4 py-1.5 text-sm text-gold-100 hover:bg-gold-300/25">
          ▶ {t('preview.play')}
        </button>
      </div>
    );
  }
  if (kind === 'card_back') {
    return (
      <div className="flex items-end gap-3">
        <span className="-rotate-6"><CardBack itemId={itemId} width={84} /></span>
        <span className="rotate-6"><CardBack itemId={itemId} width={84} /></span>
      </div>
    );
  }
  if (kind === 'chat_bubble') {
    return (
      <div className="flex w-full flex-col gap-2 rounded-xl bg-black/30 p-3">
        <div className="self-start"><ChatBubble itemId={null}>{t('preview.chatOther')}</ChatBubble></div>
        <div className="self-end"><ChatBubble itemId={itemId} mine>{t('preview.chatMine')}</ChatBubble></div>
      </div>
    );
  }
  if (kind === 'title') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
        <Avatar index={user.avatar} customAvatar={user.customAvatar} avatarItem={user.avatarItem} frame={user.frame} size={48} />
        <div className="flex flex-col items-start gap-1">
          <PlayerName name={user.displayName} badges={user.badges} size={14} className="font-strong text-white" />
          <TitleBadge itemId={itemId} />
        </div>
      </div>
    );
  }
  if (kind === 'frame') return <span className="p-6"><Avatar index={user.avatar} customAvatar={user.customAvatar} avatarItem={user.avatarItem} frame={itemId} size={112} animated /></span>;
  return <ItemThumb itemId={itemId} kind={kind} size={130} />;
}
