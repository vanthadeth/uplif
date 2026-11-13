"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, ScrollText, ShieldCheck } from "lucide-react";
import { HubTile, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";

interface Counts { tests: number | null; policies: number | null; conduct: number | null; policyTotal: number; conductTotal: number; testTotal: number }
const NONE: Counts = { tests: null, policies: null, conduct: null, policyTotal: 0, conductTotal: 0, testTotal: 0 };

/** The Learn landing page: what needs attention, then a tile for each part of Learn. */
export function LearnHub() {
  const { t } = useI18n();
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    let live = true;
    const db = createClient();
    void Promise.all([db.rpc("my_policies"), db.rpc("my_learn_tests")]).then(([p, tt]) => {
      if (!live) return;
      const pol = p.error ? [] : p.data;
      const tests = tt.error ? [] : tt.data;
      setC({
        tests: tt.error ? null : tests.filter((r) => r.status !== "passed").length,
        policies: p.error ? null : pol.filter((r) => r.kind === "policy" && !r.acknowledged_at).length,
        conduct: p.error ? null : pol.filter((r) => r.kind === "conduct" && !r.acknowledged_at).length,
        policyTotal: pol.filter((r) => r.kind === "policy").length,
        conductTotal: pol.filter((r) => r.kind === "conduct").length,
        testTotal: tests.length,
      });
    });
    return () => { live = false; };
  }, []);

  const k = c ?? NONE;
  const sub = (todo: number | null, total: number, todoKey: "st.learn.sub.todo" | "st.learn.todo") => {
    if (c === null || todo === null) return undefined;
    if (total === 0) return t("st.learn.sub.none");
    return todo > 0 ? fill(t(todoKey), { n: todo }) : t("st.learn.sub.allDone");
  };
  const attention = [
    k.tests ? { href: "/learn/tests", text: fill(t("st.learn.attn.tests"), { n: k.tests }) } : null,
    k.policies ? { href: "/learn/policies", text: fill(t("st.learn.attn.policies"), { n: k.policies }) } : null,
    k.conduct ? { href: "/learn/conduct", text: t("st.learn.attn.conduct") } : null,
  ].filter((x): x is { href: string; text: string } => x !== null);

  return (
    <div className="flex flex-col gap-5">
      {c === null ? <Skeleton className="h-20" /> : attention.length > 0 && (
        <section aria-label={t("st.learn.attention")} className="flex flex-col gap-2 rounded-card border border-warning/30 bg-warning-soft p-3 text-warning-ink">
          <h2 className="m-0 px-1 text-sm font-bold">{t("st.learn.attention")}</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {attention.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="flex min-h-11 items-center justify-between gap-2 rounded-control px-1 font-semibold hover:bg-white/50">
                  <span>{a.text}</span><ChevronRight className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <HubTile as={Link} href="/learn/tests" icon={<ClipboardCheck className="size-6" />} title={t("st.learn.tile.tests")} sub={sub(k.tests, k.testTotal, "st.learn.sub.todo")} alert={!!k.tests} />
        <HubTile as={Link} href="/learn/policies" icon={<ScrollText className="size-6" />} title={t("st.learn.tile.policies")} sub={sub(k.policies, k.policyTotal, "st.learn.todo")} alert={!!k.policies} />
        <HubTile as={Link} href="/learn/conduct" icon={<ShieldCheck className="size-6" />} title={t("st.learn.tile.conduct")} sub={sub(k.conduct, k.conductTotal, "st.learn.todo")} alert={!!k.conduct} />
      </div>
    </div>
  );
}
