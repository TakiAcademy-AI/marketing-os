'use client';

// Chọn số ngày cho trang Email. Console mail chỉ tính theo "N ngày qua" (không có
// khoảng ngày tuỳ chỉnh), nên chỉ có 4 nút. URL: ?days=7|14|30|90.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const OPTIONS = [7, 14, 30, 90] as const;

export function EmailDaysPicker({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // isPending: đang lấy số kỳ mới từ console, phải hiện ra để bấm không trông như đơ.
  const [isPending, startTransition] = useTransition();

  function choose(days: number) {
    if (days === current) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('days', String(days));
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex items-center gap-2" aria-label="Khung thời gian" aria-busy={isPending}>
      <div
        className={cn(
          'inline-flex rounded-lg bg-zinc-100 p-0.5 transition-opacity',
          isPending && 'opacity-60'
        )}
      >
        {OPTIONS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => choose(days)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              days === current ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            {days} ngày
          </button>
        ))}
      </div>
      {isPending && (
        <span className="text-[11px] text-zinc-500" role="status">
          Đang tải số…
        </span>
      )}
    </div>
  );
}
