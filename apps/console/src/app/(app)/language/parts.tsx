"use client";
import Link from "next/link";
import { ArrowLeft, Bot, Check, Pin } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/translation/api";
import type { LanguageRow, ShownKind } from "@/lib/translation/types";
import type { MessageKey } from "@/lib/messages";

export function useFill() {
  const { t } = useI18n();
  return (k: MessageKey, v: Record<string, string | number> = {}) => fill(t(k), v);
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 self-start rounded-control px-2 font-medium text-muted hover:bg-ground hover:text-ink">
      <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />{label}
    </Link>
  );
}

/** Pinned, voted and machine-only strings as one bar, with the three counts as text next to it. */
export function Progress({ l, legend = true }: { l: Pick<LanguageRow, "total" | "pinned" | "voted" | "machine">; legend?: boolean }) {
  const f = useFill();
  const pct = (n: number) => (l.total ? (n / l.total) * 100 : 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={`${l.pinned} / ${l.voted} / ${l.machine}`} className="flex h-2 overflow-hidden rounded-full bg-neutral-soft">
        <i className="block h-full bg-primary" style={{ width: `${pct(l.pinned)}%` }} />
        <i className="block h-full bg-[#9dbdf0] dark:bg-[#3a5ca8]" style={{ width: `${pct(l.voted)}%` }} />
        <i className="block h-full" style={{ width: `${pct(l.machine)}%`, background: "repeating-linear-gradient(135deg,var(--color-line-strong) 0 4px,transparent 4px 8px)" }} />
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>{f("tl.lg.pin", { count: l.pinned })}</span><span>{f("tl.lg.vote", { count: l.voted })}</span><span>{f("tl.lg.mac", { count: l.machine })}</span>
        </div>
      )}
    </div>
  );
}

const kindStyle: Record<ShownKind, { cls: string; Icon: typeof Pin; label: MessageKey; body: MessageKey }> = {
  pin: { cls: "bg-primary-soft text-primary-ink", Icon: Pin, label: "tl.why.pin", body: "tl.why.pinBody" },
  top: { cls: "bg-success-soft text-success-ink", Icon: Check, label: "tl.why.top", body: "tl.why.topBody" },
  mac: { cls: "bg-warning-soft text-warning-ink", Icon: Bot, label: "tl.why.mac", body: "tl.why.macBody" },
};
export const kindBody = (k: ShownKind) => kindStyle[k].body;

/** Why the shown text is shown. Always a word and an icon, never colour alone. */
export function KindBadge({ kind, prefix }: { kind: ShownKind; prefix?: string }) {
  const { t } = useI18n();
  const { cls, Icon, label } = kindStyle[kind];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="size-3.5" aria-hidden="true" />{prefix ? `${prefix} · ` : ""}{t(label)}
    </span>
  );
}

/** Highlights {tokens} so people see what must stay unchanged. */
export function Tokens({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{[A-Za-z0-9_]+\})/g).map((p, i) =>
        /^\{.+\}$/.test(p)
          ? <span key={i} className="mx-0.5 inline-block rounded-md bg-warning-soft px-1.5 font-mono text-xs text-warning-ink">{p}</span>
          : <span key={i}>{p}</span>)}
    </>
  );
}
