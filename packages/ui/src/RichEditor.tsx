"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { cn } from "./cn";
import { sanitizeRich, toRichHtml } from "./rich-text";

export interface RichEditorLabels {
  bold: string; italic: string; underline: string; heading: string; bullets: string; numbers: string; link: string; linkUrl: string; linkApply: string;
}

/**
 * A small rich text editor: bold, italic, underline, heading, bullet and numbered lists, links.
 * `value` is read once when the editor mounts (give it a new `key` to load another text); changes come out through
 * `onChange` as sanitized HTML. Pasted content is cleaned the same way.
 */
export function RichEditor({ label, value, onChange, labels, hint, minHeight = 200, className }: {
  label: string; value: string; onChange: (html: string) => void; labels: RichEditorLabels; hint?: string; minHeight?: number; className?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("https://");
  const [active, setActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (box.current) box.current.innerHTML = toRichHtml(value);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older browsers */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);

  const emit = () => { if (box.current) onChange(sanitizeRich(box.current.innerHTML)); };
  const refresh = () => {
    const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
    setActive({ bold: q("bold"), italic: q("italic"), underline: q("underline"), ul: q("insertUnorderedList"), ol: q("insertOrderedList") });
  };
  function run(cmd: string, arg?: string) {
    box.current?.focus();
    document.execCommand(cmd, false, arg);
    emit(); refresh();
  }
  function heading() {
    box.current?.focus();
    const on = document.queryCommandValue("formatBlock").toLowerCase() === "h2";
    document.execCommand("formatBlock", false, on ? "p" : "h2");
    emit();
  }
  function startLink() {
    const sel = window.getSelection();
    saved.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinking(true);
  }
  function applyLink() {
    const sel = window.getSelection();
    box.current?.focus();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    const href = url.trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(href) && href.length > 8) {
      if (sel && sel.isCollapsed) document.execCommand("insertHTML", false, `<a href="${href.replace(/"/g, "&quot;")}">${href.replace(/</g, "&lt;")}</a>`);
      else document.execCommand("createLink", false, href);
      emit();
    }
    setLinking(false); setUrl("https://");
  }

  const btn = (on: boolean) => cn("grid size-10 shrink-0 place-items-center rounded-control text-ink-2 transition-colors hover:bg-ground", on && "bg-primary-soft text-link");
  const tool = (key: string, text: string, Icon: typeof Bold, onClick: () => void, on = false) => (
    <button key={key} type="button" title={text} aria-label={text} aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={btn(on)}><Icon className="size-[18px]" aria-hidden /></button>
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={`${id}-l`} className="text-[14px] font-semibold text-ink-2">{label}</span>
      <div className="overflow-hidden rounded-control border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <div role="toolbar" aria-label={label} className="flex flex-wrap items-center gap-0.5 border-b border-line bg-ground/60 p-1">
          {tool("b", labels.bold, Bold, () => run("bold"), active.bold)}
          {tool("i", labels.italic, Italic, () => run("italic"), active.italic)}
          {tool("u", labels.underline, Underline, () => run("underline"), active.underline)}
          {tool("h", labels.heading, Heading2, heading)}
          {tool("ul", labels.bullets, List, () => run("insertUnorderedList"), active.ul)}
          {tool("ol", labels.numbers, ListOrdered, () => run("insertOrderedList"), active.ol)}
          {tool("a", labels.link, Link2, startLink)}
        </div>
        {linking && (
          <div className="flex items-center gap-2 border-b border-line bg-ground/60 p-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label={labels.linkUrl} inputMode="url" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinking(false); }}
              className="h-10 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-base" />
            <button type="button" onClick={applyLink} className="h-10 shrink-0 rounded-control bg-primary px-4 font-semibold text-white">{labels.linkApply}</button>
          </div>
        )}
        <div
          ref={box} role="textbox" aria-multiline="true" aria-labelledby={`${id}-l`} contentEditable suppressContentEditableWarning
          style={{ minHeight }} onInput={emit} onKeyUp={refresh} onMouseUp={refresh} onBlur={emit}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData("text/html");
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertHTML", false, html ? sanitizeRich(html) : toRichHtml(text));
            emit();
          }}
          className="px-3 py-2 leading-relaxed outline-none [&_a]:text-link [&_a]:underline [&_blockquote]:border-s-4 [&_blockquote]:ps-3 [&_h2]:my-2 [&_h2]:text-lg [&_h2]:font-bold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-1 [&_ul]:list-disc [&_ul]:ps-6"
        />
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
