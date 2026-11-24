-- UPLIF Go: conversation events can now be visits and calls. The next migration uses these values, so they are added first.
alter type public.customer_event_kind add value if not exists 'visit';
alter type public.customer_event_kind add value if not exists 'call';
