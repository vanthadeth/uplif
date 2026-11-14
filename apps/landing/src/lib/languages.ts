/** The landing page speaks English and Khmer for now; more follow the console's language list once reviewed. */
export const isLocale = (v: unknown): v is string => typeof v === "string" && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v);
