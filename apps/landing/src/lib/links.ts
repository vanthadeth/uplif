// Sign-up and sign-in live in the console (UPLIF Admin): the landing page only sends people there.
// The console decides where each person goes after signing in: new people set up a business, people who
// already belong to companies see their company list, so both links use the same sign-in page.
const admin = (process.env.NEXT_PUBLIC_URL_ADMIN ?? "https://uplif-console.vercel.app").replace(/\/$/, "");

/** Create account and Log in both open the console sign-in; the console routes by the person's state. */
export const startUrl = `${admin}/login`;
export const signInUrl = `${admin}/login`;
