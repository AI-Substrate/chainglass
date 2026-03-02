import { Skeleton } from '@/components/ui/skeleton';

export function TerminalSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-2 bg-background p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <div className="flex-1" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}
