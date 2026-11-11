-- Translation community. Translations are global (shared by every company), so these tables hold no company data and
-- are kept apart from tenant tables. Nobody reads or writes them directly: RLS is on with no policies and every
-- privilege is revoked. All access goes through the security-definer functions below, which return display names
-- (first word of the profile name) and never user ids, and which hide vote counts from everyone except reviewers.

create table public.i18n_languages (
  code text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  native_name text not null check (length(btrim(native_name)) between 1 and 60),
  english_name text not null check (length(btrim(english_name)) between 1 and 60),
  date_tag text not null,
  featured boolean not null default false,
  is_source boolean not null default false,
  sort_order int not null default 100,
  machine_status text not null default 'none' check (machine_status in ('none', 'pending', 'done', 'unavailable')),
  machine_started_by uuid references auth.users (id) on delete set null,
  machine_started_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.i18n_strings (
  key text primary key,
  source_text text not null,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.i18n_suggestions (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references public.i18n_languages (code) on delete cascade,
  string_key text not null references public.i18n_strings (key) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  origin text not null check (origin in ('machine', 'user')),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, language_code, string_key)
);
create index i18n_suggestions_string_idx on public.i18n_suggestions (language_code, string_key);

-- One vote per user per string: the primary key is (user, language, string), so voting for another suggestion
-- of the same string moves the vote.
create table public.i18n_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  language_code text not null,
  string_key text not null,
  suggestion_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, language_code, string_key),
  foreign key (suggestion_id, language_code, string_key)
    references public.i18n_suggestions (id, language_code, string_key) on delete cascade
);
create index i18n_votes_suggestion_idx on public.i18n_votes (suggestion_id);

-- A reviewer's pin: shown text for a string no matter the votes, until unpinned.
create table public.i18n_pins (
  language_code text not null,
  string_key text not null,
  suggestion_id uuid not null,
  pinned_by uuid references auth.users (id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (language_code, string_key),
  foreign key (suggestion_id, language_code, string_key)
    references public.i18n_suggestions (id, language_code, string_key) on delete cascade
);

-- Reviewers are assigned by a maintainer (no self-service), per language.
create table public.i18n_reviewers (
  language_code text not null references public.i18n_languages (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (language_code, user_id)
);

alter table public.i18n_languages enable row level security;
alter table public.i18n_strings enable row level security;
alter table public.i18n_suggestions enable row level security;
alter table public.i18n_votes enable row level security;
alter table public.i18n_pins enable row level security;
alter table public.i18n_reviewers enable row level security;
revoke all on public.i18n_languages, public.i18n_strings, public.i18n_suggestions, public.i18n_votes,
  public.i18n_pins, public.i18n_reviewers from public, anon, authenticated;

insert into public.i18n_languages (code, native_name, english_name, date_tag, featured, is_source, sort_order, machine_status) values
  ('en', 'English', 'English', 'en-GB', true, true, 1, 'done'),
  ('km', 'ខ្មែរ', 'Khmer', 'km-KH', true, false, 2, 'done'),
  ('zh', '中文', 'Chinese', 'zh-CN', true, false, 3, 'none'),
  ('th', 'ไทย', 'Thai', 'th-TH', true, false, 4, 'none'),
  ('vi', 'Tiếng Việt', 'Vietnamese', 'vi-VN', true, false, 5, 'none'),
  ('lo', 'ລາວ', 'Lao', 'lo-LA', false, false, 6, 'none');

-- ---------- private helpers ----------
create function app.i18n_uid() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare u uuid := (select auth.uid());
begin
  if u is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  return u;
end $$;

create function app.i18n_is_reviewer(p_lang text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.i18n_reviewers r where r.language_code = p_lang and r.user_id = (select auth.uid()))
$$;

-- The {tokens} in a text, sorted and de-duplicated. A suggestion must keep exactly the tokens of its source.
create function app.i18n_tokens(p text) returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}'::text[]) from regexp_matches(p, '\{([A-Za-z0-9_]+)\}', 'g') as m
$$;

create function app.i18n_norm(p text) returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(p), '\s+', ' ', 'g'))
$$;

