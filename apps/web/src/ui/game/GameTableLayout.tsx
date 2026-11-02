import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { DemoBanner } from '../AppShell';
import { GameIconButton } from './GameButton';
import { GameIcon, type GameIconName } from './GameIcons';
import { GameBalance } from './GameParts';

/** In-room chat is opened from the table HUD (the old floating button would sit on the control bar). */
export const useGameChat = create<{ open: boolean; hudOwned: number; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  hudOwned: 0,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

export interface GameTool {
  id: string;
  label: string;
  icon: GameIconName;
  badge?: number | string;
  content: ReactNode;
}

/**
 * Table screen layout (Tài Xỉu, Xì Tố … — design system in index.css). No right-hand sidebar:
 *   tall screens:  HUD on top · table · bottom control bar
 *   short & wide screens (phones in landscape): the HUD splits into two slim icon columns beside
 *   the table (space a 16:9 table leaves empty anyway), so the table keeps the full height above
 *   the control bar and stays at least as large as in the previous layout.
 * Everything the old right-hand sidebar showed is in `tools`: one floating panel (drawer in
 * landscape, bottom sheet in portrait), so no function is lost. No fullscreen, no stretching.
 */
export function GameTableLayout({
  title,
  subtitle,
  status,
  tools,
  stage,
  controls,
}: {
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  tools: GameTool[];
  stage: ReactNode;
  controls: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const chatOpen = useGameChat((s) => s.open);
  const open = tools.find((x) => x.id === openId) ?? null;

  // The HUD owns the chat button while this layout is mounted.
  useEffect(() => {
    useGameChat.setState((s) => ({ hudOwned: s.hudOwned + 1 }));
    return () => useGameChat.setState((s) => ({ hudOwned: s.hudOwned - 1, open: false }));
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="game-shell" data-game-layout>
      <div className="game-grid">
        <div className="gbanner">
          <DemoBanner />
        </div>
        <header className="ghud">
          <div className="ghud-left">
            <GameIconButton label={t('nav.back')} onClick={() => navigate('/')}>
              <GameIcon name="back" />
            </GameIconButton>
            <div className="ghud-title">
              <h1>{title}</h1>
              {subtitle && <span className="ghud-sub">{subtitle}</span>}
            </div>
            {status}
          </div>
          <div className="ghud-tools">
            {tools.map((tool) => (
              <GameIconButton key={tool.id} label={tool.label} badge={tool.badge} expanded={openId === tool.id} onClick={() => setOpenId(openId === tool.id ? null : tool.id)}>
                <GameIcon name={tool.icon} />
              </GameIconButton>
            ))}
            <GameIconButton label={t('gameUi.chat')} expanded={chatOpen} onClick={() => useGameChat.getState().toggle()}>
              <GameIcon name="chat" />
            </GameIconButton>
            <div className="ghud-balance">
              <GameBalance />
            </div>
          </div>
        </header>
        <main className="gstage">{stage}</main>
        <footer className="gbar" aria-label={t('gameUi.controls')}>
          {controls}
        </footer>
      </div>
      {open && (
        <>
          <div className="gpanel-scrim" onClick={() => setOpenId(null)} aria-hidden />
          <aside className="gpanel" role="dialog" aria-modal="false" aria-label={open.label}>
            <div className="gpanel-head">
              <h2>{open.label}</h2>
              <GameIconButton ref={closeRef} label={t('gameUi.close')} onClick={() => setOpenId(null)}>
                <GameIcon name="close" />
              </GameIconButton>
            </div>
            {tools.length > 1 && (
              <div className="gpanel-tabs" role="tablist">
                {tools.map((tool) => (
                  <button key={tool.id} type="button" role="tab" aria-selected={tool.id === open.id} onClick={() => setOpenId(tool.id)}>
                    {tool.label}
                  </button>
                ))}
              </div>
            )}
            <div className="gpanel-body">{open.content}</div>
          </aside>
        </>
      )}
    </div>
  );
}
