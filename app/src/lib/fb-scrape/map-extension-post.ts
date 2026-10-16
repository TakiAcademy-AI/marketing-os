// Map story node thô (extension bắt từ GraphQL timeline của Facebook) →
// social_post + post_metric_daily.
//
// VÌ SAO MAP Ở SERVER CHỨ KHÔNG Ở EXTENSION:
// Giống /api/news/ingest-ads — một nguồn sự thật cho mapping. Facebook đổi tên
// field là sửa ở đây, không phải bảo mọi người cài lại extension.
//
// VÌ SAO PHÒNG THỦ ĐẾN MỨC NÀY:
// Comet không có schema công khai và đổi tên field giữa các bản. Cùng một số
// (vd lượt bình luận) nằm ở vài đường dẫn khác nhau tuỳ surface. Nên mỗi field
// thử lần lượt nhiều đường thay vì tin vào một đường duy nhất.

import type { PostMetricDailyRow, SocialPostRow } from '@/lib/cron/upsert-helpers';

export interface MappedExtensionPost {
  post: Omit<SocialPostRow, 'account_id'>;
  metric: Omit<PostMetricDailyRow, 'post_id'>;
}

/** Lấy giá trị theo đường dẫn 'a.b.c', trả undefined nếu đứt giữa chừng. */
function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Đường dẫn đầu tiên cho ra chuỗi không rỗng. */
function firstStr(obj: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = at(obj, p);
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Đường dẫn đầu tiên cho ra số >= 0. Chuỗi số cũng nhận. */
function firstInt(obj: unknown, paths: string[]): number {
  for (const p of paths) {
    const v = at(obj, p);
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10);
  }
  return 0;
}

const ID_PATHS = ['post_id', 'postID', 'id', 'story.post_id', 'node.post_id'];

/** Id của node, lấy riêng để caller tra ngày đăng trong DB trước khi map. */
export function extensionPostId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  return firstStr(raw, ID_PATHS);
}

const URL_PATHS = [
  'url',
  'wwwURL',
  'www_url',
  'permalink',
  'permalink_url',
  'story.url',
  'comet_sections.content.story.wwwURL',
];

const TEXT_PATHS = [
  'message.text',
  'message_text',
  'content.text',
  'story.message.text',
  'comet_sections.content.story.message.text',
];

// creation_time của Comet là unix GIÂY; một số surface trả ISO.
const TIME_PATHS = [
  'creation_time',
  'created_time',
  'creationTime',
  'publish_time',
  'story.creation_time',
  'comet_sections.content.story.creation_time',
];

const REACTION_PATHS = [
  'feedback.reaction_count.count',
  'feedback.reactors.count',
  'reaction_count.count',
  'reactions.count',
  'counts.reactions',
];

const COMMENT_PATHS = [
  'feedback.comment_rendering_instance.comments.total_count',
  'feedback.total_comment_count',
  'feedback.comment_count.total_count',
  'comment_count.total_count',
  'comments.count',
  'counts.comments',
];

const SHARE_PATHS = [
  'feedback.share_count.count',
  'feedback.reshare_count',
  'share_count.count',
  'shares.count',
  'counts.shares',
];

const VIDEO_VIEW_PATHS = [
  'feedback.video_view_count',
  'video_view_count',
  'play_count',
  'counts.views',
  // Đường thật của reel ở tab /reels (đo trên HTML production). Giá trị là
  // chuỗi rút gọn "238K" nên firstInt không đọc được — xử riêng bên dưới.
  'short_form_video_context.play_count',
];

/** Lượt xem reel FB chỉ render dạng rút gọn "238K"/"1.2M". */
const VIDEO_VIEW_COMPACT_PATHS = [
  'short_form_video_context.play_count_reduced',
  'play_count_reduced',
];

function compactInt(obj: unknown, paths: string[]): number {
  for (const p of paths) {
    const v = at(obj, p);
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^([\d.,]+)\s*([KkMmBb])?$/);
    if (!m || m[1] === undefined) continue;
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k') return Math.round(n * 1e3);
    if (suf === 'm') return Math.round(n * 1e6);
    if (suf === 'b') return Math.round(n * 1e9);
    return Math.round(n);
  }
  return 0;
}

