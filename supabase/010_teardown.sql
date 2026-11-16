begin;

-- storage.objects is not 010's table, so its policies outlive any table drop
drop policy if exists "museum images are publicly readable" on storage.objects;
drop policy if exists "curators upload museum images"       on storage.objects;
drop policy if exists "curators replace museum images"      on storage.objects;
drop policy if exists "curators remove museum images"       on storage.objects;

-- auth.users always exists, so this is safe to drop unconditionally
drop trigger if exists enforce_signup_allowlist on auth.users;

-- cascade takes the prompt_chains_sync_mix trigger with its table, which
-- matters: DROP TRIGGER IF EXISTS still errors when the table is absent
drop table if exists
  public.llm_responses, public.generation_requests, public.prompt_chain_mix,
  public.prompt_chain_steps, public.ai_generation_examples, public.prompt_chains,
  public.llm_models, public.llm_providers, public.terms,
  public.allowed_signup_domains, public.whitelisted_emails, public.images cascade;

drop function if exists public.enforce_signup_allowlist();
drop function if exists public.signup_allowed(text);
drop function if exists public.sync_prompt_chain_mix();

-- The museum-images bucket is left alone: 010 re-inserts it with
-- "on conflict do nothing", and dropping it would fail once it holds files.
commit;