-- What every string shows, per language: the pinned suggestion, else the top voted one (ties go to the older
-- suggestion), else the machine draft, else nothing (the app then shows English).
create view app.i18n_state as
with vc as (
  select suggestion_id, count(*)::int as n from public.i18n_votes group by suggestion_id
), sug as (
  select s.id, s.language_code, s.string_key, s.origin, s.created_at, coalesce(vc.n, 0) as n
  from public.i18n_suggestions s left join vc on vc.suggestion_id = s.id
), rk as (
  select sug.*, row_number() over (partition by language_code, string_key order by n desc, created_at, id) as rn from sug
), mach as (
  select distinct on (language_code, string_key) language_code, string_key, id
  from sug where origin = 'machine' order by language_code, string_key, created_at, id
), cnt as (
  select language_code, string_key, count(*)::int as c from sug group by language_code, string_key
)
select l.code as language_code, st.key as string_key, st.source_text, st.position,
  case when p.suggestion_id is not null then 'pin' when t.n > 0 then 'top' when m.id is not null then 'mac' end as kind,
  coalesce(p.suggestion_id, case when t.n > 0 then t.id end, m.id) as shown_id,
  coalesce(c.c, 0) as suggestion_count,
  t.id as top_id, coalesce(t.n, 0) as top_votes, coalesce(s2.n, 0) as second_votes, coalesce(pv.n, 0) as pin_votes
from public.i18n_languages l
cross join public.i18n_strings st
left join public.i18n_pins p on p.language_code = l.code and p.string_key = st.key
left join rk t on t.language_code = l.code and t.string_key = st.key and t.rn = 1
left join rk s2 on s2.language_code = l.code and s2.string_key = st.key and s2.rn = 2
left join sug pv on pv.id = p.suggestion_id
left join mach m on m.language_code = l.code and m.string_key = st.key
left join cnt c on c.language_code = l.code and c.string_key = st.key;

revoke all on app.i18n_state from public, anon, authenticated;
revoke all on function app.i18n_uid(), app.i18n_is_reviewer(text), app.i18n_tokens(text), app.i18n_norm(text) from public, anon, authenticated;

