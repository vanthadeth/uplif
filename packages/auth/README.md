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
