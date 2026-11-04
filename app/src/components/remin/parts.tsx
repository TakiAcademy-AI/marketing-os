import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { changeText, changeTone } from '@/lib/remin/format';

// Mảnh dùng chung của trang Remin.

/** Bảng màu biểu đồ giống admin Remin (đã chạy validate_palette trên nền trắng).
 *  Thứ tự cố định theo vị trí dòng, không xoay vòng. Slot 3-5 có contrast thấp nên
 *  thanh tỷ trọng luôn đi kèm bảng số, biểu đồ tuần có nút "Bảng". */
export const SERIES = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  slate: '#64748b',
} as const;

export const SHARE_COLORS = [
  SERIES.blue,
  SERIES.orange,
  SERIES.aqua,
  SERIES.yellow,
  SERIES.magenta,
  SERIES.slate,
];

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5 flex flex-col gap-3 min-w-0',
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string } | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {action && <ExternalAction {...action} />}
    </div>
  );
}

/** Link sang admin Remin: mở tab mới vì là ứng dụng khác, cần đăng nhập riêng. */
export function ExternalAction({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-brand-600 hover:underline"
    >
      {label}
    </a>
  );
}

const TONE_CLASS = {
  good: 'text-emerald-700',
  bad: 'text-red-700',
  neutral: 'text-zinc-500',
} as const;

/** So kỳ trước: chữ có ▲ / ▼ + màu (với chi thì tăng là xấu). */
export function Change({
  cur,
  prev,
  upIsGood = true,
  short,
}: {
  cur: number;
  prev: number;
  upIsGood?: boolean;
  short?: string;
}) {
  return (
    <span className={cn('font-medium', TONE_CLASS[changeTone(cur, prev, upIsGood)])}>
      {short ?? changeText(cur, prev)}
    </span>
  );
}

/** Thanh 100%: khe 2px, không có chữ trên thanh; số nằm ở bảng ngay dưới. */
export function ShareBar({
  items,
  label,
}: {
  items: { key: string; label: string; vnd: number; color: string }[];
  label: string;
}) {
  const total = items.reduce((sum, item) => sum + item.vnd, 0);
  if (total <= 0) return null;
  return (
    <div
      className="flex h-5 w-full gap-[2px] overflow-hidden rounded-md"
      role="img"
      aria-label={label}
    >
      {items.map((item) => (
        <div
          key={item.key}
          style={{ width: `${(item.vnd / total) * 100}%`, background: item.color }}
          title={item.label}
        />
      ))}
    </div>
  );
}
