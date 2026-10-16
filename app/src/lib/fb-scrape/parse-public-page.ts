// Parse HTML trang Facebook công khai (lấy bằng curl-impersonate).
//
// Hàm thuần, không I/O — tách khỏi tầng gọi curl để test được bằng HTML thật
// tải về sẵn, thay vì phải gọi mạng mỗi lần chạy test.

/** Giải HTML entity dạng &#x110; và &#1234; mà og:description hay dùng. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** "2.5K" / "1.2M" / "11,712" → số nguyên. null nếu không phải số. */
export function parseCompact(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).trim().match(/^([\d.,]+)\s*([KkMmBb])?$/);
  if (!m || m[1] === undefined) return null;
  // Dấu phẩy ở đây là ngăn hàng nghìn kiểu Anh ("11,712"), không phải thập phân:
  // og:description bị ép Accept-Language: en-US nên luôn theo quy ước Anh.
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'k') return Math.round(n * 1_000);
  if (suf === 'm') return Math.round(n * 1_000_000);
  if (suf === 'b') return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

export interface PublicPageProfile {
  name: string | null;
  /** Số người theo dõi. Lấy từ og:description nên là số ĐẦY ĐỦ (19237),
   *  không phải "19K" rút gọn như text trong HTML. */
  followers: number | null;
  /** "talking about this" — chỉ dấu tương tác của FB, không phải reach. */
  talking: number | null;
}

/**
 * Đọc og:description của trang page.
 *
 * Dạng: "{tên}. {n} followers · {m} talking about this. {bio}"
 * Page cũ đôi khi là "{n} likes · {m} talking about this" — với Page thì
 * likes ≈ followers nên nhận cả hai.
 *
 * Phải ép `Accept-Language: en-US` lúc gọi curl, nếu không IP máy chủ hay nhận
 * bản tiếng Việt ("người theo dõi") làm regex trượt.
 */
export function parsePublicPageProfile(html: string): PublicPageProfile {
  const mDesc = html.match(/og:description"\s+content="([^"]*)"/);
  const mTitle = html.match(/og:title"\s+content="([^"]*)"/);
  const desc = mDesc?.[1] !== undefined ? decodeEntities(mDesc[1]) : '';
  const title = mTitle?.[1] !== undefined ? decodeEntities(mTitle[1]) : '';

  const mFollowers = desc.match(/([\d.,]+[KkMmBb]?)\s+(?:followers|likes)/i);
  const mTalking = desc.match(/([\d.,]+[KkMmBb]?)\s+talking about this/i);

  // Tên: ưu tiên og:title; không có thì lấy mệnh đề đầu của description.
  let name: string | null = title.trim() || null;
  if (!name && desc) {
    const first = desc.split('.')[0]?.trim();
    name = first || null;
  }

  return {
    name,
    followers: mFollowers?.[1] !== undefined ? parseCompact(mFollowers[1]) : null,
    talking: mTalking?.[1] !== undefined ? parseCompact(mTalking[1]) : null,
  };
}

export interface PublicReel {
  /** id toàn cục của reel (chuỗi base64 FB nhúng ngay sau lượt xem). */
  id: string;
  /** Lượt xem — số RÚT GỌN FB render sẵn ("238K"), sai số tới hàng nghìn. */
  views: number;
}

/**
 * Đọc tab /reels: FB render sẵn "play_count_reduced" cho mỗi reel trong HTML
 * (SSR) nên curl đọc được, không cần chạy JS.
 *
 * GIỚI HẠN: bản không đăng nhập chỉ render ~10 reel đầu mà Facebook tự chọn
 * (thường gồm reel view cao). Muốn ĐỦ reel phải có trình duyệt cuộn — xem
 * đường extension. Hai nguồn hợp nhất theo id, lấy view LỚN NHẤT.
 *
 * HTML không kèm creation_time hay permalink cạnh reel, nên hàm này KHÔNG dựng
 * được bài hoàn chỉnh — chỉ trả (id, views) để hợp nhất.
 */
export function parsePublicReels(html: string): PublicReel[] {
  const out: PublicReel[] = [];
  const seen = new Set<string>();
  const re = /"play_count_reduced":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0] === undefined || m[1] === undefined) continue;
    const views = parseCompact(m[1]);
    if (views === null) continue;
    // id nằm ngay sau trường view trong cùng object. Cửa sổ hẹp để không vớ
    // nhầm id của object kế tiếp.
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 240);
    const idm = after.match(/"id":"([A-Za-z0-9+/=_:-]{8,})"/);
    const id = idm?.[1] ?? `pos:${m.index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, views });
  }
  return out;
}
