"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { Button, Card, CardBody, Input, Select, Toggle, useToast } from "@uplif/ui";
import type { Database } from "@uplif/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

type Settings = Database["public"]["Functions"]["get_attendance_settings"]["Returns"];
type Mode = Settings["geofence_mode"];

export function AttendanceSettingsView({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(settings.geofence_mode);
  const [radius, setRadius] = useState(String(settings.default_radius_m));
  const [dayStart, setDayStart] = useState(String(settings.day_start_hour));
  const [noSelfie, setNoSelfie] = useState(settings.allow_without_selfie);
  const [busy, setBusy] = useState(false);
  const fill = (s: string, v: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

  async function save() {
    const r = Number(radius), d = Number(dayStart);
    if (!Number.isInteger(r) || r < 20 || r > 5000) return toast("error", t("branches.error.radius"));
    if (!Number.isInteger(d) || d < 0 || d > 12) return toast("error", t("common.saveError"));
    setBusy(true);
    const { error } = await createClient().rpc("save_attendance_settings", { p_geofence_mode: mode, p_default_radius_m: r, p_day_start_hour: d, p_allow_without_selfie: noSelfie });
    setBusy(false);
    if (error) return toast("error", error.message.includes("module not in plan") ? t("att.moduleOff") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("att.saved"));
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">{t("att.title")}</h1>
        <p className="mt-1 max-w-[62ch] text-muted">{t("att.subtitle")}</p>
      </div>
      <Card><CardBody className="flex flex-col gap-5">
        <Select label={t("att.geofence")} hint={t("att.geofenceHint")} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="flag">{t("att.geofence.flag")}</option>
          <option value="block">{t("att.geofence.block")}</option>
          <option value="off">{t("att.geofence.off")}</option>
        </Select>
        <Input label={t("att.radius")} hint={t("att.radiusHint")} inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <Input label={t("att.dayStart")} hint={t("att.dayStartHint")} inputMode="numeric" value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
        <div className="flex flex-col gap-1">
          <Toggle checked={noSelfie} onChange={setNoSelfie} label={t("att.noSelfie")} />
          <p className="text-[14px] text-muted">{t("att.noSelfieHint")}</p>
        </div>
        <div className="border-t border-line pt-4 text-muted">
          <b className="block text-ink">{fill(t("att.retention"), { n: settings.selfie_retention_days })}</b>
          {fill(t("att.retentionHint"), { max: settings.plan_retention_days })}
        </div>
        <div><Button variant="primary" loading={busy} onClick={save}>{t("att.save")}</Button></div>
      </CardBody></Card>
      <Card><CardBody className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div><b className="block">{t("att.staffApp")}</b><p className="text-muted">{t("att.staffAppBody")}</p></div>
      </CardBody></Card>
    </div>
  );
}
