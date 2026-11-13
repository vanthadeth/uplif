/**
 * Rich text for company-written content (policies, code of conduct, playbook steps).
 * Content is stored as a small, safe subset of HTML. Everything that is not on the list below is removed, both when
 * it is saved and again when it is shown, so a pasted or hand-written page can never run a script or load a remote file.
 * Text written before rich text existed is plain text; `toRichHtml` turns it into paragraphs.
 * This file has no DOM dependency, so it runs in the browser, on the server and in tests.
 */

const KEEP = new Set(["p", "br", "strong", "em", "u", "h2", "h3", "ul", "ol", "li", "blockquote", "a"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", h1: "h2", h4: "h3", h5: "h3", h6: "h3", div: "p" };
const VOID = new Set(["br"]);
/** Tags whose whole content is dropped, not just the tag. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "textarea", "title"]);

const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|colon|tab|newline);?/gi, (_, n: string) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" })[n.toLowerCase()] ?? "");
}
function safeChar(n: number): string {
  return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
}
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Only http, https, mailto and tel links survive; the check runs on the decoded value, as a browser would read it. */
function safeHref(raw: string): string | null {
  const v = decode(raw).replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "");
  return /^(https?:\/\/|mailto:|tel:)/i.test(v) ? decode(raw).trim() : null;
}
function hrefOf(attrs: string): string | null {
  const m = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  return m ? safeHref(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

export function sanitizeRich(html: string): string {
  let out = "";
  const stack: string[] = [];
  let dropping: string | null = null;
  let dropDepth = 0;
  for (const m of html.matchAll(TOKEN)) {
    const tok = m[0];
    const name = m[1]?.toLowerCase();
    if (tok.startsWith("<!--")) continue;
    if (dropping) {
      if (name === dropping) {
        if (tok.startsWith("</")) { if (--dropDepth === 0) dropping = null; }
        else if (!tok.endsWith("/>")) dropDepth++;
      }
      continue;
    }
    if (!name) { out += tok === "<" ? "&lt;" : tok.replace(/>/g, "&gt;"); continue; }
    if (DROP.has(name)) { if (!tok.startsWith("</") && !tok.endsWith("/>")) { dropping = name; dropDepth = 1; } continue; }
    const tag = RENAME[name] ?? name;
    if (!KEEP.has(tag)) continue;
    if (tok.startsWith("</")) {
      if (VOID.has(tag)) continue;
      const at = stack.lastIndexOf(tag);
      if (at < 0) continue;
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }
    if (VOID.has(tag)) { out += `<${tag}>`; continue; }
    if (tag === "a") {
      const href = hrefOf(m[2] ?? "");
      if (!href) continue; // a link without a safe address is just its text
      out += `<a href="${attr(href)}" target="_blank" rel="noopener noreferrer">`;
    } else out += `<${tag}>`;
    stack.push(tag);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

const looksRich = (s: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|div)[\s>]/i.test(s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text written before rich text existed, as paragraphs. */
export function plainToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Safe HTML for any stored body, old plain text or new rich text. */
export function toRichHtml(stored: string): string {
  return sanitizeRich(looksRich(stored) ? stored : plainToHtml(stored));
}

/** The visible text of a body; empty when the editor holds nothing. */
export function richPlainText(stored: string): string {
  return decode(toRichHtml(stored).replace(/<br>|<\/p>|<\/li>|<\/h[23]>/g, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
