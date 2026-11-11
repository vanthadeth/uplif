"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Button, Card, CardBody, Input } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { LanguageRow, MyStats } from "@/lib/translation/types";
import { createLanguage, startMachine } from "../actions";
import { BackLink, Progress, useFill } from "../parts";

export function Community({ languages, stats }: { languages: LanguageRow[]; stats: MyStats }) {
  const { t } = useI18n();
  const f = useFill();
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ code: string; name: string; unavailable: boolean } | null>(null);
  const [native, setNative] = useState("");
  const [english, setEnglish] = useState("");
  const [code, setCode] = useState("");
  const total = languages[0]?.total ?? 0;
  const steps = [["tl.c.s1", "tl.c.s1b"], ["tl.c.s2", "tl.c.s2b"], ["tl.c.s3", "tl.c.s3b"]] as const;

  async function run(label: string, p: ReturnType<typeof createLanguage>, name: string) {
    setError(""); setNote(null); setBusy(label);
    const r = await p;
    setBusy("");
    if (!r.ok) return setError(t(r.error));
    setNote({ code: r.code, name, unavailable: r.status === "unavailable" });
    if (label === "new") { setNative(""); setEnglish(""); setCode(""); }
    router.refresh();
  }

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <BackLink href="/language" label={t("tl.title")} />
      <div>
        <h1 className="text-2xl font-bold">{t("tl.c.title")}</h1>
        <p className="mt-1 max-w-[62ch] text-muted">{t("tl.c.intro")}</p>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <Card className="h-full"><CardBody className="flex gap-3">
              <span className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft font-bold text-primary-ink">{i + 1}</span>
              <div><b className="block">{t(title)}</b><p className="m-0 text-[13px] leading-relaxed text-muted">{t(body)}</p></div>
            </CardBody></Card>
          </li>
        ))}
      </ol>

      <h2 className="m-0 text-[15px] font-semibold">{t("tl.c.yours")}</h2>
      <div className="grid grid-cols-3 gap-3">
        {([["tl.c.sug", stats.suggestions], ["tl.c.vote", stats.votes], ["tl.c.shown", stats.shown]] as const).map(([k, n]) => (
          <Card key={k}><CardBody><b className="block text-2xl tabular-nums">{n}</b><span className="text-[13px] text-muted">{t(k)}</span></CardBody></Card>
        ))}
      </div>

      {error && <p role="alert" className="m-0 rounded-card bg-danger-soft p-4 text-danger-ink">{error}</p>}
      {busy && <p role="status" className="m-0 rounded-card bg-primary-soft p-4 text-primary-ink">{t("tl.creatingBody").replace("{total}", String(total))}</p>}
      {note && (
        <div role="status" className="flex flex-col gap-3 rounded-card bg-primary-soft p-4 text-primary-ink">
          <b>{note.unavailable ? note.name : f("tl.ready", { name: note.name })}</b>
          <p className="m-0">{note.unavailable ? t("tl.c.noLangs") : f("tl.readyBody", { count: total })}</p>
          <div><Button variant="primary" onClick={() => router.push(`/language/${note.code}`)}>{t("tl.openWork")}</Button></div>
        </div>
      )}

      <h2 className="m-0 text-[15px] font-semibold">{t("tl.c.langs")}</h2>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-0">
        {languages.filter((l) => !l.is_source).map((l) => {
          const none = (l.machine_status === "none" || l.machine_status === "unavailable") && l.pinned + l.voted + l.machine === 0;
          return (
            <li key={l.code}>
              <Card className="h-full"><CardBody className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div><b lang={l.code} className="block text-lg">{l.native_name}</b><span lang="en" className="text-[13px] text-muted">{l.english_name}</span></div>
                  {l.is_reviewer ? <Badge2 tone="bg-primary-soft text-primary-ink" icon={<ShieldCheck className="size-3.5" aria-hidden="true" />}>{t("tl.c.youReview")}</Badge2>
                    : none ? <Badge2 tone="bg-neutral-soft text-ink-2" icon={<Clock className="size-3.5" aria-hidden="true" />}>{t("tl.tag.none")}</Badge2>
                    : l.reviewer_name ? <Badge2 tone="bg-primary-soft text-primary-ink" icon={<ShieldCheck className="size-3.5" aria-hidden="true" />}>{t("tl.tag.reviewer")}</Badge2>
                    : <Badge2 tone="bg-warning-soft text-warning-ink" icon={<Bot className="size-3.5" aria-hidden="true" />}>{t("tl.tag.machine")}</Badge2>}
                </div>
                {none ? <div className="h-2 rounded-full bg-neutral-soft" /> : <Progress l={l} />}
                <div className="mt-auto flex gap-2">
                  {none
                    ? <Button variant="primary" className="flex-1" disabled={!!busy} onClick={() => run(l.code, startMachine(l.code, l.english_name), l.native_name)}>{t("tl.start")}</Button>
                    : <Button variant="primary" className="flex-1" onClick={() => router.push(`/language/${l.code}`)}><Pencil className="size-[18px]" aria-hidden="true" />{t("tl.c.continue")}</Button>}
                  {l.is_reviewer && <Button className="flex-1" onClick={() => router.push(`/language/${l.code}/review`)}>{t("tl.c.review")}</Button>}
                </div>
              </CardBody></Card>
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4"
        onSubmit={(e) => { e.preventDefault(); void run("new", createLanguage(code, native, english), native); }}
      >
        <div><b className="block">{t("tl.c.addTitle")}</b><span className="text-[13px] text-muted">{f("tl.c.addBody", { total })}</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label={t("tl.c.name")} value={native} onChange={(e) => setNative(e.target.value)} maxLength={60} required />
          <Input label={t("tl.c.nameEn")} value={english} onChange={(e) => setEnglish(e.target.value)} maxLength={60} />
          <Input label={t("tl.c.code")} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} maxLength={12} required autoCapitalize="none" spellCheck={false} />
        </div>
        <div><Button type="submit" loading={busy === "new"} disabled={!!busy}><Plus className="size-[18px]" aria-hidden="true" />{t("tl.c.addBtn")}</Button></div>
      </form>
    </div>
  );
}

function Badge2({ tone, icon, children }: { tone: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{icon}{children}</span>;
}
