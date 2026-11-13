import { cn } from "./cn";
import { toRichHtml } from "./rich-text";

/** Shows a stored body (rich text, or older plain text) with the app's typography. The HTML is sanitized here, every time. */
export function RichText({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        "break-words leading-relaxed",
        "[&_p]:my-0 [&_p+p]:mt-3 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-bold",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-1",
        "[&_blockquote]:my-3 [&_blockquote]:border-s-4 [&_blockquote]:border-line-strong [&_blockquote]:ps-3 [&_blockquote]:text-muted",
        "[&_a]:text-link [&_a]:underline [&_:first-child]:mt-0",
        className,
      )}
      // eslint-disable-next-line react/no-danger -- sanitized by toRichHtml
      dangerouslySetInnerHTML={{ __html: toRichHtml(html) }}
    />
  );
}
