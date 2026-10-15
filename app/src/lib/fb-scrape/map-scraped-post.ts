// Map 1 record `fb feed` (fb-cli) → social_post + post_metric_daily.
//
// Khác mapFbFeedItem() trong lib/news/fb-cli.ts: cái đó map sang news_article
// (mục Tin tức). Cái này map sang bảng kênh để lên báo cáo ở phần Kênh.
//
// GIỚI HẠN KHÔNG THỂ VƯỢT: feed công khai không có reach/impressions/clicks/
// video_views — đó là Page Insights, dữ liệu riêng tư của Page. Các cột đó để
// 0 và phải nhập tay qua /api/channels/[id]/manual-metric nếu cần.

import type { PostMetricDailyRow, SocialPostRow } from '@/lib/cron/upsert-helpers';

/** Shape fb feed (v0.3.0) — xem ghi chú trong lib/news/fb-cli.ts. */
interface FbFeedRecord {
  id?: unknown;
  url?: unknown;
  created_at?: unknown;
  message?: { text?: unknown };
  counts?: { reactions?: unknown; comments?: unknown; shares?: unknown };
  attachments?: unknown;
}

export interface ScrapedPost {
  post: Omit<SocialPostRow, 'account_id'>;
  /** post_id điền sau khi upsertSocialPost trả về UUID nội bộ. */
  metric: Omit<PostMetricDailyRow, 'post_id'>;
}

function toInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Suy ra post_type từ attachments. Feed trả attachments[].media.kind.
 * Mặc định 'status' (khớp DEFAULT của cột) khi không có attachment nào.
 */
function derivePostType(attachments: unknown): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return 'status';
  const kinds = new Set<string>();
  for (const att of attachments) {
    const media = (att as Record<string, unknown>)?.media as
      | Record<string, unknown>
      | undefined;
    const kind = media?.kind;
    if (typeof kind === 'string') kinds.add(kind);
  }
  if (kinds.has('video')) return 'video';
  // Nhiều ảnh → album; đúng 1 ảnh → photo.
  if (kinds.has('photo')) return attachments.length > 1 ? 'album' : 'photo';
  if (kinds.has('link')) return 'link';
  return 'status';
}

/**
 * Map 1 record. Trả null nếu thiếu thứ không thể thiếu:
 *  - id   → không có external_id thì không upsert idempotent được
 *  - date → post_metric_daily khóa theo (post_id, date)
 *
 * Ngày lấy theo created_at của bài, KHÔNG phải ngày quét: fb feed không trả số
 * liệu theo từng ngày, chỉ trả tổng tích lũy tại thời điểm quét. Ghim vào ngày
 * đăng để mỗi bài có đúng 1 hàng, và lần quét sau UPSERT cập nhật tổng mới —
 * thay vì sinh ra một hàng mới mỗi ngày với cùng con số tích lũy (sẽ làm
 * AVG(engagement_rate) bị lệch vì đếm trùng một bài nhiều lần).
 */
export function mapScrapedPost(raw: Record<string, unknown>): ScrapedPost | null {
  const rec = raw as FbFeedRecord;

  const externalId = toStr(rec.id);
  if (!externalId) return null;

  const createdAt = toStr(rec.created_at);
  if (!createdAt) return null;
  const publishedAt = new Date(createdAt);
  if (Number.isNaN(publishedAt.getTime())) return null;

  const counts = rec.counts ?? {};

  return {
    post: {
      external_id: externalId,
      content: toStr(rec.message?.text),
      // Feed chỉ ship photo id, không ship URL — resolve URL cần thêm 1 call
      // fb-cli mỗi ảnh, không đáng cho báo cáo số liệu.
      media_url: null,
      post_type: derivePostType(rec.attachments),
      published_at: publishedAt,
      permalink: toStr(rec.url),
    },
    metric: {
      date: publishedAt,
      reactions: toInt(counts.reactions),
      comments: toInt(counts.comments),
      shares: toInt(counts.shares),
      // Page Insights — không lấy được từ feed công khai. Nhập tay nếu cần.
      reach: 0,
      impressions: 0,
      clicks: 0,
      video_views: 0,
    },
  };
}
