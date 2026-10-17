'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/team', label: 'KPI đội ngũ', match: (p: string) => p === '/team' },
  { href: '/team/feedback', label: 'Chat feedback', match: (p: string) => p === '/team/feedback' },
  {
    href: '/team/feedback/archive',
    label: 'Lưu trữ feedback',
    match: (p: string) => p.startsWith('/team/feedback/archive'),
  },
];

export function TeamTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-zinc-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            t.match(pathname)
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
