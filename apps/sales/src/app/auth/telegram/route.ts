import { telegramReturnRoute } from "@uplif/auth/server";
import { createClient } from "@uplif/supabase/server";

// Telegram sign-in return (shared logic in packages/auth): one-time token from the Supabase function -> session here.
// The (app) layout still demands the authenticator code afterwards, exactly as for Google.
export const GET = telegramReturnRoute(createClient);
