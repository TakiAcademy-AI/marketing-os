'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Radio,
  BookOpen,
  Wallet,
  Users,
  Inbox,
  Activity,
  Package,
  Newspaper,
  FolderKanban,
  Zap,
  Globe,
  Table2,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import type { SessionData } from '@/lib/auth/session-config';
import { isPathDeniedForGuest, type UserRole } from '@/lib/auth/roles';
import { UserMenu } from './user-menu';

const BASE_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/briefs', label: 'Xưởng nội dung', icon: Inbox },
  { href: '/channels', label: 'Kênh', icon: Radio },
  { href: '/ads', label: 'Quảng cáo', icon: Zap },
  { href: '/landing-pages', label: 'Landing Pages', icon: Globe },
  { href: '/library', label: 'Thư viện', icon: BookOpen },
  { href: '/skills', label: 'Thư viện Skill', icon: Package },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/revenue', label: 'Doanh thu', icon: Wallet },
  { href: '/lark-base', label: 'Dashboard Lark', icon: Table2 },
  { href: '/news', label: 'Tin tức AI', icon: Newspaper },
];

const ADMIN_ITEMS = [
  { href: '/team', label: 'Quản lý team', icon: Users },
  { href: '/cron-logs', label: 'Lịch sử cron', icon: Activity },
  { href: '/rewrite-history', label: 'Lịch sử dùng AI', icon: ScrollText },
];

interface SidebarProps {
  user: SessionData;
  role: UserRole;
}

export function SidebarNav({ user, role }: SidebarProps) {
  const pathname = usePathname();
  // Gộp menu admin nếu user là admin — non-admin sẽ không thấy link "Quản lý team"
  const withAdmin =
    role === 'admin' ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;
  // Khách: ẩn luôn các trang bị cấm (proxy vẫn chặn nếu gõ URL trực tiếp).
  const NAV_ITEMS =
    role === 'guest'
      ? withAdmin.filter((item) => !isPathDeniedForGuest(item.href))
      : withAdmin;

  return (
    <aside className="flex flex-col w-60 shrink-0 min-h-screen bg-white/80 backdrop-blur-xl border-r border-zinc-200/80 py-5">
      {/* Dấu thương hiệu: khối gradient + chữ gradient. Đây là chỗ DUY NHẤT
          dùng gradient đậm — rải khắp nơi sẽ làm bảng số liệu khó đọc. */}
      <div className="px-4 mb-7 flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-8 items-center justify-center rounded-xl bg-brand-gradient shadow-sm"
        >
          <Sparkles className="size-4 text-white" />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-brand-gradient">
          Marketing OS
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 flex-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200',
                isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-zinc-600 font-medium hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              {/* Thanh chỉ mục mục đang chọn. Dùng khối riêng thay vì border-l
                  để chữ không bị xê dịch 2px khi đổi trang. */}
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-brand-gradient transition-all duration-200',
                  isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'
                )}
              />
              <Icon
                className={cn(
                  'size-[18px] shrink-0 transition-colors',
                  isActive ? 'text-brand-600' : 'text-zinc-400 group-hover:text-zinc-600'
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2.5 pt-3 mt-3 border-t border-zinc-200/80 space-y-2">
        <UserMenu user={user} />
        <p className="px-2 text-[11px] text-zinc-400">v1.0 · MVP</p>
      </div>
    </aside>
  );
}
