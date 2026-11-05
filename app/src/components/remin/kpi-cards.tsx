import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ReminOverview } from '@/lib/remin/schemas';
import {
  changeText,
  formatInt,
  formatVnd,
  pct1,
  pointsText,
  profitValue,
} from '@/lib/remin/format';
import { Change } from './parts';

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  /** Chỉ dùng cho số mang nghĩa tốt/xấu (lãi/lỗ), luôn đi kèm ký hiệu + chữ. */
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          'mt-2 text-2xl font-bold leading-tight tabular-nums',
          tone === 'bad'
            ? 'text-red-700'
            : tone === 'good'
              ? 'text-emerald-700'
              : 'text-zinc-900'
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs leading-relaxed text-zinc-500">{sub}</div>
    </div>
  );
}

export function FinanceKpis({ data }: { data: ReminOverview }) {
  const { revenue: r, devicesSold: d, pnl } = data.finance;
  const prevMargin = r.prevNetVnd > 0 ? (pnl.prevProfitVnd / r.prevNetVnd) * 100 : null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        label="Tiền về thuần"
        value={formatVnd(r.netVnd)}
        sub={
          <>
            <Change cur={r.netVnd} prev={r.prevNetVnd} />
            <br />
            Kỳ trước: {formatVnd(r.prevNetVnd)} · đã trừ phí cổng thanh toán, hoàn tiền
          </>
        }
      />
      <StatTile
        label="Doanh thu máy ghi âm"
        value={formatVnd(r.hardwareNetVnd)}
        sub={
          <>
            <Change cur={r.hardwareNetVnd} prev={r.prevHardwareNetVnd} />
            <br />
            {formatInt(d.units)} máy đã bán · Web {formatInt(d.webUnits)} · Taki CRM{' '}
            {formatInt(d.crmUnits)}
          </>
        }
      />
      <StatTile
        label="Doanh thu phần mềm"
        value={formatVnd(r.softwareNetVnd)}
        sub={
          <>
            <Change cur={r.softwareNetVnd} prev={r.prevSoftwareNetVnd} />
            <br />
            Gói {formatVnd(r.subscriptionNetVnd)} · mua thêm credit{' '}
            {formatVnd(r.packNetVnd)}
          </>
        }
      />
      <StatTile
        label="Tổng chi"
        value={formatVnd(pnl.costTotalVnd)}
        sub={
          <>
            <Change cur={pnl.costTotalVnd} prev={pnl.prevCostTotalVnd} upIsGood={false} />
            <br />
            Kỳ trước: {formatVnd(pnl.prevCostTotalVnd)} · giá vốn máy, AI, hạ tầng, quảng
            cáo, khác
          </>
        }
      />
      <StatTile
        label="Lãi / lỗ"
        value={profitValue(pnl.profitVnd)}
        tone={pnl.profitVnd < 0 ? 'bad' : pnl.profitVnd > 0 ? 'good' : undefined}
        sub={
          <>
            <Change cur={pnl.profitVnd} prev={pnl.prevProfitVnd} />
            <br />
            Biên lãi {pnl.marginPct == null ? '—' : pct1(pnl.marginPct * 100)}
            {prevMargin != null && ` · kỳ trước ${pct1(prevMargin)}`}
          </>
        }
      />
      <StatTile
        label="Máy ghi âm đã bán"
        value={`${formatInt(d.units)} máy`}
        sub={
          <>
            <Change cur={d.units} prev={d.prevUnits} />
            <br />
            Web {formatInt(d.webUnits)} · Taki CRM {formatInt(d.crmUnits)} · kỳ trước{' '}
            {formatInt(d.prevUnits)} máy
          </>
        }
      />
    </div>
  );
}

export function DeviceKpis({ data }: { data: ReminOverview }) {
  const { devices, paying } = data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatTile
        label="Máy đang dùng (7 ngày)"
        value={`${formatInt(devices.active)} / ${formatInt(devices.bound)} máy`}
        sub={
          <>
            {pct1(devices.activePct)} số máy đã kích hoạt có ghi trong 7 ngày
            <br />
            {pointsText(devices.activePct, devices.prevActivePct)}
          </>
        }
      />
      <StatTile
        label="Khách trả gói"
        value={`${formatInt(paying.customers)} khách`}
        sub={
          <>
            {pct1(paying.pctOfDevices)} số máy · gói {formatVnd(paying.planRevenueVnd)}
            /tháng
            <br />
            TB {formatVnd(paying.avgVndPerCustomer)}/khách ·{' '}
            {paying.prevCustomers == null
              ? 'chưa có số kỳ trước'
              : changeText(paying.customers, paying.prevCustomers)}
          </>
        }
      />
    </div>
  );
}
