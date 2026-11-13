import { Suspense } from "react";
import { AppsSection } from "@/components/apps-section";
import { Hero } from "@/components/hero";
import { Pricing, PricingSkeleton } from "@/components/pricing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadPlans } from "@/lib/plans";

// The public page is built once and refreshed hourly, so price changes in the plans table show up without a deploy.
export const revalidate = 3600;

async function PricingFromPlans() {
  const { plans, live } = await loadPlans();
  return <Pricing plans={plans} live={live} />;
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-ground">
      <SiteHeader />
      <main>
        <Hero />
        <AppsSection />
        <Suspense fallback={<PricingSkeleton />}><PricingFromPlans /></Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
