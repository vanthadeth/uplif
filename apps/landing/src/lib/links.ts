// Sign-up and sign-in live in the console (UPLIF Admin): the landing page only sends people there.
const admin = (process.env.NEXT_PUBLIC_URL_ADMIN ?? "https://uplif-console.vercel.app").replace(/\/$/, "");

/** New owner: sign in, then the existing "set up your business" wizard. */
export const startUrl = `${admin}/login?next=${encodeURIComponent("/companies/new")}`;
/** Returning user. */
export const signInUrl = `${admin}/login`;
