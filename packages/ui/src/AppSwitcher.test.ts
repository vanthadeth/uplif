import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSwitcher, appSwitcherText } from "./AppSwitcher";
import type { SwitcherData } from "./apps";

const data: SwitcherData = {
  modules: ["attendance"], permissions: ["org.member.update", "sales.customer.read"],
  companies: [{ id: "m1", name: "Sunrise Trading", nameLocal: "ព្រះអាទិត្យរះ", active: true }, { id: "m2", name: "Angkor Brew", nameLocal: null, active: false }],
};
const render = (props: Partial<Parameters<typeof AppSwitcher>[0]> & { current: "admin" | "me" }) =>
  renderToStaticMarkup(h(AppSwitcher, { data: null, ...props }));

describe("AppSwitcher", () => {
  it("shows a loading skeleton, not a button, until data arrives", () => {
    const html = render({ current: "admin" });
    expect(html).toContain("aria-busy");
    expect(html).not.toContain("<button");
  });
  it("shows the open app and company on a button when there is something to switch to", () => {
    const html = render({ current: "admin", data });
    expect(html).toContain("<button");
    expect(html).toContain("UPLIF Admin");
    expect(html).toContain("Sunrise Trading");
  });
  it("uses the local company name for non-English languages", () => {
    expect(render({ current: "admin", data, locale: "km" })).toContain("ព្រះអាទិត្យរះ");
  });
  it("becomes a plain label with one app and one company", () => {
    const one: SwitcherData = { modules: [], permissions: [], companies: [data.companies[0]] };
    const html = render({ current: "me", data: one });
    expect(html).not.toContain("<button");
    expect(html).toContain("UPLIF Me");
  });
  it("builds labels and blurbs from an app's translator", () => {
    const { labels, blurbs } = appSwitcherText((k) => `x:${k}`);
    expect(labels.soon).toBe("x:sw.soon");
    expect(blurbs.go).toBe("x:app.go.blurb");
  });
});
