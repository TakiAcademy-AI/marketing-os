'use client';

// Cấu hình kết nối console hệ mail (trang /email). Cùng khuôn ReminForm: URL hiện
// giá trị thật, mã thì chỉ báo đã set hay chưa, nhập mới thì mới ghi đè.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircleIcon, CheckCircleIcon, Loader2Icon, MailIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  initialUrl: string;
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

export function MailConsoleForm({
  initialUrl,
  tokenIsSet,
  usingEnvFallback,
  updatedAt,
  updatedByName,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(tokenIsSet);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      toast.error('Cần điền URL console');
      return;
    }
    setBusy('save');
    try {
      const body: Record<string, string> = { url: url.trim() };
      // Bỏ trống mã = giữ mã cũ, để sửa URL không vô tình xoá mã.
      if (token.trim()) body.token = token.trim();

      const res = await fetch('/api/settings/mail-console', {
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
      toast.success(
        data.tokenSaved ? 'Đã lưu URL + mã console mail' : 'Đã lưu URL console mail (mã giữ nguyên)'
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!window.confirm('Xoá cấu hình console mail khỏi DB? Biến môi trường (nếu có) sẽ được dùng lại.')) {
      return;
    }
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/mail-console', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Xoá thất bại');
        return;
      }
      setHasToken(false);
      setToken('');
      toast.success('Đã xoá cấu hình console mail trong DB');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const configured = Boolean(url && hasToken);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 shadow-[0_1px_3px_0_rgb(15_23_42_/_0.06)]">
      <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
        <MailIcon className="size-4 text-brand-600" aria-hidden />
        Console mail
      </h2>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        Console vận hành hệ mail (mail.nguyentatkiem.com) và mã API chỉ đọc để trang Email lấy số.
        Mã do chủ hệ mail tạo trên srv-03, file <code>~/taki-mautic/.auto-ops-read-token</code>.
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
              ? 'Thiếu URL console.'
              : 'Chưa có mã — trang Email chưa lấy được số.'}
          {usingEnvFallback && ' Đang dùng giá trị từ biến môi trường; lưu ở đây sẽ ghi đè.'}
        </span>
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div>
          <Label htmlFor="mail-console-url" className="text-xs">
            URL console
          </Label>
          <Input
            id="mail-console-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mail.nguyentatkiem.com/console"
            disabled={busy !== null}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="mail-console-token" className="text-xs">
            Mã API chỉ đọc{' '}
            {hasToken ? (
              <span className="text-emerald-600 font-normal">✓ đã set — để trống nếu không đổi</span>
            ) : (
              <span className="text-amber-600 font-normal">⚠ chưa set</span>
            )}
          </Label>
          <Input
            id="mail-console-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? '(giữ nguyên mã hiện tại)' : 'dán mã 64 ký tự'}
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
