import { cn } from "./cn";

const sizes = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-base" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"];
  return chars.map((p) => Array.from(p)[0]).join("").toUpperCase();
}

export function Avatar({ name, src, size = "md" }: { name: string; src?: string; size?: keyof typeof sizes }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className={cn("rounded-full object-cover", sizes[size])} />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink", sizes[size])}
    >
      {initials(name)}
    </span>
  );
}
