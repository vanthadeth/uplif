-- Migration 5: the platform's rls_auto_enable() event-trigger helper must not be callable through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
