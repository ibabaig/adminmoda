-- ============================================================
-- MoDA 009: superadmin access for the admin area
--
-- Run in the SAME Supabase project as the main app.
-- SQL Editor -> New query -> paste -> Run
--
-- The admin app is a separate repo and a separate Vercel project, but
-- it is NOT a separate database. It reads the same tables through the
-- same RLS, with one new role on top.
--
-- WHY NOT JUST USE THE SERVICE-ROLE KEY
-- An admin app could hold SUPABASE_SERVICE_ROLE_KEY and bypass RLS
-- entirely. Then the ONLY thing standing between the open internet and
-- every row is one `if` statement in application code. One routing
-- mistake, one forgotten await, and the whole database is public.
-- Instead the admin app signs in as a normal user and the DATABASE
-- decides what a superadmin may see. A bug in the app then leaks
-- nothing, because Postgres refuses the query.
-- ============================================================


-- ============================================================
-- 1. THE FLAG
-- ============================================================
alter table public.profiles
  add column is_superadmin boolean not null default false;

-- Members may update their own names and avatar. They must NOT be able
-- to promote themselves — the column-level grant from 006 already
-- limits UPDATE to those three columns, and is_superadmin is not among
-- them. Restated here so a future `grant update on profiles` does not
-- quietly hand every member the keys.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, avatar_path, updated_at)
  on public.profiles to authenticated;


-- ============================================================
-- 2. THE RECURSION TRAP
-- ============================================================
-- The obvious policy is:
--
--   create policy "superadmins read all profiles" on public.profiles
--     for select using (exists (
--       select 1 from public.profiles
--        where id = auth.uid() and is_superadmin));
--
-- That is infinite recursion. Reading profiles runs the policy, which
-- reads profiles, which runs the policy. Postgres aborts with
-- "infinite recursion detected in policy for relation profiles".
--
-- SECURITY DEFINER is the way out: the function runs as its owner, so
-- the lookup inside it is not subject to RLS and never re-enters the
-- policy. `stable` lets Postgres call it once per statement rather than
-- once per row.
create function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_superadmin
       from public.profiles p
      where p.id = (select auth.uid())),
    false
  );
$$;

grant execute on function public.is_superadmin() to authenticated;


-- ============================================================
-- 3. WHAT A SUPERADMIN MAY DO
-- ============================================================
-- Exactly the assignment's matrix and nothing beyond it:
--   profiles  READ
--   works     CREATE / READ / UPDATE / DELETE
--   votes     READ
--
-- Postgres ORs permissive policies together, so each of these widens
-- access for superadmins while every existing member policy stays
-- exactly as strict as it was.

-- ---- profiles: read everyone, change no one ----------------
create policy "superadmins read all profiles"
  on public.profiles for select to authenticated
  using (public.is_superadmin());

-- Deliberately no update/delete policy for profiles. The assignment
-- asks for READ. An admin who can silently rewrite a member's identity
-- is a bigger liability than one who has to ask.

-- ---- works: full CRUD --------------------------------------
-- works had no UPDATE grant at all, because a work is immutable to its
-- author once votes exist. The admin area is the one exception.
grant update, delete on public.works to authenticated;

create policy "superadmins read all works"
  on public.works for select to authenticated
  using (public.is_superadmin());

create policy "superadmins create works"
  on public.works for insert to authenticated
  with check (public.is_superadmin());

create policy "superadmins update works"
  on public.works for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy "superadmins delete works"
  on public.works for delete to authenticated
  using (public.is_superadmin());

-- ---- votes: read the ballots -------------------------------
-- The secret ballot held for members: you could only ever read your
-- own. Moderating a rating system means being able to see them, so a
-- superadmin can — and nobody else gained anything.
create policy "superadmins read all votes"
  on public.votes for select to authenticated
  using (public.is_superadmin());

-- ---- cafe seats: read, for moderation ----------------------
-- Content moderation was deferred, and `hidden_at` was left on the
-- table as the hook it would attach to. Reading is enough for now.
create policy "superadmins read all cafe seats"
  on public.cafe_seats for select to authenticated
  using (public.is_superadmin());

-- anon gains nothing anywhere. Restated because it is the whole point.
revoke all on public.profiles from anon;
revoke all on public.votes from anon;
revoke all on public.cafe_seats from anon;


-- ============================================================
-- 4. BOOTSTRAPPING YOURSELF  <- the assignment's question
-- ============================================================
-- Every admin route requires is_superadmin = true. Nobody has it, and
-- the admin app cannot grant it, because granting it requires already
-- having it. You are locked out of your own back office.
--
-- The way out is that the app's auth is not the only door to the
-- database. You own the Supabase project, and the SQL Editor runs as a
-- superuser that ignores RLS entirely. So:
--
--   1. Sign in to the ADMIN app once with Google. Auth succeeds, the
--      profiles row is created by the on_auth_user_created trigger,
--      and you are then refused at the gate. That refusal is correct —
--      it proves the wall works before anything is behind it.
--
--   2. Find the row you just created:
--        select id, email, first_name, is_superadmin
--          from public.profiles order by updated_at desc limit 5;
--
--   3. Promote it, here in the SQL Editor, outside the app:
--        update public.profiles
--           set is_superadmin = true
--         where email = 'you@example.com';
--
--   4. Sign out and back in. You are through.
--
-- The same trick works with the service-role key from a one-off script,
-- or by editing the row in the dashboard's Table Editor — all three are
-- the same idea: the first grant has to come from OUTSIDE the system it
-- controls. That is what a root account is for, and it is why the first
-- superadmin is always created by hand.
--
-- Promote a second person later, from inside the app's own SQL access?
-- No — this project deliberately gives superadmins READ on profiles and
-- nothing more, so promotion stays a deliberate act at the database.


-- ============================================================
-- 5. VERIFY
-- ============================================================
--   select id, email, is_superadmin from public.profiles;
--   select public.is_superadmin();   -- false until you promote yourself
--
-- As `anon` in the role dropdown, all three must still refuse:
--   select * from public.profiles;
--   select * from public.votes;
--   select * from public.cafe_seats;
--
-- As a NON-superadmin member, these must return only your own rows:
--   select count(*) from public.profiles;   -- 1
--   select count(*) from public.votes;      -- only yours
