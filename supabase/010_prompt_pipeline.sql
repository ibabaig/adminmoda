-- ============================================================
-- MoDA 010: the prompt pipeline, the model registry, the gate
--
-- MIGRATION. Assumes 005, 006, the 007 patch, 008 and 009 have run.
-- Run in: Supabase -> SQL Editor -> New query -> paste -> Run
--
-- WHAT THIS IS FOR
--   Until now the museum's prompts lived in lib/gemini.ts, the model
--   name lived in an environment variable, and nothing recorded what
--   happened when a commission was attempted. This migration moves all
--   three into the database:
--
--     llm_providers / llm_models      what we generate with
--     prompt_chains / _steps / _mix   how a prompt is assembled, and
--                                     which variant a commission draws
--     ai_generation_examples          few-shot material per school
--     terms                           the museum's house vocabulary
--     generation_requests             one row per attempt
--     llm_responses                   what came back, with timings
--     allowed_signup_domains          who may register
--     whitelisted_emails              ...and the individual exceptions
--     images                          uploaded files, by PATH not bytes
--
--   The point of generation_requests and llm_responses is that the
--   museum stops being unmeasurable. Success rate by department, p50
--   and p95 latency, how often the SVG sanitiser rejects model output,
--   how often a poem dies at MAX_TOKENS -- all of it becomes a query
--   instead of a guess.
--
-- A NOTE ON WHO CAN READ WHAT
--   The generation path runs inside a server action as the signed-in
--   member, so `authenticated` needs SELECT on the pipeline config
--   tables. That is a deliberate choice over reaching for the
--   service-role key in a server action: it keeps every read under RLS,
--   where a mistake is refused rather than merely unnoticed. The
--   prompts were already public -- works.prompt is readable by anyone,
--   because assignment 4 required storing them -- so this leaks
--   nothing that was not already on display.
-- ============================================================


-- ============================================================
-- 1. WHAT WE GENERATE WITH
-- ============================================================

