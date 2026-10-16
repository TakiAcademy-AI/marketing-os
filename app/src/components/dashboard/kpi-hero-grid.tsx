import { Eye, MessageSquare, Target, Users, Wallet } from 'lucide-react';
import { KpiHeroCard } from './kpi-hero-card';
import type { KpiData } from '@/lib/queries/dashboard-kpi';
import type { TrendDataPoint } from '@/lib/queries/dashboard-trend';

const EMPTY_MESSAGE = 'Chờ cron sync đầu tiên (page_insights chạy 09:00 VN)';

function isAllZero(data: KpiData): boolean {
  return (
    data.reach === 0 &&
    data.avgEr === 0 &&
    data.conversions === 0 &&
    data.revenue === 0 &&
    data.totalFollowers === 0
  );
}

interface KpiHeroGridProps {
  data: KpiData;
  days: number;
  // Trend data drives sparkline series. Optional: empty array hides charts.
  trend?: TrendDataPoint[];
}

export function KpiHeroGrid({ data, days, trend = [] }: KpiHeroGridProps) {
  if (isAllZero(data)) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
        {EMPTY_MESSAGE}
      </div>
    );
  }

  const compareLabel = `so với ${days} ngày trước`;

  // Single-series arrays for each card's sparkline.
  // engagement_rate isn't a column on trend → derive (engagement / reach * 100).
  // Lead has a real daily series — sourced from landing_page_conversion.
  // Revenue card has no sparkline (no trend series collected for manual_revenue yet).
  const reachSeries = trend.map((t) => t.reach);
  const erSeries = trend.map((t) =>
    t.reach > 0 ? (t.engagement / t.reach) * 100 : 0
  );
  const leadSeries = trend.map((t) => t.conversions);
  const followersSeries = trend.map((t) => t.followers);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      <KpiHeroCard
        title="Total Reach"
        icon={Eye}
        tone="brand"
        value={data.reach}
        prevValue={data.reachPrev}
        format="number"
        subtitle={compareLabel}
        sparkline={reachSeries}
      />
      <KpiHeroCard
        title="Engagement Rate"
        icon={MessageSquare}
        tone="orange"
        value={data.avgEr}
        prevValue={data.avgErPrev}
        format="percent"
        subtitle={compareLabel}
        sparkline={erSeries}
      />
      <KpiHeroCard
        title="Lead"
        icon={Target}
        tone="green"
        value={data.conversions}
        prevValue={data.conversionsPrev}
        format="number"
        subtitle="Ladipage + tin nhắn"
        sparkline={leadSeries}
      />
      <KpiHeroCard
        title="Doanh thu"
        icon={Wallet}
        tone="amber"
        value={data.revenue}
        prevValue={data.revenuePrev}
        format="currency"
        subtitle="nhập tay theo kênh"
      />
      <KpiHeroCard
        title="Total Followers"
        icon={Users}
        tone="violet"
        value={data.totalFollowers}
        prevValue={data.totalFollowersPrev}
        format="number"
        subtitle={compareLabel}
        sparkline={followersSeries}
      />
    </div>
  );
}
