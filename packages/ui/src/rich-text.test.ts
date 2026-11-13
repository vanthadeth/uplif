import { describe, expect, it } from "vitest";
import { plainToHtml, richPlainText, sanitizeRich, toRichHtml } from "./rich-text";

describe("sanitizeRich", () => {
  it("keeps the allowed formatting", () => {
    expect(sanitizeRich("<h2>Rules</h2><p>Be <b>kind</b> and <i>fair</i></p><ul><li>One</li></ul>"))
      .toBe("<h2>Rules</h2><p>Be <strong>kind</strong> and <em>fair</em></p><ul><li>One</li></ul>");
  });
  it("drops scripts with their content and event handlers", () => {
    expect(sanitizeRich('<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>')).toBe("<p>Hi</p>");
    expect(sanitizeRich("<style>p{}</style><iframe src=//evil></iframe>ok")).toBe("ok");
  });
  it("refuses unsafe link addresses, including disguised ones", () => {
    expect(sanitizeRich('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRich('<a href="jav&#x61;script:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRich('<a href=" \tJaVaScRiPt:alert(1)">x</a>')).toBe("x");
    expect(sanitizeRich('<a href="data:text/html,<script>">x</a>')).toBe("x");
  });
  it("keeps safe links and adds rel and target", () => {
    expect(sanitizeRich('<a href="https://example.com/a?b=1&c=2" style="x">Site</a>'))
      .toBe('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Site</a>');
    expect(sanitizeRich('<a href="tel:+85512345678">Call</a>')).toContain('href="tel:+85512345678"');
  });
  it("closes what was left open and ignores stray closers", () => {
    expect(sanitizeRich("<p><strong>a</p></em>b")).toBe("<p><strong>a</strong></p>b");
  });
  it("escapes a stray angle bracket", () => {
    expect(sanitizeRich("<p>1 < 2 > 0</p>")).toBe("<p>1 &lt; 2 &gt; 0</p>");
  });
  it("turns div into paragraphs", () => {
    expect(sanitizeRich("<div>a</div><div>b</div>")).toBe("<p>a</p><p>b</p>");
  });
});

describe("old plain text", () => {
  it("becomes paragraphs and escapes markup", () => {
    expect(plainToHtml("Line one\nline two\n\nSecond <b>para</b>")).toBe("<p>Line one<br>line two</p><p>Second &lt;b&gt;para&lt;/b&gt;</p>");
    expect(toRichHtml("Wear the uniform.")).toBe("<p>Wear the uniform.</p>");
  });
  it("tells empty editor content from real text", () => {
    expect(richPlainText("<p><br></p>")).toBe("");
    expect(richPlainText("<h2>Hi</h2><p>there</p>")).toBe("Hi there");
  });
});
