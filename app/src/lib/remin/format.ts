// Hàm thuần định dạng số cho trang Remin. Chữ + ký hiệu so kỳ trước giống admin
// Remin để người xem hai nơi đọc cùng một cách.

const vndFull = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const intFormat = new Intl.NumberFormat('vi-VN');

export function formatVnd(n: number, compact = false): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (compact && abs >= 1e9) return `${sign}${oneDecimal.format(abs / 1e9)} tỷ ₫`;
  if (compact && abs >= 1e6) return `${sign}${oneDecimal.format(abs / 1e6)} tr ₫`;
  return `${sign}${vndFull.format(Math.round(abs))} ₫`;
}

export function formatInt(n: number): string {
  return Number.isFinite(n) ? intFormat.format(Math.round(n)) : '—';
}

export const pct1 = (n: number): string => `${oneDecimal.format(n)}%`;

/** Tỷ trọng trong tổng; phần ≤ 0 hoặc tổng ≤ 0 thì "—". */
export function shareText(part: number, total: number): string {
  return part > 0 && total > 0 ? pct1((part / total) * 100) : '—';
}

/** % đổi so kỳ trước; null = không so được (kỳ trước 0) hoặc gần như không đổi. */
function changePct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  return Math.abs(p) < 0.05 ? null : p;
}

/** "▲ +12,3% so với kỳ trước". Luôn có chữ + ký hiệu, không chỉ dựa vào màu. */
export function changeText(cur: number, prev: number): string {
  if (prev === 0) {
    return cur === 0 ? 'Không đổi so với kỳ trước' : 'Kỳ trước chưa có số để so';
  }
  const p = changePct(cur, prev);
  if (p == null) return 'Không đổi so với kỳ trước';
  return `${p > 0 ? '▲ +' : '▼ −'}${oneDecimal.format(Math.abs(p))}% so với kỳ trước`;
}

/** Bản ngắn cho ô bảng: "▲ +133,3%" / "Không đổi" / "Mới" / "—". */
export function changeShort(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? '—' : 'Mới';
  const p = changePct(cur, prev);
  if (p == null) return 'Không đổi';
  return `${p > 0 ? '▲ +' : '▼ −'}${oneDecimal.format(Math.abs(p))}%`;
}

/** Tăng là tốt với thu / lãi / số máy bán, là xấu với chi (`upIsGood = false`). */
export function changeTone(
  cur: number,
  prev: number,
  upIsGood = true
): 'good' | 'bad' | 'neutral' {
  const p = changePct(cur, prev);
  if (p == null) return 'neutral';
  return p > 0 === upIsGood ? 'good' : 'bad';
}

/** Chênh điểm phần trăm: "▲ +30 điểm % so với kỳ trước". */
export function pointsText(cur: number, prev: number): string {
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return 'Không đổi so với kỳ trước';
  return `${d > 0 ? '▲ +' : '▼ −'}${oneDecimal.format(Math.abs(d))} điểm % so với kỳ trước`;
}

/** YYYY-MM-DD → dd/MM. */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Lãi: "▲ 3.634.000 ₫"; lỗ: "▼ Lỗ 1.855.000 ₫". */
export function profitValue(vnd: number): string {
  if (vnd < 0) return `▼ Lỗ ${formatVnd(Math.abs(vnd))}`;
  return vnd > 0 ? `▲ ${formatVnd(vnd)}` : formatVnd(0);
}

/** Lãi / lỗ trong bảng: "3.634.000 ₫" / "Lỗ 1.855.000 ₫". */
export function signedProfit(vnd: number): string {
  return vnd < 0 ? `Lỗ ${formatVnd(Math.abs(vnd))}` : formatVnd(vnd);
}

/** Chi hiện dạng trừ: "−1.855.000 ₫"; 0 thì "0 ₫". */
export function minusVnd(vnd: number): string {
  return vnd === 0 ? formatVnd(0) : `−${formatVnd(Math.abs(vnd))}`;
}
