import { Skeleton } from "@uplif/ui";

/** Shown while a page loads, so the screen never flashes blank. */
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 p-4" aria-busy="true">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}
    </main>
  );
}
