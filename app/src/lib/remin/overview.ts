import 'server-only';

import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { callReminTool, ReminApiError } from './client';
import {
  attentionSchema,
  funnelSchema,
  mktDashboardSchema,
  overviewSchema,
  revenueSchema,
  weeklyTrendsSchema,
} from './schemas';

// Nạp số liệu cho trang /remin. Mỗi khối đọc riêng để một công cụ lỗi không làm mất
// cả trang. Parse NGAY TRONG hàm cache: cache chỉ giữ dữ liệu đã qua danh sách trắng
// của schema, và lỗi (throw) thì không bị cache lại.

/** Khớp thời gian cache số liệu của admin Remin. Cổng MCP cho 60 lượt/phút/mã. */
const CACHE_SECONDS = 60;
const SLOW_CACHE_SECONDS = 300;
const TREND_WEEKS = 12;

const fetchOverview = unstable_cache(
  async (from: string, to: string) =>
    overviewSchema.parse(await callReminTool('get_overview', { from, to })),
  ['remin-overview-v1'],
  { revalidate: CACHE_SECONDS }
);

const fetchRevenue = unstable_cache(
  async (from: string, to: string) =>
    revenueSchema.parse(await callReminTool('get_revenue', { from, to })),
  ['remin-revenue-v1'],
  { revalidate: CACHE_SECONDS }
);

const fetchWeeklyTrends = unstable_cache(
  async () =>
    weeklyTrendsSchema.parse(
      await callReminTool('get_weekly_trends', { weeks: TREND_WEEKS })
    ),
  ['remin-weekly-trends-v1'],
  { revalidate: SLOW_CACHE_SECONDS }
);

const fetchFunnel = unstable_cache(
  async () => funnelSchema.parse(await callReminTool('get_device_funnel')),
  ['remin-funnel-v1'],
  { revalidate: CACHE_SECONDS }
);

const fetchAttention = unstable_cache(
  async () => attentionSchema.parse(await callReminTool('get_attention_items')),
  ['remin-attention-v1'],
  { revalidate: CACHE_SECONDS }
);

const fetchMktDashboard = unstable_cache(
  async (from: string, to: string) =>
    mktDashboardSchema.parse(await callReminTool('get_mkt_dashboard', { from, to })),
  ['remin-mkt-dashboard-v1'],
  { revalidate: CACHE_SECONDS }
);

export type Section<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    if (err instanceof ReminApiError) {
      console.error(`[remin] ${err.code}`);
      return { ok: false, message: err.message };
    }
    if (err instanceof z.ZodError) {
      // Chỉ ghi đường dẫn trường, không ghi giá trị (dữ liệu tiền, thông tin khách).
      console.error(
        '[remin] BAD_SHAPE',
        err.issues.map((issue) => issue.path.join('.'))
      );
      return { ok: false, message: 'Remin trả dữ liệu không đúng định dạng.' };
    }
    console.error('[remin] UNKNOWN', err instanceof Error ? err.name : 'unknown');
    return { ok: false, message: 'Không đọc được số liệu Remin.' };
  }
}

export async function loadReminOverview(range: { from: string; to: string }) {
  const [mkt, overview, revenue, weekly, funnel, attention] = await Promise.all([
    section(() => fetchMktDashboard(range.from, range.to)),
    section(() => fetchOverview(range.from, range.to)),
    section(() => fetchRevenue(range.from, range.to)),
    section(() => fetchWeeklyTrends()),
    section(() => fetchFunnel()),
    section(() => fetchAttention()),
  ]);
  return { mkt, overview, revenue, weekly, funnel, attention };
}

/** Link sang một màn trong admin Remin; chưa có `adminUrl` (từ getReminConfig) thì không có link. */
export function reminAdminHref(adminUrl: string | null, path: string): string | null {
  return adminUrl && path.startsWith('/') ? `${adminUrl}${path}` : null;
}
