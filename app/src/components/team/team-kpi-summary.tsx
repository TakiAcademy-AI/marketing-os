import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Star, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamKpiSummary } from '@/lib/queries/team-kpi';

interface TeamKpiSummaryProps {
  data: TeamKpiSummary;
}

// 4 stats card dùng layout giống KpiHeroGrid nhưng metric ngữ nghĩa khác
// (không có sparkline, mỗi card có icon + 1 dòng phụ).
export function TeamKpiSummaryCards({ data }: TeamKpiSummaryProps) {
  const isPositive = data.avgScoreDelta >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <SummaryCard
        icon={Users}
        tone="brand"
        label="TỔNG THÀNH VIÊN"
        value={data.totalMembers.toString()}
        sub=""
      />

      <SummaryCard
        icon={Star}
        tone="amber"
        label="ĐIỂM TRUNG BÌNH"
        value={data.avgScore.toFixed(1)}
        sub={
          // Phase 1: delta = 0 means "no snapshot yet"; UI hides arrow until
          // Phase 2 ships the weekly snapshot table.
          data.avgScoreDelta === 0 ? (
            <span className="text-zinc-500">(coming soon)</span>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                isPositive ? 'text-green-600' : 'text-red-500'
              )}
            >
              {isPositive ? '↑' : '↓'} {Math.abs(data.avgScoreDelta).toFixed(1)} so
              với tuần trước
            </span>
          )
        }
      />

      <SummaryCard
        icon={Trophy}
        tone="violet"
        label="TOP PERFORMER"
        value={data.topPerformer.name}
        valueClass="text-xl"
        sub={
          <span className="text-zinc-500">
            {data.topPerformer.score.toFixed(1)} điểm ·{' '}
            {data.topPerformer.streakWeeks === 0 ? (
              <span className="text-zinc-500">streak (coming soon)</span>
            ) : (
              `${data.topPerformer.streakWeeks} tuần liên tiếp`
            )}
          </span>
        }
      />

      <SummaryCard
        icon={AlertTriangle}
        tone="rose"
        label="DƯỚI TARGET"
        value={data.belowTarget.toString()}
        sub={<span className="text-rose-500">cần 1-1 coaching tuần này</span>}
      />
    </div>
  );
}

/** Nền chip icon. Rất nhạt để không át con số — con số mới là thứ cần đọc. */
const TONE = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
} as const;

interface SummaryCardProps {
  /** Icon SVG (lucide), không dùng emoji: emoji render khác nhau theo hệ điều
   *  hành và không đổi màu theo theme. */
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  label: string;
  value: string;
  valueClass?: string;
  sub?: React.ReactNode;
  accentClass?: string;
}

function SummaryCard({
  icon: Icon,
  tone = 'brand',
  label,
  value,
  valueClass,
  sub,
  accentClass,
}: SummaryCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70',
        'shadow-[0_1px_3px_0_rgb(15_23_42_/_0.06)] transition-shadow duration-200',
        'hover:shadow-[0_12px_28px_-6px_rgb(15_23_42_/_0.10)]',
        accentClass
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-xl',
            TONE[tone]
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">
          {label}
        </span>
      </div>

      <div
        data-slot="kpi-value"
        className={cn(
          'text-[32px] font-bold text-zinc-900 leading-none tracking-tight truncate',
          valueClass
        )}
      >
        {value}
      </div>

      {sub && <div className="text-xs">{sub}</div>}
    </div>
  );
}
