import { Skeleton } from '@/components/ui/skeleton';

export const SkeletonCard = () => (
  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-[60%]" />
        <Skeleton className="h-3 w-[40%]" />
      </div>
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-[80%]" />
  </div>
);

export const SkeletonList = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl p-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-[70%]" />
          <Skeleton className="h-3 w-[50%]" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    ))}
  </div>
);

export const SkeletonChart = () => (
  <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-6 rounded-lg" />
      <Skeleton className="h-4 w-32" />
    </div>
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>
);
