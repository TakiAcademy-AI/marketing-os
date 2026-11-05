import type { ReactNode } from 'react';
import type { ReminMktDashboard } from '@/lib/remin/schemas';
import { formatInt, formatVnd, pct1, timesText } from '@/lib/remin/format';
import { StatTile } from './kpi-cards';
import { Panel, PanelTitle } from './parts';

// Dashboard MKT của admin Remin (`/mkt`) dựng lại ở đầu trang Remin: ngân sách Ads, data,
// đơn, doanh thu theo nền tảng quảng cáo và kênh organic. Đơn / Doanh thu = "Doanh thu
// theo nguồn" (lần chạm cuối) nên khớp số admin cùng kỳ.

const HEAD_CLASS = 'py-1 text-right font-medium whitespace-nowrap';
const NUM_CLASS = 'py-1.5 text-right tabular-nums whitespace-nowrap';
const CAMPAIGN_ROWS = 20;

const CLOSED_HINT =
  'Đơn chốt: đơn chốt trong kỳ, kể cả đơn mới cọc. Chờ thu: phần tiền của các đơn đó chưa ghi nhận. Cột Đơn / Doanh thu chỉ tính khi tiền đã về.';

/** Chi chia cho số lượng: "120.000 ₫"; chưa có số lượng thì "—". */
function perUnit(spendVnd: number, count: number): string {
  return count > 0 && spendVnd > 0 ? formatVnd(spendVnd / count) : '—';
}

function roasText(netVnd: number, spendVnd: number): string {
  return spendVnd > 0 ? timesText(netVnd / spendVnd) : '—';
}

function rateText(part: number, total: number): string {
  return total > 0 ? pct1((part / total) * 100) : '—';
}

const optInt = (n: number | null) => (n == null ? '—' : formatInt(n));

function followersText(followers: number | null, delta: number | null): ReactNode {
  if (followers == null) return '—';
  if (!delta) return formatInt(followers);
  return (
    <>
      {formatInt(followers)}{' '}
      <span className={delta > 0 ? 'text-emerald-700' : 'text-red-700'}>
        {delta > 0 ? `▲ +${formatInt(delta)}` : `▼ −${formatInt(Math.abs(delta))}`}
      </span>
    </>
  );
}

/** Bốn thẻ quảng cáo: chi, data, đơn, doanh thu, kèm chi / data, chi / đơn và ROAS. */
export function MktAdsKpis({ data }: { data: ReminMktDashboard }) {
  const t = data.ads.total;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Ngân sách Ads"
        value={formatVnd(t.spendVnd)}
        sub="Chi quảng cáo trong kỳ, mọi nền tảng"
      />
      <StatTile
        label="Data từ quảng cáo"
        value={formatInt(t.leads)}
        sub={<>Chi / data: {perUnit(t.spendVnd, t.leads)}</>}
      />
      <StatTile
        label="Đơn từ quảng cáo"
        value={formatInt(t.orders)}
        sub={<>Chi / đơn: {perUnit(t.spendVnd, t.orders)}</>}
      />
      <StatTile
        label="Doanh thu từ quảng cáo"
        value={formatVnd(t.netVnd)}
        sub={<>ROAS (doanh thu / chi): {roasText(t.netVnd, t.spendVnd)}</>}
      />
    </div>
  );
}