-- ---------- reading ----------
create function public.i18n_languages_list() returns table (
  code text, native_name text, english_name text, date_tag text, featured boolean, is_source boolean, machine_status text,
  total int, pinned int, voted int, machine int, reviewer_name text, is_reviewer boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.i18n_uid();
  return query
  select l.code, l.native_name, l.english_name, l.date_tag, l.featured, l.is_source, l.machine_status,
    (select count(*)::int from public.i18n_strings),
    (count(*) filter (where s.kind = 'pin'))::int, (count(*) filter (where s.kind = 'top'))::int, (count(*) filter (where s.kind = 'mac'))::int,
    (select split_part(pr.full_name, ' ', 1) from public.i18n_reviewers r join public.profiles pr on pr.user_id = r.user_id
      where r.language_code = l.code order by r.created_at limit 1),
    app.i18n_is_reviewer(l.code)
  from public.i18n_languages l
  left join app.i18n_state s on s.language_code = l.code
  group by l.code
  order by l.sort_order, l.created_at;
end $$;

create function public.i18n_workspace(p_lang text) returns table (
  string_key text, source_text text, shown_text text, kind text, suggestion_count int, "position" int
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.i18n_uid();
  return query
  select s.string_key, s.source_text, sg.text, s.kind, s.suggestion_count, s.position
  from app.i18n_state s left join public.i18n_suggestions sg on sg.id = s.shown_id
  where s.language_code = p_lang
  order by s.position, s.string_key;
end $$;

-- Suggestions of one string. Vote counts and ordering by votes are for reviewers only; names are first words only.
create function public.i18n_string_detail(p_lang text, p_key text) returns table (
  id uuid, text text, origin text, author_name text, i_voted boolean, is_mine boolean, votes int,
  is_pinned boolean, is_shown boolean, kind text
) language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  rev boolean := app.i18n_is_reviewer(p_lang);
begin
  return query
  select sg.id, sg.text, sg.origin, nullif(split_part(pr.full_name, ' ', 1), ''), (v.user_id is not null), (sg.author_id = uid),
    case when rev then (select count(*)::int from public.i18n_votes x where x.suggestion_id = sg.id) end,
    (pin.suggestion_id = sg.id), (st.shown_id = sg.id), st.kind
  from public.i18n_suggestions sg
  join app.i18n_state st on st.language_code = sg.language_code and st.string_key = sg.string_key
  left join public.profiles pr on pr.user_id = sg.author_id
  left join public.i18n_votes v on v.suggestion_id = sg.id and v.user_id = uid
  left join public.i18n_pins pin on pin.language_code = sg.language_code and pin.string_key = sg.string_key
  where sg.language_code = p_lang and sg.string_key = p_key
  order by (st.shown_id = sg.id) desc,
    case when rev then (select count(*) from public.i18n_votes x where x.suggestion_id = sg.id) end desc nulls last,
    sg.created_at, sg.id;
end $$;

-- The text people see, for the app to use. Public on purpose: it holds only the shown text, no votes or people.
create function public.i18n_display(p_lang text) returns table (string_key text, text text, kind text)
language sql stable security definer set search_path = '' as $$
  select s.string_key, sg.text, s.kind
  from app.i18n_state s join public.i18n_suggestions sg on sg.id = s.shown_id
  where s.language_code = p_lang and p_lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'
$$;

create function public.i18n_my_stats() returns table (suggestions int, votes int, shown int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := app.i18n_uid();
begin
  return query select
    (select count(*)::int from public.i18n_suggestions where author_id = uid and origin = 'user'),
    (select count(*)::int from public.i18n_votes where user_id = uid),
    (select count(*)::int from public.i18n_suggestions sg join app.i18n_state st on st.shown_id = sg.id where sg.author_id = uid);
end $$;

-- Reviewer queue: strings with tied votes, a pin that differs from the votes, or machine text only.
create function public.i18n_review_queue(p_lang text) returns table (
  string_key text, source_text text, shown_text text, kind text, suggestion_count int, tied boolean, differs boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.i18n_uid();
  if not app.i18n_is_reviewer(p_lang) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.string_key, s.source_text, sg.text, s.kind, s.suggestion_count,
    (s.top_votes > 0 and s.second_votes = s.top_votes),
    (s.kind = 'pin' and s.top_id is distinct from s.shown_id and s.top_votes > s.pin_votes)
  from app.i18n_state s left join public.i18n_suggestions sg on sg.id = s.shown_id
  where s.language_code = p_lang and s.suggestion_count > 0
  order by s.position, s.string_key;
end $$;

-- ---------- writing ----------
create function public.i18n_vote(p_suggestion uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  sg record;
begin
  select language_code, string_key into sg from public.i18n_suggestions where id = p_suggestion;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_on then
    insert into public.i18n_votes (user_id, language_code, string_key, suggestion_id)
    values (uid, sg.language_code, sg.string_key, p_suggestion)
    on conflict (user_id, language_code, string_key) do update set suggestion_id = excluded.suggestion_id, created_at = now();
  else
    delete from public.i18n_votes where user_id = uid and suggestion_id = p_suggestion;
  end if;
end $$;

-- Adds a suggestion and votes for it. The same text again just votes for the existing suggestion.
create function public.i18n_add_suggestion(p_lang text, p_key text, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  src text;
  txt text := btrim(coalesce(p_text, ''));
  sid uuid;
begin
  if not exists (select 1 from public.i18n_languages where code = p_lang and not is_source) then
    raise exception 'language_not_found' using errcode = 'P0002';
  end if;
  select source_text into src from public.i18n_strings where key = p_key;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(txt) < 1 or length(txt) > 2000 then raise exception 'text_length' using errcode = 'P0001'; end if;
  if app.i18n_tokens(txt) is distinct from app.i18n_tokens(src) then raise exception 'tokens_mismatch' using errcode = 'P0001'; end if;

  select id into sid from public.i18n_suggestions
    where language_code = p_lang and string_key = p_key and app.i18n_norm(text) = app.i18n_norm(txt) order by created_at limit 1;
  if sid is null then
    if (select count(*) from public.i18n_suggestions where language_code = p_lang and string_key = p_key and author_id = uid) >= 3 then
      raise exception 'suggestion_limit' using errcode = 'P0001';
    end if;
    insert into public.i18n_suggestions (language_code, string_key, text, origin, author_id)
    values (p_lang, p_key, txt, 'user', uid) returning id into sid;
  end if;
  insert into public.i18n_votes (user_id, language_code, string_key, suggestion_id) values (uid, p_lang, p_key, sid)
  on conflict (user_id, language_code, string_key) do update set suggestion_id = excluded.suggestion_id, created_at = now();
  return sid;
end $$;

create function public.i18n_pin(p_lang text, p_key text, p_suggestion uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := app.i18n_uid();
begin
  if not app.i18n_is_reviewer(p_lang) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.i18n_suggestions where id = p_suggestion and language_code = p_lang and string_key = p_key) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.i18n_pins (language_code, string_key, suggestion_id, pinned_by) values (p_lang, p_key, p_suggestion, uid)
  on conflict (language_code, string_key) do update set suggestion_id = excluded.suggestion_id, pinned_by = excluded.pinned_by, pinned_at = now();
end $$;

create function public.i18n_unpin(p_lang text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.i18n_uid();
  if not app.i18n_is_reviewer(p_lang) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.i18n_pins where language_code = p_lang and string_key = p_key;
end $$;

create function public.i18n_create_language(p_code text, p_native text, p_english text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  c text := lower(btrim(coalesce(p_code, '')));
  n text := btrim(coalesce(p_native, ''));
  e text := coalesce(nullif(btrim(coalesce(p_english, '')), ''), n);
begin
  if c !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$' or length(n) not between 1 and 60 or length(e) > 60 then
    raise exception 'invalid_language' using errcode = 'P0001';
  end if;
  if (select count(*) from public.i18n_languages where created_by = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'language_limit' using errcode = 'P0001';
  end if;
  insert into public.i18n_languages (code, native_name, english_name, date_tag, created_by, sort_order)
  values (c, n, e, c, uid, 100 + (select count(*)::int from public.i18n_languages));
  return c;
exception when unique_violation then
  raise exception 'language_exists' using errcode = 'P0001';
end $$;

-- Machine translation steps. The server begins a run (this returns the strings still without text), translates them
-- with the configured provider, then stores the result as machine drafts. Only the person who began the run can
-- store drafts, only while it is pending, and only for strings that have no machine draft yet.
create function public.i18n_begin_machine(p_lang text) returns table (string_key text, source_text text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  n int;
begin
  update public.i18n_languages set machine_status = 'pending', machine_started_by = uid, machine_started_at = now()
  where code = p_lang and not is_source
    and (machine_status in ('none', 'unavailable') or (machine_status = 'pending' and machine_started_at < now() - interval '10 minutes'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'machine_busy' using errcode = 'P0001'; end if;
  return query
  select st.key, st.source_text from public.i18n_strings st
  where not exists (select 1 from public.i18n_suggestions s where s.language_code = p_lang and s.string_key = st.key)
  order by st.position;
end $$;

create function public.i18n_add_machine_drafts(p_lang text, p_drafts jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.i18n_uid();
  n int;
begin
  if not exists (select 1 from public.i18n_languages where code = p_lang and machine_status = 'pending' and machine_started_by = uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_drafts) is distinct from 'object' then raise exception 'invalid_drafts' using errcode = 'P0001'; end if;
  insert into public.i18n_suggestions (language_code, string_key, text, origin)
  select p_lang, d.key, btrim(d.value), 'machine'
  from jsonb_each_text(p_drafts) d
  join public.i18n_strings st on st.key = d.key
  where length(btrim(d.value)) between 1 and 2000
    and app.i18n_tokens(d.value) = app.i18n_tokens(st.source_text)
    and not exists (select 1 from public.i18n_suggestions s where s.language_code = p_lang and s.string_key = d.key and s.origin = 'machine');
  get diagnostics n = row_count;
  update public.i18n_languages set machine_status = 'done' where code = p_lang;
  return n;
end $$;

-- The provider is not configured or failed: nothing was stored, strings keep showing English, a later run can retry.
create function public.i18n_machine_unavailable(p_lang text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := app.i18n_uid();
begin
  update public.i18n_languages set machine_status = 'unavailable'
  where code = p_lang and machine_status = 'pending' and machine_started_by = uid;
end $$;

revoke all on function
  public.i18n_languages_list(), public.i18n_workspace(text), public.i18n_string_detail(text, text), public.i18n_display(text),
  public.i18n_my_stats(), public.i18n_review_queue(text), public.i18n_vote(uuid, boolean), public.i18n_add_suggestion(text, text, text),
  public.i18n_pin(text, text, uuid), public.i18n_unpin(text, text), public.i18n_create_language(text, text, text),
  public.i18n_begin_machine(text), public.i18n_add_machine_drafts(text, jsonb), public.i18n_machine_unavailable(text)
  from public, anon, authenticated;
grant execute on function
  public.i18n_languages_list(), public.i18n_workspace(text), public.i18n_string_detail(text, text),
  public.i18n_my_stats(), public.i18n_review_queue(text), public.i18n_vote(uuid, boolean), public.i18n_add_suggestion(text, text, text),
  public.i18n_pin(text, text, uuid), public.i18n_unpin(text, text), public.i18n_create_language(text, text, text),
  public.i18n_begin_machine(text), public.i18n_add_machine_drafts(text, jsonb), public.i18n_machine_unavailable(text)
  to authenticated;
-- The shown text is public (the sign-in page needs it).
grant execute on function public.i18n_display(text) to anon, authenticated;
