import { useEffect, useRef, useState } from 'react';
import { launchKind, sampleViewport } from '../lib/viewportProbe';

/**
 * Test build only (VITE_VIEWPORT_DIAG=1, or localStorage keyo.vpdiag=1). Measures what iOS hands the
 * page so a real iPhone can show WHERE a black band comes from:
 * - every sample has the window (inner/client/visual), CSS viewport units (vh/svh/lvh/dvh), html /
 *   body / #root boxes, safe areas, the element stack on the last row and a verdict (classifyBand);
 * - "paint": html/body turn magenta and #root gets a green outline. A band that turns magenta is
 *   inside the web view (app layout); a band that stays black is outside the page (iOS);
 * - experiments (live, no reload, undone on "reset"): #root at 100lvh or at the screen side, and a
 *   viewport-fit toggle that makes WebKit re-evaluate the viewport;
 * - the first 4 s of the last 5 launches are kept, so the launch that showed the band can be copied
 *   after the fact.
 * Not part of a production build unless the flag is set.
 */
type Sample = ReturnType<typeof sampleViewport> & { t: number; event: string };
interface Launch { at: string; commit: string; startOrientation: string; kind: ReturnType<typeof launchKind> & { pageshowPersisted: boolean | null; standalone: boolean | null }; samples: Sample[] }
const TIMES = [0, 12, 50, 100, 250, 500, 1000, 2000, 4000];
const LAUNCHES_KEY = 'keyo.vpdiag.launches';
const PAINT_ID = 'vpdiag-paint';
const PAINT_CSS = 'html,body{background:#ff00ff !important}#root{outline:4px solid #00ff00;outline-offset:-4px}';

export function viewportDiagEnabled(): boolean {
  if (import.meta.env.VITE_VIEWPORT_DIAG === '1') return true;
  try {
    return localStorage.getItem('keyo.vpdiag') === '1';
  } catch {
    return false;
  }
}

