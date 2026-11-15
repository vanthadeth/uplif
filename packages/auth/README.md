# @uplif/auth

Sign-in that is shared by every UPLIF app. One person is one Supabase user, and can connect several ways to sign in
(Google, Telegram, phone) to it. Every app uses the same Supabase Auth project, so a link made in one app works in all
of them. Do not copy this code into an app; import it.

## What each app needs (the contract)

| Route | What it does | Code |
| --- | --- | --- |
| `/login` | Sign-in buttons | `startGoogleSignIn(next)`, `startTelegramSignIn(next)` |
| `/auth/callback` | Google return (Supabase code exchange) | already in each app |
| `/auth/telegram` | Telegram return | `export const GET = telegramReturnRoute(createClient)` from `@uplif/auth/server` |
| `/account` | Connect / disconnect methods | `<SignInMethods ...labels />` fed by `loadSignInMethods(supabase)` |

Plus: add `@uplif/auth` to the app's `transpilePackages`, and add the app's address to the Telegram function's
`APP_URLS` secret and to Supabase Auth's Redirect URLs (`https://<app>/**`).

## Rules that live in the database, not here
- A Telegram account belongs to one user (`telegram_links`).
- The last way to sign in cannot be removed (`unlink_telegram()` refuses; the panel disables Google's button).
- The Telegram admin key never leaves Supabase (Edge Function `telegram-login`).

## Single sign-on (sign in once, open every app)
Apps live on separate addresses, so they cannot share one cookie. UPLIF Admin (the console) is the **hub**:
1. A signed-out app's proxy sends the person to `/auth/sso/start`, which sets a random `state` cookie and goes to `<hub>/sso`.
2. The hub (signed in there, or after signing in) calls the Supabase function `sso-handoff` with the person's own token.
3. The function makes a one-time token for that same user and returns `<app>/auth/sso?token_hash&state&next`.
4. The app checks `state` against its cookie, turns the token into its own session and continues.
If anything fails the person lands on the app's normal `/login` (the fallback), so nobody is locked out.

To add an app: copy `apps/time/src/app/auth/sso/**`, make the proxy use `ssoEnabledFor` (see `apps/time/src/proxy.ts`),
set `NEXT_PUBLIC_SSO_HUB_URL=https://uplif-console.vercel.app` in its Vercel project, add its address to the function's
`SSO_APP_URLS` secret and to Supabase Auth Redirect URLs. **UPLIF Platform (super admin) is never on that list.**
