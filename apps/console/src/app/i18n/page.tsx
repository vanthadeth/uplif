import { en, km, type MessageKey } from "@/lib/messages";

// Review sheet for translators: every UI string with English and Khmer side by side.
export const metadata = { title: "UPLIF translation review" };

export default async function I18nReview({ searchParams }: { searchParams: Promise<{ missing?: string; q?: string }> }) {
  const sp = await searchParams;
  const keys = Object.keys(en) as MessageKey[];
  const missing = keys.filter((k) => !km[k]);
  const q = (sp.q ?? "").toLowerCase();
  const shown = keys.filter((k) =>
    (sp.missing !== "1" || !km[k]) &&
    (!q || k.toLowerCase().includes(q) || en[k].toLowerCase().includes(q) || (km[k] ?? "").includes(q)));
  return (
    <main className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-bold">Translation review</h1>
      <p className="text-muted">
        {keys.length} strings, {keys.length - missing.length} translated, {missing.length} missing. Khmer strings are drafts until the Khmer reviewer approves them.
      </p>
      <form method="get" className="my-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[14px] font-semibold">Search
          <input name="q" defaultValue={sp.q ?? ""} className="h-(--control-h) rounded-control border border-line-strong bg-surface px-3 font-normal" />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" name="missing" value="1" defaultChecked={sp.missing === "1"} /> Only missing Khmer</label>
        <button className="h-(--control-h) rounded-control border border-primary bg-primary px-4 font-semibold text-white">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-start">
          <thead className="bg-ground text-start text-[14px] text-ink-2">
            <tr><th className="p-3 text-start">Key</th><th className="p-3 text-start">English (source)</th><th className="p-3 text-start">ខ្មែរ (draft)</th></tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k} className="border-t border-line align-top">
                <td className="p-3"><code className="text-xs text-muted">{k}</code></td>
                <td className="p-3" lang="en">{en[k]}</td>
                <td className="p-3" lang="km">{km[k] ?? <span className="text-danger-ink">missing</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
