import { REPORT_CATEGORIES, SOCIAL_RULES, type ReportCategory } from '@casino/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { api } from '../net/api';
import { Modal } from '../social/parts';
import { Button } from '../ui/Button';
import { toast } from '../ui/toast';

/** Report a player: reason, description and where it happened. The server stores it for staff review. */
export function ReportDialog({ target, context, onClose }: { target: { uid: number; displayName: string }; context?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const { descriptionMin, descriptionMax } = SOCIAL_RULES.report;
  const valid = description.trim().length >= descriptionMin && description.trim().length <= descriptionMax;
  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/reports', { method: 'POST', body: { uid: target.uid, category, description: description.trim(), ...(context ? { context } : {}) } });
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
