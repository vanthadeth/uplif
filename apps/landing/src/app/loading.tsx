import { Skeleton } from "@uplif/ui";

// Shown while the page loads: a quiet outline of the header, headline and buttons.
export default function Loading() {
  return (
    <div className="min-h-dvh bg-ground" role="status" aria-label="Loading">
      <div className="h-16 border-b border-line bg-surface" />
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 pt-20">
        <Skeleton className="h-7 w-52 rounded-full" />
        <Skeleton className="h-14 w-full max-w-xl" />
        <Skeleton className="h-6 w-full max-w-lg" />
        <div className="flex gap-3"><Skeleton className="h-13 w-44" /><Skeleton className="h-13 w-36" /></div>
      </div>
    </div>
  );
}
