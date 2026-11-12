import type { MessageKey } from "./messages";

/** The database refuses additions over the plan with the message "plan limit: users|branches|companies". */
export function planLimitKey(error: { message?: string } | null | undefined): MessageKey | null {
  const m = /^plan limit: (users|branches|companies)$/.exec(error?.message ?? "");
  return m ? (`plan.limit.${m[1]}` as MessageKey) : null;
}