/**
 * Giờ đăng. Comet trả unix GIÂY — nhân 1000. Phân biệt với mili-giây bằng
 * ngưỡng: một mốc giây hợp lệ thời nay nhỏ hơn 10^11, mili-giây thì lớn hơn.
 */
function parsePublishedAt(raw: unknown): Date | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const ms = raw < 1e11 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    if (/^\d+$/.test(raw.trim())) return parsePublishedAt(parseInt(raw, 10));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Reel nhận bằng URL, giống đường token (lib/fb/parse-post.ts) và đường
 *  fb-cli (lib/fb-scrape/map-scraped-post.ts) — ba đường phải gán cùng
 *  post_type, nếu không query lọc `post_type IN ('reel','video')` đếm lệch. */
function derivePostType(url: string | null, node: unknown): string {
  if (url?.includes('/reel/')) return 'reel';
  // Node từ tab /reels có short_form_video_context. Xét cả cờ này chứ không
  // chỉ URL: URL có thể thiếu ở surface khác, và gán nhầm thành 'status' sẽ
  // làm query lọc `post_type IN ('reel','video')` đếm thiếu.
  if (at(node, 'short_form_video_context') != null) return 'reel';
  if (url?.includes('/videos/')) return 'video';
  const attachType = firstStr(node, [
    'attachments.0.media.__typename',
    'attachments.0.styles.attachment.media.__typename',
    'media_type',
  ]);
  if (attachType === 'Video') return 'video';
  if (attachType === 'Photo') return 'photo';
  return 'status';
}

/**
 * Map 1 story node. Trả null nếu thiếu id hoặc thiếu thời gian đăng —
 * không có id thì không upsert idempotent được, không có ngày thì
 * post_metric_daily không có khoá.
 */
export function mapExtensionPost(
  raw: unknown,
  /**
   * Ngày dùng khi node KHÔNG mang thời gian tạo — node reel ở tab /reels
   * thường chỉ có id + lượt xem. Caller truyền published_at của bài đã có
   * trong DB; chưa có thì truyền ngày hôm nay, và vì upsertSocialPost ghim
   * published_at lại nên lần quét sau sẽ tra ra đúng ngày đó, không đẻ thêm
   * hàng mới mỗi ngày.
   */
  fallbackDate?: Date
): MappedExtensionPost | null {
  if (!raw || typeof raw !== 'object') return null;

  const externalId = firstStr(raw, ID_PATHS);
  if (!externalId) return null;

  const publishedAt =
    parsePublishedAt(
      TIME_PATHS.map((p) => at(raw, p)).find((v) => v !== undefined && v !== null)
    ) ?? fallbackDate ?? null;
  if (!publishedAt) return null;

  const permalink = firstStr(raw, URL_PATHS);

  return {
    post: {
      external_id: externalId,
      content: firstStr(raw, TEXT_PATHS),
      media_url: null,
      post_type: derivePostType(permalink, raw),
      published_at: publishedAt,
      permalink,
    },
    metric: {
      // Ghim vào NGÀY ĐĂNG chứ không phải ngày quét: node chỉ mang tổng tích
      // luỹ tại lúc đọc. Ghim ngày quét thì mỗi ngày đẻ thêm một hàng cùng con
      // số, làm AVG(engagement_rate) lệch vì đếm trùng một bài nhiều lần.
      date: publishedAt,
      reactions: firstInt(raw, REACTION_PATHS),
      comments: firstInt(raw, COMMENT_PATHS),
      shares: firstInt(raw, SHARE_PATHS),
      // Page Insights — không có trong dữ liệu công khai.
      reach: 0,
      impressions: 0,
      clicks: 0,
      video_views:
        firstInt(raw, VIDEO_VIEW_PATHS) || compactInt(raw, VIDEO_VIEW_COMPACT_PATHS),
    },
  };
}
