// Prints idempotent SQL that syncs the source strings (and the bundled Khmer drafts) into the translation tables.
// Usage: node --experimental-strip-types apps/console/scripts/i18n-sql.mjs > supabase/migrations/<timestamp>_i18n_strings.sql
// Run it again as a new migration whenever strings are added or changed in src/lib/messages.ts.
import { en, km } from "../src/lib/messages.ts";

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const keys = Object.keys(en);
const out = [];
out.push("-- Source strings from apps/console/src/lib/messages.ts, and the bundled Khmer text as machine drafts.");
out.push("insert into public.i18n_strings (key, source_text, position) values");
out.push(keys.map((k, i) => `  (${q(k)}, ${q(en[k])}, ${i + 1})`).join(",\n"));
out.push("on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();");
out.push("");
const kmKeys = keys.filter((k) => km[k]);
out.push("insert into public.i18n_suggestions (language_code, string_key, text, origin)");
out.push("select 'km', v.key, v.text, 'machine' from (values");
out.push(kmKeys.map((k) => `  (${q(k)}, ${q(km[k])})`).join(",\n"));
out.push(") as v(key, text)");
out.push("where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);");
console.log(out.join("\n"));
