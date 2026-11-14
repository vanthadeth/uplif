"use client";
import { Layers, Tag, Truck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SetupLink } from "@/components/setup-link";

export default function MenuPage() {
  const { t } = useI18n();
  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{t("sk.menu.title")}</h1>
      <h2 className="caps text-xs font-bold text-muted">{t("sk.menu.catalogue")}</h2>
      <SetupLink href="/brands" icon={Tag} title="sk.home.brands" />
      <SetupLink href="/categories" icon={Layers} title="sk.home.cat" />
      <SetupLink href="/suppliers" icon={Truck} title="sk.home.sup" />
    </main>
  );
}
