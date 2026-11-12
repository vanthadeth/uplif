import { supabaseUrl } from "@uplif/supabase/env";

/**
 * Where the browser goes to sign in with Telegram, or to link Telegram to the signed-in user (pass the ticket from
 * start_telegram_link()). The Supabase function sends the person back to THIS app: it only accepts apps that are
 * listed in its APP_URLS secret.
 */
export function telegramLoginUrl(opts: { next?: string; ticket?: string; origin?: string } = {}): string {
  const q = new URLSearchParams({ app: opts.origin ?? location.origin, next: opts.next ?? "/" });
  if (opts.ticket) q.set("link", opts.ticket);
  return `${supabaseUrl}/functions/v1/telegram-login?${q.toString()}`;
}
