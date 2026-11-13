"use client";
import { APPS, AppTile, Badge, InView, type AppKey } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

// The apps shown on the page, in order. Names and whether an app is built come from the shared app registry,
// so this list never disagrees with the in-app app list. Admin and Platform are not product pages.
const SHOWN: { key: AppKey; blurb: MessageKey }[] = [
  { key: "me", blurb: "lp.app.me" },
  { key: "time", blurb: "lp.app.time" },
  { key: "go", blurb: "lp.app.go" },
  { key: "orders", blurb: "lp.app.orders" },
  { key: "stock", blurb: "lp.app.stock" },
];

function Icon({ name }: { name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/apps/${name}.svg`} alt="" width={56} height={56} className="size-14 rounded-card" />;
}

export function AppsSection() {
  const { t } = useI18n();
  return (
    <section id="apps" className="mx-auto max-w-(--content-max) scroll-mt-20 px-4 py-12 sm:px-8">
      <InView><h2 className="mb-8 text-balance text-center text-2xl font-bold sm:text-3xl">{t("lp.apps.title")}</h2></InView>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHOWN.map(({ key, blurb }, i) => {
          const app = APPS.find((a) => a.key === key)!;
          return (
            <li key={key}>
              <InView delay={i * 50} className="h-full">
                <AppTile icon={<Icon name={key} />} name={app.name} blurb={t(blurb)}
                  badge={app.built ? undefined : <Badge tone="neutral">{t("lp.apps.soon")}</Badge>} />
              </InView>
            </li>
          );
        })}
        <li>
          <InView delay={SHOWN.length * 50} className="h-full">
            <AppTile soon icon={<><Icon name="pos" /><Icon name="sites" /></>} name={t("lp.app.more")} blurb={t("lp.app.moreBody")} />
          </InView>
        </li>
      </ul>
    </section>
  );
}
