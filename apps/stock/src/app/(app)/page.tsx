"use client";
import { Layers, Tag, Truck, Warehouse } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SetupLink } from "@/components/setup-link";

export default function Home() {
  const { t } = useI18n();
  return (
    <main className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sk.home.title")}</h1>
        <p className="mt-1 text-muted">{t("sk.home.body")}</p>
      </div>
      <SetupLink href="/brands" icon={Tag} title="sk.home.brands" body="sk.home.brandsBody" />
      <SetupLink href="/categories" icon={Layers} title="sk.home.cat" body="sk.home.catBody" />
      <SetupLink href="/suppliers" icon={Truck} title="sk.home.sup" body="sk.home.supBody" />
      <SetupLink href="/locations" icon={Warehouse} title="sk.home.loc" body="sk.home.locBody" />
    </main>
  );
}
