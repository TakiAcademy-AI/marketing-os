'use client';

// Cấu hình kết nối REMIN. URL hiện giá trị thật để admin thấy đang trỏ đâu;
// token thì không — chỉ báo đã set hay chưa, nhập mới thì mới ghi đè.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  initialApiUrl: string;
  initialAdminUrl: string;
  tokenIsSet: boolean;
  /** true khi giá trị đang dùng đến từ biến môi trường chứ không phải DB. */
  usingEnvFallback: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

export function ReminForm({
  initialApiUrl,
  initialAdminUrl,
  tokenIsSet,
  usingEnvFallback,
  updatedAt,
  updatedByName,
}: Props) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [adminUrl, setAdminUrl] = useState(initialAdminUrl);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(tokenIsSet);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!apiUrl.trim() || !adminUrl.trim()) {
      toast.error('Cần điền cả API URL và Admin URL');
      return;
    }
    setBusy('save');
    try {
      const body: Record<string, string> = {
        apiUrl: apiUrl.trim(),
        adminUrl: adminUrl.trim(),
      };
      // Chỉ gửi token khi admin thật sự nhập mới — bỏ trống nghĩa là giữ
      // token cũ, để sửa URL không vô tình xoá token.
      if (token.trim()) body.mcpToken = token.trim();

      const res = await fetch('/api/settings/remin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        tokenSaved?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? 'Lưu thất bại');
        return;
      }
      if (data.tokenSaved) {
        setHasToken(true);
        setToken('');
      }
      // Nói rõ token có được lưu lần này không — tránh lặp lại ca cookie
      // Facebook: toast báo xanh trong khi thứ quan trọng không hề được gửi.
      toast.success(
        data.tokenSaved ? 'Đã lưu cấu hình REMIN + token' : 'Đã lưu URL REMIN (token giữ nguyên)'
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!window.confirm('Xoá cấu hình REMIN khỏi DB? Biến môi trường (nếu có) sẽ được dùng lại.')) {
      return;
    }
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/remin', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Xoá thất bại');
        return;
      }
      setHasToken(false);
      setToken('');
      toast.success('Đã xoá cấu hình REMIN trong DB');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const configured = Boolean(apiUrl && hasToken);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 shadow-[0_1px_3px_0_rgb(15_23_42_/_0.06)]">
      <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
        <ExternalLinkIcon className="size-4 text-brand-600" aria-hidden />
        REMIN
      </h2>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        Địa chỉ API/Admin của REMIN và token để Marketing OS gọi sang.
      </p>

      <div
        className={[
          'mb-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2',
          configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800',
        ].join(' ')}
      >
        {configured ? (
          <CheckCircleIcon className="size-4 shrink-0 mt-px" aria-hidden />
        ) : (
          <AlertCircleIcon className="size-4 shrink-0 mt-px" aria-hidden />
        )}
        <span>
          {configured
            ? `Đã cấu hình đủ${updatedByName ? ` · bởi ${updatedByName}` : ''} ${formatRelativeTime(updatedAt)}`
            : hasToken
              ? 'Thiếu API URL.'
              : 'Chưa có token — Marketing OS chưa gọi được sang REMIN.'}
          {usingEnvFallback && ' Đang dùng giá trị từ biến môi trường; lưu ở đây sẽ ghi đè.'}
        </span>
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div>
          <Label htmlFor="remin-api" className="text-xs">
            API URL
          </Label>
          <Input
            id="remin-api"
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.remin.ai"
            disabled={busy !== null}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="remin-admin" className="text-xs">
            Admin URL
          </Label>
          <Input
            id="remin-admin"
            type="url"
            value={adminUrl}
            onChange={(e) => setAdminUrl(e.target.value)}
            placeholder="https://admin.remin.ai"
            disabled={busy !== null}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="remin-token" className="text-xs">
            MCP token{' '}
            {hasToken ? (
              <span className="text-emerald-600 font-normal">✓ đã set — để trống nếu không đổi</span>
            ) : (
              <span className="text-amber-600 font-normal">⚠ chưa set</span>
            )}
          </Label>
          <Input
            id="remin-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? '(giữ nguyên token hiện tại)' : 'dán token REMIN cấp'}
            disabled={busy !== null}
            autoComplete="off"
            className="font-mono text-xs"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={busy !== null} className="cursor-pointer">
            {busy === 'save' && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
            Lưu
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={busy !== null}
            className="cursor-pointer"
          >
            {busy === 'delete' ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2Icon className="size-4" aria-hidden />
            )}
            Xoá
          </Button>
        </div>
      </form>
    </section>
  );
}
