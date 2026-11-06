import { ReminSkeleton } from '@/components/remin/skeleton';

export default function EmailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 animate-pulse">
        <div className="h-6 w-32 rounded-md bg-zinc-200" />
        <div className="h-4 w-96 max-w-full rounded-md bg-zinc-100" />
      </div>
      <ReminSkeleton />
    </div>
  );
}
