import { Metadata } from 'next';
import { resolveRangeFromSearchParams } from '@/lib/dashboard/time-range';
import { getReminConfig } from '@/lib/remin/config';
import { dayMonth } from '@/lib/remin/format';
import { loadReminOverview, reminAdminHref } from '@/lib/remin/overview';
import { DashboardDateRangePicker } from '@/components/dashboard/date-range-picker';
import { DeviceKpis, FinanceKpis } from '@/components/remin/kpi-cards';
import { AttentionList, FunnelPanel } from '@/components/remin/devices-attention';
import { ExternalAction } from '@/components/remin/parts';
import { PnlTable } from '@/components/remin/pnl-table';
import { ProductRevenue, RevenueBySource } from '@/components/remin/revenue-tables';
import { ActiveDevicesTrend, MoneyTrends } from '@/components/remin/weekly-trends';

export const metadata: Metadata = {
  title: 'Remin — Marketing OS',
};

/** Mặc định 30 ngày, cùng độ dài kỳ mặc định của Bảng điều hành trong admin Remin. */
const DEFAULT_RANGE = '30';

interface ReminPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReminPage({ searchParams }: ReminPageProps) {
  const params = await searchParams;
  const range = resolveRangeFromSearchParams({
    range: params.range ?? DEFAULT_RANGE,
    from: params.from,
    to: params.to,
  });
  const period = { from: range.sinceIso, to: range.untilIso };
  const periodQuery = new URLSearchParams(period).toString();

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Remin — Tổng quan</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Tiền về, doanh thu máy ghi âm và phần mềm, lãi lỗ, máy ghi âm khách đang dùng.
          Số đọc trực tiếp từ admin Remin.
        </p>
      </div>
      <DashboardDateRangePicker
        currentMode={range.mode}
        currentPreset={range.preset}
        currentFromIso={range.sinceIso}
        currentToIso={range.untilIso}
      />
    </div>
  );

  const config = await getReminConfig();
  if (!config.apiUrl || !config.mcpToken) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          Chưa cấu hình kết nối Remin. Admin cần nhập ở Settings → Tích hợp API (mã tạo
          trong admin Remin, mục &quot;Kết nối Claude&quot;).
        </p>
      </div>
    );
  }

  const { overview, revenue, weekly, funnel, attention } = await loadReminOverview(period);

  // Cùng một lỗi (vd mã hết hạn) thì mọi khối đều dính: chỉ báo một lần trên đầu trang.
  const errors = [
    ...new Set(
      [overview, revenue, weekly, funnel, attention].flatMap((s) =>
        s.ok ? [] : [s.message]
      )
    ),
  ];

  const ov = overview.ok ? overview.data : null;
  const rangeText = ov ? `${dayMonth(ov.range.from)} → ${dayMonth(ov.range.to)}` : '';
  const prevRangeText = ov
    ? `${dayMonth(ov.prevRange.from)} → ${dayMonth(ov.prevRange.to)}`
    : '';
  const financeHref = reminAdminHref(config.adminUrl, `/finance?${periodQuery}`);
  const adsHref = reminAdminHref(config.adminUrl, `/ads?${periodQuery}`);
  const deviceUsageHref = reminAdminHref(config.adminUrl, '/device-usage');

  return (
    <div className="flex flex-col gap-6">
      {header}

      {errors.map((message) => (
        <p
          key={message}
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200"
        >
          {message}
        </p>
      ))}

      {ov && (
        <>
          <FinanceKpis data={ov} />
          <div className="grid gap-4 2xl:grid-cols-2">
            {revenue.ok && (
              <RevenueBySource
                items={revenue.data.revenue.bySource}
                subtitle={`Kênh khách đến trước khi trả tiền (lần chạm cuối) · thu thuần ${rangeText}, so với kỳ trước ${prevRangeText}`}
                action={adsHref ? { label: 'Theo kênh tiếp thị →', href: adsHref } : null}
              />
            )}
            <ProductRevenue
              lines={ov.finance.sources}
              subtitle={`Theo sản phẩm và kênh bán · thu thuần (đã trừ phí cổng thanh toán, hoàn tiền) ${rangeText}, so với kỳ trước ${prevRangeText}`}
            />
          </div>
          <PnlTable
            finance={ov.finance}
            subtitle={`Kỳ này ${rangeText} · kỳ trước ${prevRangeText}`}
            action={
              financeHref ? { label: 'Xem chi tiết tài chính →', href: financeHref } : null
            }
          />
        </>
      )}

      {weekly.ok && (
        <section className="flex flex-col gap-3" aria-labelledby="remin-trends">
          <h3 id="remin-trends" className="text-base font-semibold text-zinc-900">
            Xu hướng 12 tuần
          </h3>
          <MoneyTrends weeks={weekly.data.weeks} />
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="remin-devices">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="remin-devices" className="text-base font-semibold text-zinc-900">
            Máy ghi âm
          </h3>
          {deviceUsageHref && (
            <ExternalAction label="Xem từng máy →" href={deviceUsageHref} />
          )}
        </div>
        {ov && <DeviceKpis data={ov} />}
        <div className="grid gap-4 xl:grid-cols-2">
          {funnel.ok && (
            <FunnelPanel
              steps={funnel.data.steps}
              action={
                deviceUsageHref ? { label: 'Xem khách →', href: deviceUsageHref } : null
              }
            />
          )}
          {weekly.ok && <ActiveDevicesTrend weeks={weekly.data.weeks} />}
        </div>
      </section>

      {attention.ok && (
        <AttentionList
          items={attention.data.items}
          hrefOf={(item) => reminAdminHref(config.adminUrl, item.href)}
        />
      )}
    </div>
  );
}
