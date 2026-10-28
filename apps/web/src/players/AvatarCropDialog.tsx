import { AVATAR_RULES } from '@casino/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { Modal } from '../social/parts';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

const VIEW = 260;
const MAX_ZOOM = 4;

/**
 * Pick a photo from the phone or computer, frame it in a 1:1 circle (drag to move, slider / wheel /
 * pinch to zoom), preview, save. The browser re-draws the crop at exactly 512×512, which also drops
 * EXIF and location data; the server checks and cleans the result again.
 */
export function AvatarCropDialog({ hasPhoto, onClose, onSaved }: { hasPhoto: boolean; onClose: () => void; onSaved: (url: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  /** Keeps the photo covering the whole circle. */
  const clamp = (o: { x: number; y: number }, s = scale) => {
    if (!img) return o;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return { x: Math.min(0, Math.max(VIEW - w, o.x)), y: Math.min(0, Math.max(VIEW - h, o.y)) };
  };
  const setZoomAround = (next: number, cx = VIEW / 2, cy = VIEW / 2) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const s = base * z;
    // Keep the point under (cx, cy) in place while zooming.
    const ix = (cx - offset.x) / scale;
    const iy = (cy - offset.y) / scale;
    setZoom(z);
    setOffset(clamp({ x: cx - ix * s, y: cy - iy * s }, s));
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!(AVATAR_RULES.mime as readonly string[]).includes(file.type)) return toast(t('avatarUpload.badType'), 'error');
    if (file.size > AVATAR_RULES.maxPickBytes) return toast(t('avatarUpload.tooLarge', { mb: AVATAR_RULES.maxPickBytes / 1024 / 1024 }), 'error');
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      if (el.naturalWidth < 64 || el.naturalHeight < 64) {
        URL.revokeObjectURL(url);
        return toast(t('avatarUpload.tooSmall'), 'error');
      }
      setSrc(url);
      setImg(el);
      setZoom(1);
      const s = VIEW / Math.min(el.naturalWidth, el.naturalHeight);
      setOffset({ x: (VIEW - el.naturalWidth * s) / 2, y: (VIEW - el.naturalHeight * s) / 2 });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      toast(t('avatarUpload.badType'), 'error');
    };
    el.src = url;
  };

  const down = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
    }
  };
  const move = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomAround((pinch.current.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.current.dist);
    } else if (pointers.current.size === 1) {
      setOffset((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }));
    }
  };
  const up = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const encode = async (): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_RULES.side;
    canvas.height = AVATAR_RULES.side;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img!, -offset.x / scale, -offset.y / scale, VIEW / scale, VIEW / scale, 0, 0, AVATAR_RULES.side, AVATAR_RULES.side);
    const as = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    // WebP where the browser can encode it (Safari cannot: it returns PNG), else JPEG.
    const webp = await as('image/webp', 0.9);
    const blob = webp && webp.type === 'image/webp' ? webp : await as('image/jpeg', 0.9);
    if (!blob || blob.size > AVATAR_RULES.maxUploadBytes) throw new Error('encode');
    return blob;
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>('/api/me/avatar', { method: 'POST', raw: await encode() });
      toast(t('avatarUpload.saved'), 'success');
      onSaved(url);
      onClose();
    } catch (err) {
      toast(err instanceof Error && err.message === 'encode' ? t('avatarUpload.badType') : errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api('/api/me/avatar', { method: 'DELETE' });
      toast(t('avatarUpload.removed'), 'success');
      onSaved(null);
      onClose();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('avatarUpload.title')} onClose={onClose}>
      <input ref={input} type="file" accept={AVATAR_RULES.mime.join(',')} className="sr-only" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} aria-label={t('avatarUpload.choose')} />
      {img && src ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative touch-none select-none overflow-hidden rounded-xl bg-black/50"
            style={{ width: VIEW, height: VIEW, cursor: 'grab' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onWheel={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoomAround(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
            }}
            role="img"
            aria-label={t('avatarUpload.cropHint')}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none origin-top-left"
              style={{ left: offset.x, top: offset.y, width: img.naturalWidth * scale, height: img.naturalHeight * scale }}
            />
            {/* Darken outside the circle that will be shown. */}
            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(5,4,11,0.65)] ring-2 ring-gold-300/70" />
          </div>
          <label className="flex w-full max-w-[260px] items-center gap-2 text-xs text-white/60">
            {t('avatarUpload.zoom')}
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoomAround(Number(e.target.value))} className="flex-1" />
          </label>
          <p className="text-center text-[11px] text-white/45">{t('avatarUpload.cropHint')}</p>
          <div className="grid w-full grid-cols-2 gap-2">
            <Button onClick={() => input.current?.click()} disabled={busy}>
              {t('avatarUpload.another')}
            </Button>
            <Button variant="gold" onClick={() => void save()} disabled={busy}>
              {busy ? t('avatarUpload.saving') : t('avatarUpload.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/25 bg-black/20 px-4 py-8 text-sm text-white/70 hover:bg-white/5"
          >
            <span className="text-3xl" aria-hidden>
              📷
            </span>
            {t('avatarUpload.choose')}
          </button>
          <p className="text-[11px] leading-snug text-white/45">{t('avatarUpload.rules', { mb: AVATAR_RULES.maxPickBytes / 1024 / 1024, side: AVATAR_RULES.side })}</p>
          {hasPhoto && (
            <Button variant="ruby" onClick={() => void remove()} disabled={busy}>
              {t('avatarUpload.remove')}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
