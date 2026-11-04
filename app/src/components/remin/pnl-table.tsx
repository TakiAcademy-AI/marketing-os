import { cn } from '@/lib/utils';
import type { ReminFinance } from '@/lib/remin/schemas';
import { formatVnd, minusVnd, pct1, signedProfit } from '@/lib/remin/format';
import { Panel, PanelTitle } from './parts';

function Line({
  label,
  cur,
  prev,
  kind = 'plain',
  bad,
}: {
  label: string;
  cur: string;
  prev: string;
  kind?: 'plain' | 'cost' | 'subtotal' | 'total';
  bad?: boolean;
}) {
  return (
    <tr
      className={cn(
        kind === 'total'
          ? 'border-t-2 border-zinc-400 text-base font-semibold'
          : kind === 'subtotal'
            ? 'border-t border-zinc-300 font-semibold'
            : 'border-t border-zinc-100',
        bad ? 'text-red-700' : 'text-zinc-900'
      )}
    >
      <td className={cn('py-1.5', kind === 'cost' && 'pl-4 text-zinc-700')}>{label}</td>
      <td className="py-1.5 text-right tabular-nums">{cur}</td>
      <td className={cn('py-1.5 text-right tabular-nums', !bad && 'text-zinc-600')}>
        {prev}
      </td>
    </tr>
  );
}

/** "Lãi lỗ kỳ này": thu máy + phần mềm, trừ từng nhóm chi, ra lãi / lỗ + biên. */
export function PnlTable({
  finance,
  subtitle,
  action,
}: {
  finance: ReminFinance;
  subtitle: string;
  action: { label: string; href: string } | null;
}) {
  const { revenue: r, pnl } = finance;
  const prevMargin = r.prevNetVnd > 0 ? (pnl.prevProfitVnd / r.prevNetVnd) * 100 : null;
  return (
    <Panel>
      <PanelTitle title="Lãi lỗ kỳ này" subtitle={subtitle} action={action} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-medium">Khoản</th>
              <th className="py-1 text-right font-medium">Kỳ này</th>
              <th className="py-1 text-right font-medium">Kỳ trước</th>
            </tr>
          </thead>
          <tbody>
            <Line
              label="Doanh thu máy ghi âm"
              cur={formatVnd(r.hardwareNetVnd)}
              prev={formatVnd(r.prevHardwareNetVnd)}
            />
            <Line
              label="Doanh thu phần mềm (gói + credit)"
              cur={formatVnd(r.softwareNetVnd)}
              prev={formatVnd(r.prevSoftwareNetVnd)}
            />
            <Line
              label="= Tổng thu thuần"
              cur={formatVnd(pnl.revenueNetVnd)}
              prev={formatVnd(r.prevNetVnd)}
              kind="subtotal"
            />
            {pnl.costs.map((c) => (
              <Line
                key={c.key}
                label={c.label}
                cur={minusVnd(c.vnd)}
                prev={minusVnd(c.prevVnd)}
                kind="cost"
              />
            ))}
            <Line
              label="= Tổng chi"
              cur={minusVnd(pnl.costTotalVnd)}
              prev={minusVnd(pnl.prevCostTotalVnd)}
              kind="subtotal"
            />
            <Line
              label="= Lãi / lỗ"
              cur={signedProfit(pnl.profitVnd)}
              prev={signedProfit(pnl.prevProfitVnd)}
              kind="total"
              bad={pnl.profitVnd < 0}
            />
            <Line
              label="Biên lãi (lãi ÷ tổng thu thuần)"
              cur={pnl.marginPct == null ? '—' : pct1(pnl.marginPct * 100)}
              prev={prevMargin == null ? '—' : pct1(prevMargin)}
            />
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Thu thuần = tiền khách trả trừ phí cổng thanh toán và tiền hoàn. Chi gồm giá vốn
        máy ghi âm đã bán, AI / API, hạ tầng &amp; dịch vụ, quảng cáo và khoản nhập tay
        khác, cùng cách tính với màn Tài chính của admin Remin.
      </p>
    </Panel>
  );
}
