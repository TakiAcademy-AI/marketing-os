import { cn } from '@/lib/utils';
import type { ReminAttentionItem, ReminFunnelStep } from '@/lib/remin/schemas';
import { formatInt, formatVnd, pct1 } from '@/lib/remin/format';
import { ExternalAction, Panel, PanelTitle, SERIES } from './parts';

/** Phễu máy ghi âm: chỉ số máy và tiền gói của từng bước. Danh sách khách rơi ở mỗi
 *  bước có thông tin cá nhân nên chỉ xem trong admin Remin. */
export function FunnelPanel({
  steps,
  action,
}: {
  steps: ReminFunnelStep[];
  action: { label: string; href: string } | null;
}) {
  const first = Math.max(1, steps[0]?.devices ?? 1);
  return (
    <Panel>
      <PanelTitle
        title="Phễu máy ghi âm"
        subtitle="Bán ra → khách kích hoạt máy trên app → ghi âm → dùng đều → trả gói."
        action={action}
      />
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-zinc-900">
                {i + 1}. {s.label}
              </span>
              <span className="text-sm tabular-nums text-zinc-900">
                {formatInt(s.devices)} máy
                {i > 0 && (
                  <span className="ml-2 text-xs text-zinc-500">
                    giữ {pct1(s.keepPct)} so bước trước
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded bg-zinc-100">
              <div
                className="h-2 rounded"
                style={{
                  width: `${Math.max(1, (s.devices / first) * 100)}%`,
                  background: SERIES.blue,
                }}
              />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Tiền gói / tháng: {s.moneyVnd == null ? '—' : formatVnd(s.moneyVnd)}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const SEVERITY = {
  urgent: { label: 'Gấp', className: 'bg-red-50 text-red-700 ring-red-200' },
  todo: { label: 'Cần làm', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  watch: { label: 'Theo dõi', className: 'bg-zinc-50 text-zinc-600 ring-zinc-200' },
} as const;

/** "Việc cần chú ý": số việc + tiền liên quan, chi tiết mở trong admin Remin. */
export function AttentionList({
  items,
  hrefOf,
}: {
  items: ReminAttentionItem[];
  hrefOf: (item: ReminAttentionItem) => string | null;
}) {
  return (
    <Panel>
      <PanelTitle
        title="Việc cần chú ý"
        subtitle="Danh sách khách cụ thể chỉ xem trong admin Remin."
      />
      {items.length === 0 && (
        <p className="text-sm text-zinc-500">Hiện không có việc nào cần chú ý.</p>
      )}
      <ul className="divide-y divide-zinc-100">
        {items.map((item) => {
          const severity = SEVERITY[item.severity];
          const href = hrefOf(item);
          return (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
                    severity.className
                  )}
                >
                  {severity.label}
                </span>
                <span className="text-sm font-medium text-zinc-900">{item.title}</span>
              </span>
              <span className="flex items-center gap-3 text-sm tabular-nums">
                <span className="font-semibold text-zinc-900">
                  {formatInt(item.count)}
                </span>
                {item.moneyVnd != null && (
                  <span className="text-zinc-600" title={item.moneyLabel}>
                    {formatVnd(item.moneyVnd)}
                  </span>
                )}
                {href && <ExternalAction label="Mở →" href={href} />}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
