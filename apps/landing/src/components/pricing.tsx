"use client";
import { ButtonLink, InView, PlanCard, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { startUrl } from "@/lib/links";
import { money, type PublicPlan } from "@/lib/plans";
import type { MessageKey } from "@/lib/messages";

const moduleKeys: Record<string, MessageKey> = {
  attendance: "lp.mod.attendance",
  field_sales: "lp.mod.field_sales",
  inventory: "lp.mod.inventory",
  invoice: "lp.mod.invoice",
};

function Frame({ children, note }: { children: React.ReactNode; note?: string }) {
  const { t } = useI18n();
  return (
    <section id="pricing" className="mx-auto max-w-(--content-max) scroll-mt-20 px-4 pb-20 pt-12 sm:px-8">
      <InView><h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">{t("lp.pricing.title")}</h2></InView>
      {children}
      {note && <p role="status" className="mt-4 text-center text-muted">{note}</p>}
      <div className="mt-8 text-center">
        <ButtonLink href={startUrl} variant="primary" size="lg">{t("lp.cta.startPlan")}</ButtonLink>
      </div>
    </section>
  );
}

/** Price cards from the plans table. The last plan (the highest price) is outlined as the one most teams pick. */
export function Pricing({ plans, live }: { plans: PublicPlan[]; live: boolean }) {
  const { t } = useI18n();
  const count = (kind: "companies" | "branches" | "users", n: number) => t(`lp.plan.${kind}.${n === 1 ? "one" : "other"}` as MessageKey, { n });
  return (
    <Frame note={live ? undefined : t("lp.pricing.failed")}>
      <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-5">
        {plans.map((p, i) => {
          const limits = [count("companies", p.max_companies), p.max_branches ? count("branches", p.max_branches) : null, count("users", p.max_users)]
            .filter(Boolean).join(", ");
          const modules = p.modules.map((m) => (moduleKeys[m] ? t(moduleKeys[m]) : m));
          const monthly = p.price_month_cents !== null;
          return (
            <li key={p.code} className="w-full max-w-sm flex-1 basis-72">
              <InView delay={i * 80} className="h-full">
                <PlanCard
                  name={p.name}
                  price={money(monthly ? p.price_month_cents! : p.price_year_cents)}
                  period={monthly ? t("lp.plan.month") : undefined}
                  altPrice={monthly ? t("lp.plan.year", { price: money(p.price_year_cents) }) : t("lp.plan.yearOnly", { price: money(p.price_year_cents) })}
                  features={[limits, ...modules]}
                  highlight={plans.length > 1 && i === plans.length - 1}
                />
              </InView>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

/** Shown while the price list streams in. */
export function PricingSkeleton() {
  return (
    <Frame>
      <div aria-hidden="true" className="mx-auto flex max-w-3xl flex-wrap justify-center gap-5">
        {[0, 1].map((i) => (
          <div key={i} className="flex w-full max-w-sm flex-1 basis-72 flex-col gap-3 rounded-card border border-line bg-surface p-7">
            <Skeleton className="h-6 w-24" /><Skeleton className="h-10 w-32" /><Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </Frame>
  );
}