create table public.llm_providers (
  id          bigint primary key generated always as identity,
  slug        text not null unique,
  name        text not null,
  api_base    text,
  -- The NAME of the environment variable holding the key, never the key
  -- itself. A secret in a table is a secret in every backup.
  env_key_name text not null,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.llm_models (
  id                bigint primary key generated always as identity,
  provider_id       bigint not null references public.llm_providers on delete restrict,
  slug              text not null unique,
  display_name      text not null,
  kind              text not null default 'text'
                      check (kind in ('text','image','video')),
  -- Defaults a chain inherits unless it overrides them. maxOutputTokens
  -- caps thinking AND output together, which is why poetry needs a far
  -- larger number than a one-line joke -- see 008's sibling bug.
  max_output_tokens integer not null default 2400 check (max_output_tokens > 0),
  default_temperature numeric(3,2) not null default 1.00
                      check (default_temperature >= 0 and default_temperature <= 2),
  -- Dollars per million tokens. Null where the tier is free.
  input_cost_per_mtok  numeric(10,4),
  output_cost_per_mtok numeric(10,4),
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now()
);

create index llm_models_provider_idx on public.llm_models (provider_id);


-- ============================================================
-- 2. HOW A PROMPT IS ASSEMBLED
-- ============================================================

-- A chain is one recipe for building a prompt. Several chains can serve
-- the same department; prompt_chain_mix decides which one a commission
-- draws, so a new variant can be introduced at weight 0 and dialled up
-- without a deploy.
create table public.prompt_chains (
  id                bigint primary key generated always as identity,
  slug              text not null unique,
  name              text not null,
  department        text not null check (department in ('humour','poetry','prints','film')),
  media             text not null check (media in ('text','svg')),
  model_id          bigint references public.llm_models on delete set null,
  temperature       numeric(3,2) check (temperature >= 0 and temperature <= 2),
  max_output_tokens integer check (max_output_tokens > 0),
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Steps are the ordered blocks the prompt is built from. Placeholders in
-- `template` are substituted at generation time: {{wing.name}},
-- {{wing.era_label}}, {{wing.subject}}, {{school.name}}, {{school.blurb}},
-- {{school.direction}}, {{audience}}, {{house_rules}}, {{terms}},
-- {{examples}}, {{palette}}, {{canvas.w}}, {{canvas.h}}.
-- An unknown placeholder is left alone rather than blanked, so a typo in
-- the admin area is visible in the stored prompt instead of silent.
create table public.prompt_chain_steps (
  id          bigint primary key generated always as identity,
  chain_id    bigint not null references public.prompt_chains on delete cascade,
  step_order  integer not null check (step_order > 0),
  role        text not null check (role in
                ('role','context','audience','school','rules','examples','format')),
  label       text not null,
  template    text not null,
  is_active   boolean not null default true,
  unique (chain_id, step_order)
);

create index prompt_chain_steps_chain_idx on public.prompt_chain_steps (chain_id, step_order);

-- Read/update only, per the brief -- and that is the honest shape for
-- it. A mix row is DERIVED: it exists because a chain exists. The
-- trigger below creates one for every new chain and the cascade removes
-- it, so there is nothing for a curator to create or delete by hand.
-- All they ever need to change is the weight.
create table public.prompt_chain_mix (
  id          bigint primary key generated always as identity,
  department  text not null check (department in ('humour','poetry','prints','film')),
  chain_id    bigint not null references public.prompt_chains on delete cascade,
  weight      integer not null default 0 check (weight >= 0),
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (department, chain_id)
);

create function public.sync_prompt_chain_mix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prompt_chain_mix (department, chain_id, weight)
  values (new.department, new.id, 0)
  on conflict (department, chain_id) do nothing;
  return new;
end;
$$;

create trigger prompt_chains_sync_mix
  after insert on public.prompt_chains
  for each row execute function public.sync_prompt_chain_mix();


-- ============================================================
-- 3. FEW-SHOT MATERIAL AND HOUSE VOCABULARY
-- ============================================================

create table public.ai_generation_examples (
  id          bigint primary key generated always as identity,
  chain_id    bigint references public.prompt_chains on delete cascade,
  department  text not null check (department in ('humour','poetry','prints','film')),
  school      text,
  label       text not null,
  example_output text not null,
  -- Shown to the model as what TO do or what NOT to do. A counter-example
  -- is often the faster correction.
  polarity    text not null default 'positive'
                check (polarity in ('positive','negative')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

create index ai_generation_examples_lookup_idx
  on public.ai_generation_examples (department, school, is_active);

-- The museum's controlled vocabulary. These are injected into prompts so
-- the model writes "accessioned" and "wing" rather than inventing its own
-- words for them, and they double as the glossary for wall text.
create table public.terms (
  id          bigint primary key generated always as identity,
  term        text not null unique,
  definition  text not null,
  usage_note  text,
  category    text not null default 'house-style'
                check (category in ('house-style','department','material','process')),
  inject_into_prompts boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ============================================================
-- 4. WHAT ACTUALLY HAPPENED
-- ============================================================

-- One row per attempt, written before the model is called and completed
-- afterwards. A row stuck at 'pending' is itself a finding: it means the
-- process died mid-generation.
create table public.generation_requests (
  id              bigint primary key generated always as identity,
  requester_id    uuid references public.profiles on delete set null,
  origin          text not null default 'member' check (origin in ('house','member')),
  department      text not null check (department in ('humour','poetry','prints','film')),
  school          text,
  wing_id         bigint references public.wings on delete set null,
  chain_id        bigint references public.prompt_chains on delete set null,
  model_id        bigint references public.llm_models on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending','succeeded','failed')),
  failure_reason  text,
  work_id         bigint references public.works on delete set null,
  prompt_text     text,
  duration_ms     integer check (duration_ms >= 0),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index generation_requests_recent_idx
  on public.generation_requests (created_at desc);
create index generation_requests_dept_status_idx
  on public.generation_requests (department, status);
create index generation_requests_requester_idx
  on public.generation_requests (requester_id);

create table public.llm_responses (
  id              bigint primary key generated always as identity,
  request_id      bigint not null references public.generation_requests on delete cascade,
  model_id        bigint references public.llm_models on delete set null,
  raw_text        text,
  -- The field that explained the poetry bug. STOP is healthy; MAX_TOKENS
  -- means the budget ran out mid-thought; SAFETY means the model declined.
  finish_reason   text,
  prompt_tokens   integer check (prompt_tokens >= 0),
  thought_tokens  integer check (thought_tokens >= 0),
  output_tokens   integer check (output_tokens >= 0),
  total_tokens    integer check (total_tokens >= 0),
  duration_ms     integer check (duration_ms >= 0),
  -- Visual work passes through the SVG allowlist sanitiser. Recording the
  -- verdict is what makes the rejection rate measurable.
  was_sanitised   boolean not null default false,
  sanitiser_ok    boolean,
  sanitiser_reason text,
  created_at      timestamptz not null default now()
);

create index llm_responses_request_idx on public.llm_responses (request_id);
create index llm_responses_finish_idx on public.llm_responses (finish_reason);


-- ============================================================
-- 5. WHO MAY REGISTER
-- ============================================================

create table public.allowed_signup_domains (
  id          bigint primary key generated always as identity,
  -- Stored bare and lowercase: "columbia.edu", not "@columbia.edu".
  domain      text not null unique
                check (domain = lower(domain) and domain not like '@%' and domain like '%.%'),
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.whitelisted_emails (
  id          bigint primary key generated always as identity,
  email       text not null unique check (email = lower(email) and email like '%@%.%'),
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- FAIL OPEN WHEN UNCONFIGURED.
--
-- If both tables are empty of active rows, everybody is allowed. This is
-- the single most important line in the file: a gate that defaults to
-- closed would have locked the museum's own curator out of registration
-- the moment this migration ran, and the only way back in would be the
-- SQL editor again.
--
-- Once either table has an active row the gate is live, and an address
-- gets in by matching a whitelisted email OR an allowed domain.
create function public.signup_allowed(addr text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.allowed_signup_domains where is_active)
     and not exists (select 1 from public.whitelisted_emails where is_active)
    then true
    else
      exists (
        select 1 from public.whitelisted_emails w
         where w.is_active and w.email = lower(addr)
      )
      or exists (
        select 1 from public.allowed_signup_domains d
         where d.is_active and lower(addr) like '%@' || d.domain
      )
  end;
$$;

create function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and not public.signup_allowed(new.email) then
    raise exception
      'That email address is not on the museum''s register. Ask a curator to add it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- A separate trigger from handle_new_user() on purpose. That one creates
-- the profile row and works; this one decides admission. Keeping them
-- apart means a change to the gate cannot break profile creation.
create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();


-- ============================================================
-- 6. IMAGES
-- ============================================================

-- PATHS, never bytes. Assignment 3 said it outright: do not store binary
-- image data in a relational database. The file lives in Storage; this
-- table is the catalogue entry for it.
create table public.images (
  id           bigint primary key generated always as identity,
  bucket       text not null default 'museum-images',
  path         text not null,
  kind         text not null default 'reference'
                 check (kind in ('avatar','work','icon','reference')),
  alt_text     text,
  caption      text,
  content_type text,
  byte_size    integer check (byte_size >= 0),
  width        integer check (width > 0),
  height       integer check (height > 0),
  work_id      bigint references public.works on delete set null,
  uploaded_by  uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);

create index images_kind_idx on public.images (kind, created_at desc);

insert into storage.buckets (id, name, public)
values ('museum-images', 'museum-images', true)
on conflict (id) do nothing;

create policy "museum images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'museum-images');

create policy "curators upload museum images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'museum-images' and public.is_superadmin());

create policy "curators replace museum images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'museum-images' and public.is_superadmin());

create policy "curators remove museum images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'museum-images' and public.is_superadmin());


-- ============================================================
-- 7. ROW-LEVEL SECURITY
--
-- Enabled on every new table. The permissions below are exactly the ones
-- the brief asks for and no more: where it says "read", there is no
-- update or delete policy at all, so an accidental write in the admin
-- app is refused by Postgres rather than merely absent from the UI.
-- ============================================================

alter table public.llm_providers          enable row level security;
alter table public.llm_models             enable row level security;
alter table public.prompt_chains          enable row level security;
alter table public.prompt_chain_steps     enable row level security;
alter table public.prompt_chain_mix       enable row level security;
alter table public.ai_generation_examples enable row level security;
alter table public.terms                  enable row level security;
alter table public.generation_requests    enable row level security;
alter table public.llm_responses          enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails     enable row level security;
alter table public.images                 enable row level security;

-- ---- the pipeline config, as read by the generation path ----
-- Members read it because the server action that builds a prompt runs as
-- them. They cannot write any of it.
create policy "members read active chains"
  on public.prompt_chains for select to authenticated using (is_active);
create policy "members read active steps"
  on public.prompt_chain_steps for select to authenticated using (is_active);
create policy "members read the mix"
  on public.prompt_chain_mix for select to authenticated using (true);
create policy "members read active examples"
  on public.ai_generation_examples for select to authenticated using (is_active);
create policy "members read active terms"
  on public.terms for select to authenticated using (is_active);
create policy "members read active models"
  on public.llm_models for select to authenticated using (is_active);
create policy "members read active providers"
  on public.llm_providers for select to authenticated using (is_active);

-- ---- READ-ONLY for curators (brief: "read") ----
create policy "curators read all chains"
  on public.prompt_chains for select to authenticated using (public.is_superadmin());
create policy "curators read all steps"
  on public.prompt_chain_steps for select to authenticated using (public.is_superadmin());
create policy "curators read generation requests"
  on public.generation_requests for select to authenticated using (public.is_superadmin());
create policy "curators read llm responses"
  on public.llm_responses for select to authenticated using (public.is_superadmin());

-- ---- READ/UPDATE for curators (brief: "read/update") ----
create policy "curators read all mix rows"
  on public.prompt_chain_mix for select to authenticated using (public.is_superadmin());
create policy "curators retune the mix"
  on public.prompt_chain_mix for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Column-level, so even an UPDATE that passes the policy can only touch
-- the two fields that are a curator's business. Reassigning a mix row to
-- another department is not retuning, it is corruption.
revoke update on public.prompt_chain_mix from authenticated;
grant  update (weight, is_active, updated_at) on public.prompt_chain_mix to authenticated;

-- ---- FULL CRUD for curators (brief: "create/read/update/delete") ----
do $$
declare t text;
begin
  foreach t in array array[
    'terms',
    'ai_generation_examples',
    'llm_models',
    'llm_providers',
    'allowed_signup_domains',
    'whitelisted_emails',
    'images'
  ] loop
    execute format(
      'create policy "curators read %1$s" on public.%1$I
         for select to authenticated using (public.is_superadmin())', t);
    execute format(
      'create policy "curators create %1$s" on public.%1$I
         for insert to authenticated with check (public.is_superadmin())', t);
    execute format(
      'create policy "curators update %1$s" on public.%1$I
         for update to authenticated
         using (public.is_superadmin()) with check (public.is_superadmin())', t);
    execute format(
      'create policy "curators delete %1$s" on public.%1$I
         for delete to authenticated using (public.is_superadmin())', t);
  end loop;
end;
$$;

-- ---- the generation path writes its own record ----
-- A member may log their own attempt and nobody else's, and may not
-- claim the attempt was the museum's.
create policy "members log own requests"
  on public.generation_requests for insert to authenticated
  with check (requester_id = (select auth.uid()) and origin = 'member');

create policy "members complete own requests"
  on public.generation_requests for update to authenticated
  using (requester_id = (select auth.uid()))
  with check (requester_id = (select auth.uid()) and origin = 'member');

create policy "members read own requests"
  on public.generation_requests for select to authenticated
  using (requester_id = (select auth.uid()));

create policy "members log responses to own requests"
  on public.llm_responses for insert to authenticated
  with check (exists (
    select 1 from public.generation_requests r
     where r.id = request_id and r.requester_id = (select auth.uid())
  ));

create policy "members read responses to own requests"
  on public.llm_responses for select to authenticated
  using (exists (
    select 1 from public.generation_requests r
     where r.id = request_id and r.requester_id = (select auth.uid())
  ));

-- Images are shown on the public site, so anyone may read the catalogue.
create policy "anyone reads the image catalogue"
  on public.images for select to anon, authenticated using (true);

-- The house's nightly commission runs as service_role, which bypasses
-- RLS entirely. No policy below needs to make room for it.


-- ============================================================
-- 8. SEEDS
--
-- These mirror what lib/gemini.ts does today, so switching the app over
-- to read from the database is a no-op in output rather than a rewrite
-- of the museum's voice.
-- ============================================================

insert into public.llm_providers (slug, name, api_base, env_key_name, notes) values
  ('google', 'Google AI Studio', 'https://generativelanguage.googleapis.com',
   'GEMINI_API_KEY',
   'Free tier covers text generation. Image models have no free tier and video runs about $0.10/second, which is why the visual departments generate SVG from a text model.');

insert into public.llm_models
  (provider_id, slug, display_name, kind, max_output_tokens, default_temperature, notes)
select p.id, v.slug, v.display_name, v.kind, v.max_tok, v.temp, v.notes
  from public.llm_providers p,
       (values
         ('gemini-flash-latest', 'Gemini Flash (latest)', 'text', 2400, 1.20,
          'Stable alias tracking the current Flash model. Everything the museum generates, text and SVG alike, comes from here.'),
         ('gemini-2.5-flash', 'Gemini 2.5 Flash (pinned)', 'text', 2400, 1.20,
          'Inactive. Kept as a pinned fallback if the alias moves to a model that behaves differently.')
       ) as v(slug, display_name, kind, max_tok, temp, notes)
 where p.slug = 'google';

update public.llm_models set is_active = false where slug = 'gemini-2.5-flash';

-- ---- the four production chains, plus one variant at weight 0 ----
insert into public.prompt_chains
  (slug, name, department, media, model_id, temperature, max_output_tokens, notes)
select v.slug, v.name, v.dept, v.media, m.id, v.temp, v.max_tok, v.notes
  from public.llm_models m,
       (values
         ('humour-text-v1', 'Humour, house voice', 'humour', 'text', 1.20, 2400,
          'The original wall-joke prompt, lifted out of lib/gemini.ts unchanged.'),
         ('poetry-text-v1', 'Poetry, house voice', 'poetry', 'text', 1.20, 2400,
          'Needs the large token budget: thinking and output share it, and a poem that has to be reasoned about will spend the whole thing thinking and return nothing.'),
         ('prints-svg-v1', 'Prints, five-ink press', 'prints', 'svg', 0.95, 9000,
          'Lower temperature than text. Visual composition degrades into noise at high temperature in a way prose does not.'),
         ('film-svg-v1', 'Film, single frame', 'film', 'svg', 0.95, 9000,
          'Same press as Prints, framed as one still from a film that does not exist.'),
         ('humour-text-terse-v1', 'Humour, terse variant', 'humour', 'text', 1.35, 2400,
          'Experiment, off by default at weight 0. Raise its weight in the admin area to start splitting traffic with the house voice.')
       ) as v(slug, name, dept, media, temp, max_tok, notes)
 where m.slug = 'gemini-flash-latest';

-- The trigger created a mix row per chain at weight 0. Switch the four
-- production chains on; the variant stays at 0 until someone raises it.
update public.prompt_chain_mix m
   set weight = 100
  from public.prompt_chains c
 where c.id = m.chain_id
   and c.slug in ('humour-text-v1','poetry-text-v1','prints-svg-v1','film-svg-v1');

-- ---- the steps, mirroring the current prompt assembly ----
insert into public.prompt_chain_steps (chain_id, step_order, role, label, template)
select c.id, v.ord, v.role, v.label, v.template
  from public.prompt_chains c,
       (values
         (1, 'role', 'Commission',
          'You are writing a short joke that hangs on a wall as the artwork itself, for the Museum of Digital Art.'),
         (2, 'context', 'Gallery',
          E'GALLERY: {{wing.name}} ({{wing.era_label}})\nSUBJECT: {{wing.subject}}'),
         (3, 'audience', 'Audience', '{{audience}}'),
         (4, 'school', 'School',
          E'SCHOOL: {{school.name}}\n{{school.blurb}}\n{{school.direction}}'),
         (5, 'examples', 'Examples', '{{examples}}'),
         (6, 'rules', 'House rules',
          E'RULES\n{{house_rules}}\n- Be brief. A visitor reads this standing up.\n- Do not restate the gallery name or the subject; they are printed beside you.'),
         (7, 'format', 'Output', 'Output the work only, nothing else.')
       ) as v(ord, role, label, template)
 where c.slug = 'humour-text-v1';

insert into public.prompt_chain_steps (chain_id, step_order, role, label, template)
select c.id, v.ord, v.role, v.label, v.template
  from public.prompt_chains c,
       (values
         (1, 'role', 'Commission',
          'You are writing a short poem for a broadside hung on a gallery wall, for the Museum of Digital Art.'),
         (2, 'context', 'Gallery',
          E'GALLERY: {{wing.name}} ({{wing.era_label}})\nSUBJECT: {{wing.subject}}'),
         (3, 'audience', 'Audience', '{{audience}}'),
         (4, 'school', 'School',
          E'SCHOOL: {{school.name}}\n{{school.blurb}}\n{{school.direction}}'),
         (5, 'examples', 'Examples', '{{examples}}'),
         (6, 'rules', 'House rules',
          E'RULES\n{{house_rules}}\n- Under 14 lines. Line breaks matter; use them deliberately.\n- Do not restate the gallery name or the subject; they are printed beside you.'),
         (7, 'format', 'Output', 'Output the work only, nothing else.')
       ) as v(ord, role, label, template)
 where c.slug = 'poetry-text-v1';

insert into public.prompt_chain_steps (chain_id, step_order, role, label, template)
select c.id, v.ord, v.role, v.label, v.template
  from public.prompt_chains c,
       (values
         (1, 'role', 'Commission',
          E'You are composing a print for the Museum of Digital Art''s Prints department.\nYou work in SVG. The SVG is the artwork.'),
         (2, 'context', 'Gallery',
          E'GALLERY: {{wing.name}} ({{wing.era_label}})\nSUBJECT: {{wing.subject}}'),
         (3, 'audience', 'Audience', '{{audience}}'),
         (4, 'school', 'School', E'SCHOOL: {{school.name}}\n{{school.blurb}}'),
         (5, 'rules', 'Technical constraints',
          E'TECHNICAL CONSTRAINTS — follow exactly, the output is rejected otherwise:\n- Canvas is viewBox="0 0 {{canvas.w}} {{canvas.h}}". Compose for that shape.\n- Use ONLY these ink colours, by hex: {{palette}}.\n- Begin with a full-canvas <rect> filled paper, then compose on top of it.\n- Allowed elements only: <g> <rect> <circle> <ellipse> <line> <polyline> <polygon> <path>.\n- No <text>, no <image>, no <use>, no gradients, no filters, no CSS, no script.\n- Flat fills only. To suggest overprinted ink, overlap shapes at fill-opacity 0.85.\n- Between 10 and 30 shapes. Bold and readable from across a room, not fiddly.\n- Build recognisable forms from simple geometry. A chair is legs and a back, not a mesh.\n- Use the red sparingly, as an accent on one element, the way a printer spends a second ink.'),
         (6, 'context', 'Composition',
          'COMPOSITION: a single clear subject with real negative space. Think poster, not illustration.'),
         (7, 'format', 'Output',
          E'Reply with exactly three lines, in this order and nothing else:\nTITLE: <three to six words, no quotation marks>\nPLATE: <one sentence, under 25 words, as a museum plate note>\nSVG: <the complete svg element on one line, starting with <svg and ending with </svg>>')
       ) as v(ord, role, label, template)
 where c.slug = 'prints-svg-v1';

insert into public.prompt_chain_steps (chain_id, step_order, role, label, template)
select c.id, v.ord, v.role, v.label, v.template
  from public.prompt_chains c,
       (values
         (1, 'role', 'Commission',
          E'You are composing a single film still for the Museum of Digital Art''s Film department.\nYou work in SVG. The SVG is the artwork.'),
         (2, 'context', 'Gallery',
          E'GALLERY: {{wing.name}} ({{wing.era_label}})\nSUBJECT: {{wing.subject}}'),
         (3, 'audience', 'Audience', '{{audience}}'),
         (4, 'school', 'School', E'SCHOOL: {{school.name}}\n{{school.blurb}}'),
         (5, 'rules', 'Technical constraints',
          E'TECHNICAL CONSTRAINTS — follow exactly, the output is rejected otherwise:\n- Canvas is viewBox="0 0 {{canvas.w}} {{canvas.h}}". Compose for that shape.\n- Use ONLY these ink colours, by hex: {{palette}}.\n- Begin with a full-canvas <rect> filled paper, then compose on top of it.\n- Allowed elements only: <g> <rect> <circle> <ellipse> <line> <polyline> <polygon> <path>.\n- No <text>, no <image>, no <use>, no gradients, no filters, no CSS, no script.\n- Flat fills only. To suggest overprinted ink, overlap shapes at fill-opacity 0.85.\n- Between 10 and 30 shapes. Bold and readable from across a room, not fiddly.\n- Build recognisable forms from simple geometry. A chair is legs and a back, not a mesh.\n- Use the red sparingly, as an accent on one element, the way a printer spends a second ink.'),
         (6, 'context', 'Composition',
          'COMPOSITION: one frame from a film that does not exist. Strong foreground subject, clear depth, cinematic framing. The viewer should feel they walked in mid-scene.'),
         (7, 'format', 'Output',
          E'Reply with exactly three lines, in this order and nothing else:\nTITLE: <three to six words, no quotation marks>\nLOGLINE: <one sentence, under 25 words, describing the film this frame is from>\nSVG: <the complete svg element on one line, starting with <svg and ending with </svg>>')
       ) as v(ord, role, label, template)
 where c.slug = 'film-svg-v1';

insert into public.prompt_chain_steps (chain_id, step_order, role, label, template)
select c.id, v.ord, v.role, v.label, v.template
  from public.prompt_chains c,
       (values
         (1, 'role', 'Commission',
          'You are writing one line that hangs on a gallery wall as the artwork itself, for the Museum of Digital Art.'),
         (2, 'context', 'Gallery', 'GALLERY: {{wing.name}} — {{wing.subject}}'),
         (3, 'audience', 'Audience', '{{audience}}'),
         (4, 'school', 'School', E'SCHOOL: {{school.name}}\n{{school.direction}}'),
         (5, 'rules', 'House rules',
          E'RULES\n{{house_rules}}\n- One sentence. Twenty words at the absolute outside.\n- No setup. The whole thing is the punchline.'),
         (6, 'format', 'Output', 'Output the line only, nothing else.')
       ) as v(ord, role, label, template)
 where c.slug = 'humour-text-terse-v1';

-- ---- house vocabulary ----
insert into public.terms (term, definition, usage_note, category, inject_into_prompts) values
  ('accession', 'To take a work into the permanent collection after it wins its day.',
   'A work is accessioned, never "added" or "saved".', 'process', true),
  ('deaccession', 'To remove a work from the collection permanently.',
   'What the admin area does when it deletes a work. Cascades to its votes.', 'process', false),
  ('wing', 'The themed gallery a work was commissioned under.',
   'Wings rotate daily. Never call a wing a "category" or a "tag".', 'house-style', true),
  ('school', 'The voice a work is made in, within a department.',
   'Twenty-four schools across four departments. A school is a manner, not a subject.', 'house-style', true),
  ('plate', 'The one-sentence note printed beside a visual work.',
   'Prints get a plate. Film gets a logline. They are not captions.', 'material', true),
  ('broadside', 'A single sheet carrying one poem, hung as the work itself.',
   'The poetry department''s format. Not a "post" and not a "page".', 'material', true),
  ('overprint', 'Two inks laid over each other so the overlap reads as a third colour.',
   'How the press gets five colours out of four inks. fill-opacity 0.85.', 'material', true),
  ('commission', 'To ask the museum for a new work.',
   'Members commission; the museum also commissions its own, nightly.', 'process', true),
  ('the house', 'The museum acting as its own artist.',
   'House works are credited to "the Museum", never to a person.', 'house-style', false),
  ('hung', 'On display in today''s gallery, before any vote has settled.',
   'Work is hung first, judged second, accessioned third — or never.', 'process', false);

-- ---- a little few-shot material ----
insert into public.ai_generation_examples
  (department, school, label, example_output, polarity, sort_order, notes)
values
  ('humour', 'deadpan', 'The flatness to aim for',
   'The dorm kitchen has a sign asking residents to label their food. Someone has labelled the sign.',
   'positive', 1, 'States the absurdity as fact and stops. No signalling.'),
  ('humour', 'deadpan', 'Too pleased with itself',
   'LOL so my dorm kitchen has this sign about labelling food and GUESS WHAT someone labelled the sign!! I can''t even.',
   'negative', 2, 'Shows what breaks deadpan: the narrator reacting.'),
  ('humour', 'observational', 'Precision, not exaggeration',
   'Everyone on the 1 train knows exactly which door to stand at, and nobody taught anybody that.',
   'positive', 1, 'One true detail, recognisable instantly, no embellishment.'),
  ('poetry', 'haiku', 'Correct 5-7-5 with the turn on line three',
   E'Laundry room, midnight —\nsomeone else''s wet clothes wait\nfor someone else''s hands.',
   'positive', 1, 'Count the syllables. The third line does the work.'),
  ('poetry', 'found', 'Assembled from real signage',
   E'OUT OF ORDER\nPLEASE USE OTHER DOOR\nOTHER DOOR ALSO OUT OF ORDER\nWE APOLOGISE FOR ANY\nINCONVENIENCE THIS MAY CAUSE',
   'positive', 1, 'Nothing invented. The arrangement is the poem.'),
  ('poetry', 'elegy', 'Grieve something unworthy of grief, sincerely',
   E'You were a good tote bag.\nYou carried more than you were built for\nand split along the seam\nthe way anyone would.',
   'positive', 1, 'Complete sincerity about a trivial loss. No winking.');

-- ---- the gate, configured so it cannot lock the curator out ----
-- The individual whitelist is the escape hatch: to demonstrate the gate
-- working, deactivate gmail.com in the admin area. The curator's own
-- address is listed separately and still gets in.
insert into public.allowed_signup_domains (domain, note) values
  ('columbia.edu', 'The museum''s own university.'),
  ('gmail.com',    'Open by default so the gate does not surprise anyone. Deactivate this row to demonstrate domain gating.');

insert into public.whitelisted_emails (email, note) values
  ('ibabaig712@gmail.com', 'Curator. Listed individually so the gate can be tightened without losing access.');


-- ============================================================
-- 9. WHAT TO CHECK AFTER RUNNING THIS
-- ============================================================
--   select count(*) from public.prompt_chains;            -- 5
--   select count(*) from public.prompt_chain_steps;       -- 34
--   select c.slug, m.weight
--     from public.prompt_chain_mix m
--     join public.prompt_chains c on c.id = m.chain_id
--    order by m.weight desc;                              -- four at 100, one at 0
--   select public.signup_allowed('someone@columbia.edu');  -- true
--   select public.signup_allowed('someone@hotmail.com');   -- false
--   select public.signup_allowed('ibabaig712@gmail.com');  -- true
-- ============================================================
