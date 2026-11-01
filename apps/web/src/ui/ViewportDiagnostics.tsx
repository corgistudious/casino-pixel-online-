import { useEffect, useState } from 'react';
import { sampleViewport } from '../lib/viewportProbe';

/**
 * Test build only (VITE_VIEWPORT_DIAG=1, or localStorage keyo.vpdiag=1): records the window size at
 * fixed times after launch and on every viewport event, so a real iPhone can show exactly what iOS
 * handed the page. "Probe" draws a striped bar from the top of the page down to the screen's short
 * side: if the bottom band stays black under it, the band is outside the page's window (iOS), not
 * an unpainted area of the layout. Not part of a production build unless the flag is set.
 */
type Sample = ReturnType<typeof sampleViewport> & { t: number; event: string };
const TIMES = [0, 12, 50, 100, 250, 500, 1000, 2000, 4000];

export function viewportDiagEnabled(): boolean {
  if (import.meta.env.VITE_VIEWPORT_DIAG === '1') return true;
  try {
    return localStorage.getItem('keyo.vpdiag') === '1';
  } catch {
    return false;
  }
}

export function ViewportDiagnostics() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [open, setOpen] = useState(false);
  const [probe, setProbe] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const take = (event: string) => setSamples((s) => [...s.slice(-80), { t: Math.round(performance.now()), event, ...sampleViewport() }]);
    const timers = TIMES.map((ms) => window.setTimeout(() => take(`+${ms}ms`), ms));
    const events = ['resize', 'orientationchange', 'pageshow', 'focus'] as const;
    const handlers = events.map((e) => [e, () => take(e)] as const);
    handlers.forEach(([e, h]) => window.addEventListener(e, h));
    const onVis = () => take(`visibility:${document.visibilityState}`);
    document.addEventListener('visibilitychange', onVis);
    // Keyboard: focus changes, then the visual viewport settles a few frames later.
    const onFocus = (e: FocusEvent) => { take(e.type); window.setTimeout(() => take(`${e.type}+400ms`), 400); };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    const onVvScroll = () => take('vv.scroll');
    window.visualViewport?.addEventListener('scroll', onVvScroll);
    const onVv = () => take('vv.resize');
    window.visualViewport?.addEventListener('resize', onVv);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      handlers.forEach(([e, h]) => window.removeEventListener(e, h));
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
      window.visualViewport?.removeEventListener('scroll', onVvScroll);
      window.visualViewport?.removeEventListener('resize', onVv);
    };
  }, []);

  const last = samples[samples.length - 1];
  const copy = async () => {
    const text = JSON.stringify({ commit: __APP_COMMIT__, userAgent: navigator.userAgent, samples }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy', text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const short = Math.min(screen.width, screen.height);

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
      <div data-testid="vpdiag" className="fixed bottom-1 right-4 z-[90] max-w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-neon-cyan/50 bg-black/85 p-1.5 font-mono text-[10px] leading-tight text-neon-cyan">
        <button type="button" className="font-bold" onClick={() => setOpen(!open)}>
          VP {last ? `${last.inner} vv ${last.visual} gap ${last.startupInset}` : '…'}
        </button>
        {open && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex gap-2">
              <button type="button" className="rounded border border-neon-cyan/50 px-1" onClick={() => void copy()}>{copied ? 'copied' : 'copy JSON'}</button>
              <button type="button" className="rounded border border-neon-cyan/50 px-1" onClick={() => setProbe(!probe)}>probe {probe ? 'off' : 'on'}</button>
            </div>
            <div className="text-white/60">build {__APP_COMMIT__}</div>
            {last && (
              <div className="text-white/80">
                screen {last.screen} · client {last.client} · root {last.root} · {last.orientation} · standalone {String(last.navigatorStandalone)} · {last.displayMode} · bar {last.statusBarMeta} · safe {last.safeArea.top}/{last.safeArea.right}/{last.safeArea.bottom}/{last.safeArea.left}
              </div>
            )}
            <div className="max-h-32 overflow-auto text-white/70">
              {samples.map((s, i) => (
                <div key={i}>{s.t}ms {s.event}: {s.inner} vv {s.visual} sc {s.scroll}{s.keyboard ? ` kb ${s.vars}` : ''}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
