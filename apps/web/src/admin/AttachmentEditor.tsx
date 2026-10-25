import { MAIL_MAX_ATTACHMENTS, type MailAttachment } from '@casino/shared';
import { useTranslation } from 'react-i18next';
import { itemName, useCatalog } from '../store/catalog';
import { Button } from '../ui/Button';
import { CurrencyIcon } from '../ui/OfficialAssets';
import { useAdminKit } from './useAdmin';

/** Edits a reward bundle (Cxu and catalog items). Used by mail, level rewards and season rewards. */
export function AttachmentEditor({ value, onChange, label }: { value: MailAttachment[]; onChange: (v: MailAttachment[]) => void; label?: string }) {
  const { t, can } = useAdminKit();
  const { i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  const items = Object.values(catalog).filter((i) => i.status === 'released');
  const update = (i: number, a: MailAttachment) => onChange(value.map((x, j) => (j === i ? a : x)));
  const add = (a: MailAttachment) => value.length < MAIL_MAX_ATTACHMENTS && onChange([...value, a]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-white/55">{label ?? t('admin.mailAdmin.attachments')}</span>
      {value.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {a.type === 'item' ? (
            <select className="field max-w-xs" value={a.itemId} onChange={(e) => update(i, { type: 'item', itemId: e.target.value })}>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {itemName(it, i18n.language, it.id)} ({t(`admin.items.kinds.${it.kind}`)})
                </option>
              ))}
            </select>
          ) : (
            <>
              <CurrencyIcon currency={a.type} size={22} />
              <input
                className="field max-w-40"
                inputMode="numeric"
                placeholder={t('admin.mailAdmin.amount')}
                value={a.amount || ''}
                onChange={(e) => update(i, { type: a.type, amount: Number(e.target.value.replace(/\D/g, '')) })}
              />
            </>
          )}
          <Button type="button" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            {t('admin.mailAdmin.remove')}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {can('economy.grant') && (
          <>
            <Button type="button" size="sm" onClick={() => add({ type: 'silver', amount: 1000 })}>
              {t('admin.mailAdmin.addSilver')}
            </Button>
            <Button type="button" size="sm" onClick={() => add({ type: 'gold', amount: 1 })}>
              {t('admin.mailAdmin.addGold')}
            </Button>
          </>
        )}
        {can('items.grant') && items[0] && (
          <Button type="button" size="sm" onClick={() => add({ type: 'item', itemId: items[0]!.id })}>
            {t('admin.mailAdmin.addItem')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Read-only pills for a reward bundle. */
export function AttachmentPills({ value }: { value: MailAttachment[] }) {
  const { t, fmt } = useAdminKit();
  const { i18n } = useTranslation();
  const catalog = useCatalog((c) => c.items);
  if (!value.length) return <span className="text-white/40">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {value.map((a, i) => (
        <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
          {a.type === 'item' ? itemName(catalog[a.itemId], i18n.language, a.itemId) : `${fmt(a.amount)} ${t(`currency.${a.type}`)}`}
        </span>
      ))}
    </span>
  );
}
