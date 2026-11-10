"use client";

/** Thin bar under the top edge while a page change is in flight. Pure CSS, so it is instant. */
export function NavProgress({ active }: { active: boolean }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full w-1/3 animate-[uplif-bar_1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}