export function MktAdsTable({ data }: { data: ReminMktDashboard }) {
  // "Quảng cáo khác" toàn số 0 thì ẩn, như admin.
  const rows = data.ads.rows.filter(
    (r) =>
      r.key !== 'other' ||
      r.spendVnd + r.leads + r.orders + r.netVnd + r.closedOrders + r.pendingVnd !== 0
  );
  const t = data.ads.total;
  return (
    <Panel>
      <PanelTitle
        title="Nền tảng quảng cáo"
        subtitle="Chỉ tính là quảng cáo khi link có utm_medium=paid (hoặc cpc, ppc…) hay gclid / ttclid. Data = lead để lại form đặt mua, đã bỏ rác."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-medium">Nền tảng</th>
              <th className={HEAD_CLASS}>Ngân sách Ads</th>
              <th className={HEAD_CLASS}>Data</th>
              <th className={HEAD_CLASS}>Chi / data</th>
              <th className={HEAD_CLASS}>Đơn</th>
              <th className={HEAD_CLASS}>Doanh thu</th>
              <th className={HEAD_CLASS}>ROAS</th>
              <th className={HEAD_CLASS} title={CLOSED_HINT}>
                Đơn chốt
              </th>
              <th className={HEAD_CLASS} title={CLOSED_HINT}>
                Chờ thu
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-zinc-100">
                <td className="py-1.5">{r.label}</td>
                <td className={NUM_CLASS}>{formatVnd(r.spendVnd)}</td>
                <td className={NUM_CLASS}>{formatInt(r.leads)}</td>
                <td className={NUM_CLASS}>{perUnit(r.spendVnd, r.leads)}</td>
                <td className={NUM_CLASS}>{formatInt(r.orders)}</td>
                <td className={NUM_CLASS}>{formatVnd(r.netVnd)}</td>
                <td className={NUM_CLASS}>{roasText(r.netVnd, r.spendVnd)}</td>
                <td className={NUM_CLASS}>{formatInt(r.closedOrders)}</td>
                <td className={NUM_CLASS}>{formatVnd(r.pendingVnd)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-300 font-medium">
              <td className="py-1.5">Tổng quảng cáo</td>
              <td className={NUM_CLASS}>{formatVnd(t.spendVnd)}</td>
              <td className={NUM_CLASS}>{formatInt(t.leads)}</td>
              <td className={NUM_CLASS}>{perUnit(t.spendVnd, t.leads)}</td>
              <td className={NUM_CLASS}>{formatInt(t.orders)}</td>
              <td className={NUM_CLASS}>{formatVnd(t.netVnd)}</td>
              <td className={NUM_CLASS}>{roasText(t.netVnd, t.spendVnd)}</td>
              <td className={NUM_CLASS}>{formatInt(t.closedOrders)}</td>
              <td className={NUM_CLASS}>{formatVnd(t.pendingVnd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function MktOrganicTable({ data }: { data: ReminMktDashboard }) {
  // Hàng phụ (SEO, organic khác) toàn số 0 thì ẩn; 5 kênh chính luôn hiện, như admin.
  const rows = data.organic.rows.filter(
    (r) =>
      !r.extra ||
      (r.posts ?? 0) + r.traffic + r.leads + r.orders + r.netVnd + r.closedOrders + r.pendingVnd !==
        0
  );
  const t = data.organic.total;
  return (
    <Panel>
      <PanelTitle
        title="Kênh organic"
        subtitle="Link bài organic gắn utm_medium=organic + utm_source=<kênh>. Reach / Tương tác / Follower lấy từ kênh social đã nối; chưa nối thì “—”."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-medium">Kênh</th>
              <th className={HEAD_CLASS}>Số bài / video</th>
              <th className={HEAD_CLASS}>Reach</th>
              <th className={HEAD_CLASS}>Tương tác</th>
              <th className={HEAD_CLASS}>Follower</th>
              <th className={HEAD_CLASS}>Organic traffic</th>
              <th className={HEAD_CLASS}>Data</th>
              <th className={HEAD_CLASS}>Đơn</th>
              <th className={HEAD_CLASS}>Doanh thu</th>
              <th className={HEAD_CLASS} title={CLOSED_HINT}>
                Đơn chốt
              </th>
              <th className={HEAD_CLASS} title={CLOSED_HINT}>
                Chờ thu
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-zinc-100">
                <td className="py-1.5">{r.label}</td>
                <td className={NUM_CLASS}>{optInt(r.posts)}</td>
                <td className={NUM_CLASS}>{optInt(r.reach)}</td>
                <td className={NUM_CLASS}>{optInt(r.engagement)}</td>
                <td className={NUM_CLASS}>{followersText(r.followers, r.followersDelta)}</td>
                <td className={NUM_CLASS}>{formatInt(r.traffic)}</td>
                <td className={NUM_CLASS}>{formatInt(r.leads)}</td>
                <td className={NUM_CLASS}>{formatInt(r.orders)}</td>
                <td className={NUM_CLASS}>{formatVnd(r.netVnd)}</td>
                <td className={NUM_CLASS}>{formatInt(r.closedOrders)}</td>
                <td className={NUM_CLASS}>{formatVnd(r.pendingVnd)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-300 font-medium">
              <td className="py-1.5">Tổng organic</td>
              <td className={NUM_CLASS}>{formatInt(t.posts)}</td>
              <td className={NUM_CLASS}>{optInt(t.reach)}</td>
              <td className={NUM_CLASS}>{optInt(t.engagement)}</td>
              <td className={NUM_CLASS}>{followersText(t.followers, t.followersDelta)}</td>
              <td className={NUM_CLASS}>{formatInt(t.traffic)}</td>
              <td className={NUM_CLASS}>{formatInt(t.leads)}</td>
              <td className={NUM_CLASS}>{formatInt(t.orders)}</td>
              <td className={NUM_CLASS}>{formatVnd(t.netVnd)}</td>
              <td className={NUM_CLASS}>{formatInt(t.closedOrders)}</td>
              <td className={NUM_CLASS}>{formatVnd(t.pendingVnd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Dòng "cả kỳ" dưới hai bảng: để tổng hai bảng không bị hiểu là toàn bộ. */
export function MktOverallNote({ data }: { data: ReminMktDashboard }) {
  const o = data.overall;
  return (
    <p className="text-xs text-zinc-500">
      Cả kỳ: {formatInt(o.leads)} data · {formatInt(o.visits)} lượt truy cập ·{' '}
      {formatInt(o.orders)} đơn · doanh thu {formatVnd(o.netVnd)}. Ngoài hai bảng (trực tiếp /
      giới thiệu / không rõ nguồn): {formatInt(o.leadsOutside)} data,{' '}
      {formatInt(o.visitsOutside)} lượt truy cập ({formatInt(o.visitsDirect)} trực tiếp).
    </p>
  );
}

export function MktCampaignTable({
  data,
  action,
}: {
  data: ReminMktDashboard;
  action: { label: string; href: string } | null;
}) {
  const rows = data.campaigns.slice(0, CAMPAIGN_ROWS);
  const hidden = data.campaignsTotal - rows.length;
  return (
    <Panel>
      <PanelTitle
        title="Theo chiến dịch"
        subtitle={
          hidden > 0
            ? `${formatInt(rows.length)} chiến dịch chi nhiều nhất, còn ${formatInt(hidden)} chiến dịch xem trong admin Remin.`
            : 'Theo tên chiến dịch trong link (utm_campaign), sắp theo chi.'
        }
        action={hidden > 0 ? action : null}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có chiến dịch nào trong kỳ này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-medium">Kênh</th>
                <th className="py-1 font-medium">Chiến dịch</th>
                <th className={HEAD_CLASS}>Chi</th>
                <th className={HEAD_CLASS}>Data</th>
                <th className={HEAD_CLASS}>Đã mua</th>
                <th className={HEAD_CLASS}>Đơn</th>
                <th className={HEAD_CLASS}>Doanh thu</th>
                <th className={HEAD_CLASS}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.channelLabel}-${r.campaign}-${i}`} className="border-t border-zinc-100">
                  <td className="py-1.5 whitespace-nowrap">{r.channelLabel}</td>
                  <td className="py-1.5">
                    {r.campaign || <span className="text-zinc-500">(không ghi chiến dịch)</span>}
                  </td>
                  <td className={NUM_CLASS}>{formatVnd(r.spendVnd)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.leads)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.purchased)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.orders)}</td>
                  <td className={NUM_CLASS}>{formatVnd(r.netVnd)}</td>
                  <td className={NUM_CLASS}>
                    {r.roas == null ? '—' : timesText(r.roas)}
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

/** Chất lượng data theo kênh: lead hợp lệ, rác, đã liên hệ, đã mua và tỉ lệ mua. */
export function MktQualityTable({ data }: { data: ReminMktDashboard }) {
  const { rows, total } = data.quality;
  return (
    <Panel>
      <PanelTitle
        title="Chất lượng data"
        subtitle="Tỉ lệ mua = data đã mua / data hợp lệ (đã bỏ rác)."
      />
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có data trong kỳ này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-medium">Kênh</th>
                <th className={HEAD_CLASS}>Data</th>
                <th className={HEAD_CLASS}>Rác</th>
                <th className={HEAD_CLASS}>Đã liên hệ</th>
                <th className={HEAD_CLASS}>Đã mua</th>
                <th className={HEAD_CLASS}>Tỉ lệ mua</th>
              </tr>
            </thead>
            <tbody>
              {/* Khoá theo vị trí: "other" có thể là cả "Quảng cáo khác" lẫn "Trực tiếp / khác". */}
              {rows.map((r, i) => (
                <tr key={`${r.key}-${i}`} className="border-t border-zinc-100">
                  <td className="py-1.5">{r.label}</td>
                  <td className={NUM_CLASS}>{formatInt(r.leads)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.junk)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.contacted)}</td>
                  <td className={NUM_CLASS}>{formatInt(r.purchased)}</td>
                  <td className={NUM_CLASS}>{rateText(r.purchased, r.leads)}</td>
                </tr>
              ))}
              <tr className="border-t border-zinc-300 font-medium">
                <td className="py-1.5">Tổng</td>
                <td className={NUM_CLASS}>{formatInt(total.leads)}</td>
                <td className={NUM_CLASS}>{formatInt(total.junk)}</td>
                <td className={NUM_CLASS}>{formatInt(total.contacted)}</td>
                <td className={NUM_CLASS}>{formatInt(total.purchased)}</td>
                <td className={NUM_CLASS}>{rateText(total.purchased, total.leads)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
