import { cn } from '@/lib/utils';
import { formatInt } from '@/lib/remin/format';
import type { MailAutomation } from '@/lib/mail-console/schemas';
import { Panel, PanelTitle } from '@/components/remin/parts';

// "Danh sách automation" của console mail: trạng thái, số người, % mở / % bấm từng flow.
// Số tính từ khi flow chạy tới nay (console không lọc theo kỳ).

const pctFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const HEAD_CLASS = 'py-1 text-right font-medium whitespace-nowrap';
const NUM_CLASS = 'py-1.5 text-right tabular-nums whitespace-nowrap align-top';

/** Cùng ngưỡng màu với console: dưới 5% đỏ, dưới 15% cam, từ 15% xanh. */
function openTone(rate: number): string {
  return rate < 5 ? 'text-red-700' : rate < 15 ? 'text-amber-700' : 'text-emerald-700';
}

export function MailAutomationTable({
  items,
  action,
}: {
  items: MailAutomation[];
  action: { label: string; href: string } | null;
}) {
  const running = items.filter((a) => a.published).length;
  return (
    <Panel>
      <PanelTitle
        title="Danh sách automation"
        subtitle={`${formatInt(items.length)} flow, ${formatInt(running)} đang chạy · số tính từ khi flow chạy tới nay, không theo kỳ đang chọn. % bấm tuỳ lời mời bấm của từng mail nên không tô màu tốt / xấu.`}
        action={action}
      />
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có automation nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-medium">Tên</th>
                <th className="py-1 font-medium">Trạng thái</th>
                <th className={HEAD_CLASS}>Người trong flow</th>
                <th className={HEAD_CLASS}>% mở</th>
                <th className={HEAD_CLASS}>% bấm</th>
                <th className={HEAD_CLASS}>Bước</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-zinc-100">
                  <td className="py-1.5 pr-3 align-top">
                    <span className="font-medium text-zinc-900">{a.name}</span>
                    {a.is_sales && (
                      <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                        bán hàng
                      </span>
                    )}
                    <div className="text-xs text-zinc-500">nguồn: {a.source_segments || '—'}</div>
                  </td>
                  <td className="py-1.5 pr-3 align-top whitespace-nowrap">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[11px] font-medium',
                        a.published ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                      )}
                    >
                      {a.published ? 'đang chạy' : 'nháp / tạm dừng'}
                    </span>
                  </td>
                  <td className={NUM_CLASS}>{formatInt(a.contacts_in_campaign)}</td>
                  <td className={NUM_CLASS}>
                    {a.open_rate == null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <>
                        <b className={openTone(a.open_rate)}>{pctFormat.format(a.open_rate)}%</b>
                        <div className="text-xs text-zinc-500">{formatInt(a.sent)} gửi</div>
                      </>
                    )}
                  </td>
                  <td className={NUM_CLASS}>
                    {a.click_rate == null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <>
                        <b className="text-zinc-900">{pctFormat.format(a.click_rate)}%</b>
                        <div className="text-xs text-zinc-500">{formatInt(a.clicked ?? 0)} người bấm</div>
                      </>
                    )}
                  </td>
                  <td className={`${NUM_CLASS} text-zinc-600`}>
                    {a.nodes} bước · {a.decisions} rẽ nhánh
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