function readLaunches(): Launch[] {
  try {
    const v = JSON.parse(localStorage.getItem(LAUNCHES_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as Launch[]) : [];
  } catch {
    return [];
  }
}

type RootExp = 'auto' | 'lvh' | 'screen';

export function ViewportDiagnostics() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [open, setOpen] = useState(false);
  const [probe, setProbe] = useState(false);
  const [paint, setPaint] = useState(false);
  const [rootExp, setRootExp] = useState<RootExp>('auto');
  const [copied, setCopied] = useState('');
  const samplesRef = useRef<Sample[]>([]);
  const take = useRef<(event: string) => void>(() => {});

  useEffect(() => {
    const startOrientation = screen.orientation?.type ?? String((window as Window & { orientation?: number }).orientation ?? 'n/a');
    let pageshowPersisted: boolean | null = null;
    const onPageShow = (e: PageTransitionEvent) => {
      pageshowPersisted = e.persisted;
      take.current(`pageshow persisted=${e.persisted}`);
    };
    window.addEventListener('pageshow', onPageShow);
    take.current = (event: string) => {
      const s = { t: Math.round(performance.now()), event, ...sampleViewport() };
      samplesRef.current = [...samplesRef.current.slice(-120), s];
      setSamples(samplesRef.current);
    };
    const timers = TIMES.map((ms) => window.setTimeout(() => take.current(`+${ms}ms`), ms));
    // Keep this launch's first 4 s for later (the band can be gone by the time the overlay is read).
    timers.push(
      window.setTimeout(() => {
        try {
          const launch: Launch = {
            at: new Date().toISOString(),
            commit: __APP_COMMIT__,
            startOrientation,
            kind: { ...launchKind(), pageshowPersisted, standalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null },
            samples: samplesRef.current.slice(0, 40),
          };
          localStorage.setItem(LAUNCHES_KEY, JSON.stringify([...readLaunches().slice(-4), launch]));
        } catch {
          /* storage unavailable */
        }
      }, 4200),
    );
    const events = ['resize', 'orientationchange', 'pagehide', 'focus', 'blur'] as const;
    const handlers = events.map((e) => [e, () => take.current(e)] as const);
    handlers.forEach(([e, h]) => window.addEventListener(e, h));
    const onVis = () => take.current(`visibility:${document.visibilityState}`);
    document.addEventListener('visibilitychange', onVis);
    const onFocus = (e: FocusEvent) => {
      // The overlay's own buttons are not part of the app being measured.
      if (e.target instanceof Element && e.target.closest('[data-testid="vpdiag"]')) return;
      take.current(e.type);
      window.setTimeout(() => take.current(`${e.type}+400ms`), 400);
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    const onVv = () => take.current('vv.resize');
    const onVvScroll = () => take.current('vv.scroll');
    window.visualViewport?.addEventListener('resize', onVv);
    window.visualViewport?.addEventListener('scroll', onVvScroll);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('pageshow', onPageShow);
      handlers.forEach(([e, h]) => window.removeEventListener(e, h));
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
      window.visualViewport?.removeEventListener('resize', onVv);
      window.visualViewport?.removeEventListener('scroll', onVvScroll);
    };
  }, []);

  // Paint test: only a diagnostic colour, removed when switched off.
  useEffect(() => {
    if (!paint) return;
    const style = document.createElement('style');
    style.id = PAINT_ID;
    style.textContent = PAINT_CSS;
    document.head.appendChild(style);
    take.current('paint:on');
    return () => style.remove();
  }, [paint]);

  // Root-size experiment: inline height on #root, removed on 'auto'.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root || rootExp === 'auto') return;
    root.style.height = rootExp === 'lvh' ? '100lvh' : `${Math.min(screen.width, screen.height)}px`;
    const id = window.setTimeout(() => take.current(`exp:root=${rootExp}`), 300);
    return () => {
      window.clearTimeout(id);
      root.style.removeProperty('height');
    };
  }, [rootExp]);

  const toggleViewportFit = () => {
    const meta = document.querySelector('meta[name="viewport"]');
    const content = meta?.getAttribute('content');
    if (!meta || !content) return;
    meta.setAttribute('content', content.replace(/,\s*viewport-fit=cover/, ''));
    take.current('exp:viewport-fit=auto');
    window.setTimeout(() => {
      meta.setAttribute('content', content);
      take.current('exp:viewport-fit=cover');
      window.setTimeout(() => take.current('exp:viewport-fit+500ms'), 500);
    }, 500);
  };

  const copy = async (what: 'now' | 'launches') => {
    const data = what === 'now' ? { commit: __APP_COMMIT__, userAgent: navigator.userAgent, samples } : { commit: __APP_COMMIT__, userAgent: navigator.userAgent, launches: readLaunches() };
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy', text);
    }
    setCopied(what);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const last = samples[samples.length - 1];
  const short = Math.min(screen.width, screen.height);
  const btn = 'rounded border border-neon-cyan/50 px-1';

  return (
    <>
      {probe && (
        <div
          aria-hidden
          data-testid="vpdiag-probe"
          className="pointer-events-none fixed right-0 top-0 z-[90] w-3"
          style={{ height: `${short}px`, background: 'repeating-linear-gradient(180deg,#f0f 0 10px,#0ff 10px 20px)' }}
        />
      )}
      <div data-testid="vpdiag" className="fixed bottom-1 right-4 z-[90] max-w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-neon-cyan/50 bg-black/85 p-1.5 font-mono text-[10px] leading-tight text-neon-cyan">
        <button type="button" className="font-bold" onClick={() => setOpen(!open)}>
          VP {last ? `${last.inner} vv ${last.visual} gap ${last.band.gap} ${last.band.verdict}` : '…'}
        </button>
        {open && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap gap-1">
              <button type="button" className={btn} onClick={() => void copy('now')}>{copied === 'now' ? 'copied' : 'copy JSON'}</button>
              <button type="button" className={btn} onClick={() => void copy('launches')}>{copied === 'launches' ? 'copied' : 'copy launches'}</button>
              <button type="button" className={btn} data-testid="vpdiag-paint" onClick={() => setPaint(!paint)}>paint {paint ? 'off' : 'on'}</button>
              <button type="button" className={btn} onClick={() => setProbe(!probe)}>probe {probe ? 'off' : 'on'}</button>
              <button type="button" className={btn} data-testid="vpdiag-root" onClick={() => setRootExp(rootExp === 'auto' ? 'lvh' : rootExp === 'lvh' ? 'screen' : 'auto')}>root: {rootExp}</button>
              <button type="button" className={btn} onClick={toggleViewportFit}>viewport-fit ↻</button>
              <button type="button" className={btn} onClick={() => take.current('manual')}>sample</button>
            </div>
            <div className="text-white/60">build {__APP_COMMIT__}</div>
            {last && (
              <div className="text-white/80">
                screen {last.screen} · client {last.client} · html {last.html} · body {last.body} · root {last.root} · {last.orientation} ({String(last.angle)}) · vh {last.units.vh} svh {last.units.svh} lvh {last.units.lvh} dvh {last.units.dvh} · standalone {String(last.navigatorStandalone)} · {last.displayMode} · bar {last.statusBarMeta} · safe {last.safeArea.top}/{last.safeArea.right}/{last.safeArea.bottom}/{last.safeArea.left}
                <div>last row: {last.bottomStack.join(' > ') || '—'}</div>
              </div>
            )}
            <div className="h-32 overflow-auto text-white/70">
              {samples.map((s, i) => (
                <div key={i}>
                  {s.t}ms {s.event}: {s.inner} vv {s.visual} lvh {s.units.lvh} sc {s.scroll} {s.band.verdict}
                  {s.keyboard ? ` kb ${s.vars}` : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
