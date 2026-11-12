import { telegramReturnRoute } from "@uplif/auth/server";
import { createClient } from "@/lib/supabase/server";

// Telegram sign-in return (shared logic in packages/auth): one-time token from the Supabase function -> session here.
export const GET = telegramReturnRoute(createClient);
