-- Migration 26a: a new data scope, "team" = my own records plus those of everyone below me in the reporting line.
-- It sits between own and branch. This is its own step because a new enum value cannot be used in the
-- transaction that adds it. Run it first, then migration 26b.
alter type public.data_scope add value if not exists 'team' before 'branch';
