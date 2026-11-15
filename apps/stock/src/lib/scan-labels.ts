import type { MessageKey } from "@/lib/messages";

/** The scanner dialog's texts, taken from the app's own strings. */
export const scanLabels = (t: (k: MessageKey) => string) => ({
  title: t("sk.scan.title"), close: t("sk.close"), cancel: t("sk.cancel"), starting: t("sk.scan.starting"),
  aim: t("sk.scan.aim"), denied: t("sk.scan.denied"), unsupported: t("sk.scan.unsupported"),
});
