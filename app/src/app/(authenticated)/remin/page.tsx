import { Metadata } from 'next';
import { Suspense } from 'react';
import { resolveRangeFromSearchParams } from '@/lib/dashboard/time-range';
import { getReminConfig } from '@/lib/remin/config';
import { dayMonth } from '@/lib/remin/format';
import { loadReminOverview, reminAdminHref } from '@/lib/remin/overview';
import { DashboardDateRangePicker } from '@/components/dashboard/date-range-picker';
import { DeviceKpis, FinanceKpis } from '@/components/remin/kpi-cards';
import { AttentionList, FunnelPanel } from '@/components/remin/devices-attention';
import {
  MktAdsKpis,
  MktAdsTable,
  MktCampaignTable,
  MktOrganicTable,
  MktOverallNote,
  MktQualityTable,
} from '@/components/remin/mkt-dashboard';
import { ExternalAction, SectionNotice } from '@/components/remin/parts';
import { PnlTable } from '@/components/remin/pnl-table';
import { ProductRevenue, RevenueBySource } from '@/components/remin/revenue-tables';
import { ReminSkeleton } from '@/components/remin/skeleton';
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

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">Remin</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Dashboard MKT (ngân sách quảng cáo, data, đơn theo kênh), rồi tiền về, lãi lỗ và máy
          ghi âm khách đang dùng. Số đọc trực tiếp từ admin Remin.
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

  return (
    <div className="flex flex-col gap-6">
      {header}
      {/* Khoá theo kỳ: đổi ngày thì phần số về khung chờ ngay. Không có khoá, trang giữ
          số kỳ cũ tới khi Remin trả xong cả 6 công cụ, trông như bấm không ăn. */}
      <Suspense key={`${period.from}_${period.to}`} fallback={<ReminSkeleton />}>
        <ReminSections period={period} adminUrl={config.adminUrl} />
      </Suspense>
    </div>
  );
}

async function ReminSections({
  period,
  adminUrl,
}: {
  period: { from: string; to: string };
  adminUrl: string | null;
}) {
  const { mkt, overview, revenue, weekly, funnel, attention } = await loadReminOverview(period);

  // Cùng một lỗi ở mọi khối (mã hết hạn, cổng tắt, mất kết nối): báo một lần.
  // Còn lại khối nào lỗi thì báo ngay tại khối đó.
  const sections = [mkt, overview, revenue, weekly, funnel, attention];
  const messages = new Set(sections.flatMap((s) => (s.ok ? [] : [s.message])));
  const sharedMessage =
    sections.every((s) => !s.ok) && messages.size === 1 ? [...messages][0] : undefined;
  if (sharedMessage) return <SectionNotice message={sharedMessage} />;

  const ov = overview.ok ? overview.data : null;
  const rangeText = ov ? `${dayMonth(ov.range.from)} → ${dayMonth(ov.range.to)}` : '';
  const prevRangeText = ov
    ? `${dayMonth(ov.prevRange.from)} → ${dayMonth(ov.prevRange.to)}`
    : '';
  const periodQuery = new URLSearchParams(period).toString();
  const mktHref = reminAdminHref(adminUrl, `/mkt?${periodQuery}`);
  const financeHref = reminAdminHref(adminUrl, `/finance?${periodQuery}`);
  const adsHref = reminAdminHref(adminUrl, `/ads?${periodQuery}`);
  const deviceUsageHref = reminAdminHref(adminUrl, '/device-usage');

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="remin-mkt">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="remin-mkt" className="text-base font-semibold text-zinc-900">
            Dashboard MKT
            {mkt.ok && (
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {dayMonth(mkt.data.range.from)} → {dayMonth(mkt.data.range.to)}
              </span>
            )}
          </h3>
          {mktHref && <ExternalAction label="Mở trong admin Remin →" href={mktHref} />}
        </div>
        {mkt.ok ? (
          <>
            <MktAdsKpis data={mkt.data} />
            <MktAdsTable data={mkt.data} />
            <MktOrganicTable data={mkt.data} />
            <MktOverallNote data={mkt.data} />
            <div className="grid gap-4 2xl:grid-cols-2">
              <MktCampaignTable
                data={mkt.data}
                action={mktHref ? { label: 'Xem đủ →', href: mktHref } : null}
              />
              <MktQualityTable data={mkt.data} />
            </div>
          </>
        ) : (
          <SectionNotice message={mkt.message} />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="remin-finance">
        <h3 id="remin-finance" className="text-base font-semibold text-zinc-900">
          Tổng quan tài chính
        </h3>
        {ov ? (
          <>
            <FinanceKpis data={ov} />
            <div className="grid gap-4 2xl:grid-cols-2">
              {revenue.ok ? (
                <RevenueBySource
                  items={revenue.data.revenue.bySource}
                  subtitle={`Kênh khách đến trước khi trả tiền (lần chạm cuối) · thu thuần ${rangeText}, so với kỳ trước ${prevRangeText}`}
                  action={adsHref ? { label: 'Theo kênh tiếp thị →', href: adsHref } : null}
                />
              ) : (
                <SectionNotice title="Tiền về theo nguồn" message={revenue.message} />
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
        ) : (
          !overview.ok && <SectionNotice message={overview.message} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="remin-trends">
        <h3 id="remin-trends" className="text-base font-semibold text-zinc-900">
          Xu hướng 12 tuần
        </h3>
        {weekly.ok ? (
          <MoneyTrends weeks={weekly.data.weeks} />
        ) : (
          <SectionNotice message={weekly.message} />
        )}
      </section>

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
          {funnel.ok ? (
            <FunnelPanel
              steps={funnel.data.steps}
              action={
                deviceUsageHref ? { label: 'Xem khách →', href: deviceUsageHref } : null
              }
            />
          ) : (
            <SectionNotice title="Phễu máy ghi âm" message={funnel.message} />
          )}
          {/* Lỗi xu hướng đã báo ở khối "Xu hướng 12 tuần" phía trên. */}
          {weekly.ok && <ActiveDevicesTrend weeks={weekly.data.weeks} />}
        </div>
      </section>

      {attention.ok ? (
        <AttentionList
          items={attention.data.items}
          hrefOf={(item) => reminAdminHref(adminUrl, item.href)}
        />
      ) : (
        <SectionNotice title="Việc cần chú ý" message={attention.message} />
      )}
    </>
  );
}
