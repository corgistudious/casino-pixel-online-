import { REPORT_CATEGORIES, SOCIAL_RULES, type ReportCategory } from '@casino/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { Modal } from '../social/parts';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

/**
 * Re-encodes an image in the browser: at most 1600 px on the long side, JPEG, under the server's
 * 1 MB limit. Drawing through a canvas also drops EXIF/location metadata from phone photos.
 */
async function prepareEvidence(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  let scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', attempt < 3 ? 0.85 : 0.7));
    if (blob && blob.size <= SOCIAL_RULES.report.attachmentMaxBytes) return blob;
    scale *= 0.75;
  }
  throw new Error('image too large');
}

/** Report a player: reason, description, where it happened and optional evidence images. */
export function ReportDialog({ target, context, onClose }: { target: { uid: number; displayName: string }; context?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  // Preview URLs are freed when an image is removed and when the dialog closes.
  const urls = useRef<string[]>([]);
  urls.current = files.map((f) => f.url);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const { descriptionMin, descriptionMax, maxAttachments } = SOCIAL_RULES.report;
  const addFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith('image/')).slice(0, maxAttachments - files.length);
    setFiles((cur) => [...cur, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const valid = description.trim().length >= descriptionMin && description.trim().length <= descriptionMax;
  const submit = async () => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/reports', { method: 'POST', body: { uid: target.uid, category, description: description.trim(), ...(context ? { context } : {}) } });
      for (const f of files) {
        try {
          await api(`/api/reports/${id}/attachments`, { method: 'POST', raw: await prepareEvidence(f.file) });
        } catch {
          toast(t('people.reportDialog.uploadFailed', { name: f.file.name }), 'error');
        }
      }
      toast(t('people.done.reported'), 'success');
      onClose();
    } catch (err) {
      toast(errorText(t, err, i18n.language), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('people.reportDialog.title')} onClose={onClose}>
      <div className="rounded-xl bg-black/25 px-3 py-2 text-sm">
        <span className="text-white/50">{t('people.reportDialog.target')}: </span>
        <span className="font-strong text-white">{target.displayName}</span> <span className="tabular-nums text-white/50">· UID {target.uid}</span>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs text-white/60">{t('people.reportDialog.category')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REPORT_CATEGORIES.map((c) => (
            <label key={c} className={`cursor-pointer rounded-xl border px-3 py-2 text-xs transition ${category === c ? 'border-ruby-300/70 bg-ruby-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'}`}>
              <input type="radio" name="report-category" value={c} checked={category === c} onChange={() => setCategory(c)} className="sr-only" />
              {t(`people.reportDialog.categories.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-xs text-white/60">
        {t('people.reportDialog.description')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, descriptionMax))}
          rows={4}
          placeholder={t('people.reportDialog.placeholder')}
          className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-gold-300/60"
        />
        <span className="self-end tabular-nums text-white/40">
          {description.trim().length}/{descriptionMax}
        </span>
      </label>
      <div className="flex flex-col gap-1.5 text-xs text-white/60">
        {t('people.reportDialog.attach', { max: maxAttachments })}
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={f.url} className="relative">
              <img src={f.url} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/15" />
              <button type="button" onClick={() => (URL.revokeObjectURL(f.url), setFiles((cur) => cur.filter((_, j) => j !== i)))} className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-ruby-500 text-[11px] leading-5 text-white" aria-label={t('people.reportDialog.attachRemove')}>
                ×
              </button>
            </div>
          ))}
          {files.length < maxAttachments && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/25 text-2xl text-white/50 hover:bg-white/5" title={t('people.reportDialog.attachAdd')}>
              +
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} aria-label={t('people.reportDialog.attachAdd')} />
            </label>
          )}
        </div>
        <span className="text-[11px] text-white/40">{t('people.reportDialog.attachHint')}</span>
      </div>
      {context && (
        <p className="text-xs text-white/45">
          {t('people.reportDialog.context')}: <span className="font-mono">{context}</span>
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-white/45">{t('people.reportDialog.note')}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t('people.cancel')}</Button>
        <Button variant="ruby" disabled={!valid || busy} onClick={() => void submit()}>
          {t('people.reportDialog.submit')}
        </Button>
      </div>
    </Modal>
  );
}
