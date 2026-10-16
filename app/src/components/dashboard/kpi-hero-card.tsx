import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiFormat = 'number' | 'percent' | 'currency';

/** Màu nhấn theo thẻ. Nền icon dùng sắc rất nhạt để không át con số — con số
 *  mới là thứ người ta đọc. */
const TONE = {
  brand: { chip: 'bg-brand-50 text-brand-600', stroke: '#6366f1' },
  orange: { chip: 'bg-orange-50 text-orange-600', stroke: '#f97316' },
  green: { chip: 'bg-emerald-50 text-emerald-600', stroke: '#10b981' },
  amber: { chip: 'bg-amber-50 text-amber-600', stroke: '#f59e0b' },
  violet: { chip: 'bg-violet-50 text-violet-600', stroke: '#8b5cf6' },
} as const;

interface KpiHeroCardProps {
  title: string;
  /** Icon SVG (lucide), KHÔNG phải emoji: emoji render khác nhau theo hệ điều
   *  hành, không đổi màu theo theme và trông như lỗi font trên Windows. */
  icon: LucideIcon;
  /** Màu nhấn của thẻ, dùng cho nền icon + đường sparkline. */
  tone?: 'brand' | 'orange' | 'green' | 'amber' | 'violet';
  value: number;
  prevValue: number;
  format: KpiFormat;
  subtitle: string;
  // Tiny inline trend used by the right-side mini chart.
  // Keep length small (≤ 14 points). Empty array hides the chart.
  sparkline?: number[];
  sparklineColor?: string;
}

/**
 * Compact a number to "1.5M" / "340K" style with 1-decimal precision.
 * Strips trailing ".0" so 1_000_000 renders as "1M" not "1.0M".
 *
 * Why .toFixed(1) instead of (0): 1_500_000 → toFixed(0) = "2" (rounds up
 * and lies about 50% of the value). 1 decimal preserves the "and a half"
 * meaning users actually care about for revenue and engagement counts.
 */
function compact(value: number): string {
  let scaled: number;
  let suffix: string;
  if (value >= 1_000_000_000) {
    scaled = value / 1_000_000_000;
    suffix = 'B';
  } else if (value >= 1_000_000) {
    scaled = value / 1_000_000;
    suffix = 'M';
  } else if (value >= 1_000) {
    scaled = value / 1_000;
    suffix = 'K';
  } else {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  const rounded = scaled.toFixed(1);
  const trimmed = rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
  return `${trimmed}${suffix}`;
}

function formatValue(value: number, format: KpiFormat): string {
  if (format === 'percent') {
    // KPI nhận value dạng % (1.5 = 1.5%). Caller phải convert ratio → %
    // trước khi pass (vd `er * 100` nếu DB lưu decimal 0.015).
    // toFixed(2) giữ 2 chữ số thập phân cho ER nhỏ (0.45%, 1.23%).
    return `${value.toFixed(2)}%`;
  }
  // number + currency share the same compact rule — only the unit suffix differs
  // (currency rendered without VND symbol here; subtitle/tooltip can show it).
  return compact(value);
}

// Build an SVG polyline path from a numeric series. Coordinates are
// normalized to a 60×24 viewBox so the chart scales cleanly.
function buildSparklinePath(data: number[]): string {
  if (data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid /0 when all values equal
  const stepX = 60 / (data.length - 1);
  return data
    .map((v, i) => {
      const x = (i * stepX).toFixed(2);
      // Invert Y because SVG y grows downward; pad 2px top/bottom.
      const y = (22 - ((v - min) / range) * 20).toFixed(2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function KpiHeroCard({
  title,
  icon: Icon,
  value,
  prevValue,
  format,
  subtitle,
  tone = 'brand',
  sparkline,
  sparklineColor = '#3B82F6',
}: KpiHeroCardProps) {
  const delta =
    prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : value > 0 ? 100 : 0;
  const isPositive = delta >= 0;
  const path = sparkline && sparkline.length >= 2 ? buildSparklinePath(sparkline) : '';

  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70',
        'shadow-[0_1px_3px_0_rgb(15_23_42_/_0.06)] transition-shadow duration-200',
        'hover:shadow-[0_12px_28px_-6px_rgb(15_23_42_/_0.10)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-xl',
              TONE[tone].chip
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">
            {title}
          </span>
        </div>
        {/* Sparkline — fixed 60×24 viewBox, scales via width=full of container */}
        {path && (
          <svg
            viewBox="0 0 60 24"
            className="h-6 w-16 shrink-0"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={path}
              fill="none"
              stroke={TONE[tone].stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      <div
        data-slot="kpi-value"
        className="text-[32px] font-bold text-zinc-900 leading-none tracking-tight"
      >
        {formatValue(value, format)}
      </div>

      <div className="flex items-center gap-2 text-xs">
        {/* Biến động dùng icon + chữ, không chỉ dựa vào màu — người mù màu
            vẫn phân biệt được tăng/giảm. */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold',
            isPositive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          )}
        >
          {isPositive ? (
            <TrendingUp className="size-3" aria-hidden />
          ) : (
            <TrendingDown className="size-3" aria-hidden />
          )}
          {Math.abs(delta).toFixed(1)}%
        </span>
        <span className="text-zinc-500 truncate">{subtitle}</span>
      </div>
    </div>
  );
}
