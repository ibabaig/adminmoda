# MoDA — Registrar's Office

The admin area for [MoDA, the Museum of Digital Archives](https://github.com/ibabaig/modagallery).
A second Next.js app, a second Vercel project, the **same** Supabase
database.

Four rooms:

| Route     | What it does                                              | Access |
| --------- | --------------------------------------------------------- | ------ |
| `/`       | Condition report — statistics drawn from the live schema   | read   |
| `/media`  | The accession register for AI-generated works              | **create, read, update, delete** |
| `/people` | Membership profiles                                        | read   |
| `/votes`  | The ratings ledger — every upvote and downvote             | read   |

---

## The wall

Every route is behind Google sign-in **and** a `profiles.is_superadmin`
check. There are four gates, and they are deliberately redundant:

1. **`proxy.ts` → `lib/supabase/proxy.ts`.** A default-deny allowlist.
   `PUBLIC_PATHS` is the complete list of paths that don't need a
   curator: `/login`, `/denied`, `/auth/callback`, `/auth/signout`.
   Everything else — including any page added later — is gated without
   anyone having to remember to gate it. A blocklist would get this
   backwards: each new page would be exposed until someone listed it.

2. **`requireSuperadmin()` in every page and every server action.**
   Looks redundant next to the proxy. It isn't. A server action is a
   POST endpoint with a generated URL; it does not inherit the
   authorisation of the page whose form called it. And a proxy matcher
   is one regex away from accidentally excluding a route.

3. **Row-level security**, in Postgres, on every table. This is the only
   gate that survives a mistake in the other three.

4. **No service-role key.** `.env.example` has no `SERVICE_ROLE_KEY` and
   the app never asks for one. It signs in as an ordinary user and the
   database decides what it may see. A bug in this codebase therefore
   leaks nothing — Postgres refuses the query. That is also why the
   dashboard doubles as an access test: a panel that renders is a panel
   RLS permitted.

Two details worth naming:

- The superadmin check reads `profiles.is_superadmin` **from the
  database**, not from a JWT claim. Revoking someone's access has to
  take effect immediately, and a token issued an hour ago must not
  outlive it.
- `getClaims()`, never `getSession()`. `getClaims()` verifies the token's
  signature; `getSession()` reads the cookie without revalidating it, and
  must never decide access.

---

## "If `is_superadmin` is required to use the admin area, won't I be locked out?"

Yes — on the first run, and that is the correct behaviour. The first
grant has to come from **outside the system it controls**, because any
in-app route that could mint the first superadmin would be an
unauthenticated privilege-escalation endpoint sitting in the repo.

So the bootstrap uses the one channel that is already outside the app:
the Supabase SQL Editor, which connects as the database owner and
**ignores RLS entirely.**

1. Run `supabase/009_admin_access.sql` in the SQL Editor. Every profile
   starts at `is_superadmin = false`, so nobody has access yet.
2. Sign in to the deployed admin app with Google. You will be bounced to
   `/denied` — this is the wall working, and it is also what creates your
   `profiles` row via the `auth.users` trigger.
3. Back in the SQL Editor:

   ```sql
   update public.profiles
      set is_superadmin = true
    where email = 'you@example.com';
   ```

4. Reload the admin app. You're in.

To promote a second curator later, do it the same way. There is
deliberately no UI for it: a page that can grant its own access is a page
that can be tricked into granting it.

---

## Setup

### 1. The migration

Run `supabase/009_admin_access.sql` in the Supabase SQL Editor. It:

- adds `profiles.is_superadmin`;
- revokes blanket `update` on `profiles` from `authenticated` and
  re-grants it **column by column** (`first_name`, `last_name`,
  `avatar_path`, `updated_at`) — so a member cannot promote themselves by
  calling the REST API directly, no matter what the app does;
- adds a `security definer` function `public.is_superadmin()`. A policy
  on `profiles` that queries `profiles` recurses forever;
  `security definer` with `set search_path = ''` breaks the cycle;
- adds superadmin policies: read all profiles (no update, no delete),
  full CRUD on `works`, read all `votes`, read all `cafe_seats`.

Note what is *not* there: no superadmin update or delete on `profiles`.
The brief asks for READ on users, so READ is all the database grants. If
this app sprouted an edit button tomorrow, Postgres would still refuse
it.

### 2. Google OAuth

Both apps use the same Supabase project, so they share one Google
client — but they are different domains, so Supabase has to be told about
the new one.

**Supabase → Authentication → URL Configuration → Redirect URLs**, add:

```
https://<your-admin-app>.vercel.app/auth/callback
https://<your-admin-app>-*.vercel.app/auth/callback
http://localhost:3001/auth/callback
```

The second line covers Vercel's per-commit preview URLs, which is what
the assignment asks you to submit.

Nothing changes in the Google Cloud console. Google's Authorized redirect
URI stays `https://<project-ref>.supabase.co/auth/v1/callback` — Google
always returns to Supabase, and Supabase forwards to whichever app URL is
on the list above.

### 3. Vercel

1. New Project → import `ibabaig/adminmoda`.
2. Environment variables (both environments):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Settings → Deployment Protection → Vercel Authentication: off.**
   Leave it on and the grader sees Vercel's own login screen instead of
   yours. This app's wall is its own; it does not need Vercel's, and
   Vercel's would hide it.
4. Deploy, then bootstrap yourself as above.

### 4. Local

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev -- --port 3001   # 3001, so the main app can keep 3000
```

---

## The dashboard

The brief asks for interesting statistics, creatively chosen. The eight
panels were picked to answer questions a leaderboard can't:

- **The ledger** — works, votes, members, days open, café seats, and the
  house/membership split.
- **Hung → judged → acquired**, per department. The gap between the
  first two columns is the real finding: work nobody voted on is work the
  museum never formed an opinion about.
- **The house against the membership** — the museum commissions four
  works every night. Does its own taste beat the people voting on it?
- **The works nobody could agree on** — ranked by turnout *discounted by
  margin* (`vote_count − |score| × 1.5`). High turnout, score near zero.
  A leaderboard only ever shows you consensus; this shows you argument.
- **How days ended** — including the quiet ones. A museum's history
  includes the weeks nobody came, so `no_votes` days are recorded rather
  than skipped.
- **School standings** — twenty-four schools across four departments as a
  league table. Which voice the membership actually rewards.
- **Last fortnight** — works and votes per day.
- **The café, as an atlas** — twelve drinks, twelve places, by orders.

And on `/votes`, a **conviction** column: the share of a member's ballots
that went one way. 100% across forty votes is someone clicking, not
judging — the signal you want before trusting a score.

The figures are computed in TypeScript from rows the database handed
over, not in SQL views. At a few thousand rows that's the right trade;
past that, `lib/stats.ts` is written to be lifted into views without the
pages changing.

---

## What the register will and won't edit

`/media/[id]` edits `title`, `body` and `caption`. It does not edit
`prompt`, `model`, `score` or `vote_count`, and those fields are shown
read-only beside the form.

That's a deliberate line. The prompt and model are the record of what a
model was asked and what it produced; the tallies are the record of what
members thought of it. A dashboard that can rewrite its own evidence is
not a dashboard. Hand-entered works are marked `model: manual` with a
prompt that says a curator typed them, rather than left blank to look
generated.

Deleting a work cascades to its votes. There is no undo, and the button
says so.

---

# Migration 010 — the prompt pipeline

Run `supabase/010_prompt_pipeline.sql` **after** 008 and 009. It adds
twelve tables and wires the main app's generation path to them.

Until this migration the museum's prompts lived in `lib/gemini.ts`, the
model name lived in an environment variable, and nothing recorded what
happened when a commission was attempted. All three now live in the
database.

## What each screen does, and what it is allowed to do

| Screen | Table(s) | Operations |
| --- | --- | --- |
| `/people` | `profiles` | read |
| `/pipeline` | `prompt_chains`, `prompt_chain_steps` | read |
| `/pipeline` | `prompt_chain_mix` | read, **update** |
| `/registry/terms` | `terms` | create, read, update, delete |
| `/media` | `works` | create, read, update, delete |
| `/requests` | `generation_requests`, `llm_responses` | read |
| `/registry/examples` | `ai_generation_examples` | create, read, update, delete |
| `/registry/llm-models` | `llm_models` | create, read, update, delete |
| `/registry/llm-providers` | `llm_providers` | create, read, update, delete |
| `/registry/signup-domains` | `allowed_signup_domains` | create, read, update, delete |
| `/registry/whitelisted-emails` | `whitelisted_emails` | create, read, update, delete |
| `/images` | `images` + Storage | create (upload), read, update, delete |

Where that table says read only, **migration 010 creates no write policy
at all**. The absence is the point: a stray write from this app is
refused by Postgres rather than merely missing from the interface. The
permission matrix was exercised against a scratch Postgres with 009 and
010 applied — `prompt_chains` and `prompt_chain_steps` reject inserts,
`generation_requests` and `llm_responses` reject deletes, an `UPDATE`
reaching `prompt_chain_mix` can touch only `weight` and `is_active`
(column-level grant), and an ordinary member can neither forge a house
attempt nor read anyone else's.

## Why the mix is read/update and not full CRUD

A mix row is *derived*: it exists because a chain exists. A trigger
(`sync_prompt_chain_mix`) creates one for every new chain and the
foreign-key cascade removes it. There is nothing for a curator to create
or delete by hand, and the only thing they ever need to change is the
weight — so that is the only thing the grant permits.

Weights are shown as a **share**, because a weight of 100 means nothing
on its own: only 100 against everything else active in that department.
`humour-text-terse-v1` ships at weight 0, which is how a prompt variant
is meant to arrive — present, inert, and one number away from taking
traffic without a deploy.

## The signup gate fails open

`public.signup_allowed(addr)` returns **true** when both
`allowed_signup_domains` and `whitelisted_emails` have no active rows. A
gate defaulting to closed would have locked the curator out of
registration the moment the migration ran, with the SQL editor as the
only way back in.

Seeded: `columbia.edu` and `gmail.com` as active domains, and the
curator's own address in `whitelisted_emails`. To demonstrate domain
gating, deactivate `gmail.com` on `/registry/signup-domains` — the
individually whitelisted address still gets in, which is exactly the
escape hatch that makes tightening the domains safe.

Enforcement is a `before insert` trigger on `auth.users`, kept separate
from `handle_new_user()` so a change to the gate cannot break profile
creation.

## Images store paths, not bytes

Files go to the `museum-images` Storage bucket; the `images` table holds
the bucket and path. Assignment 3 said it outright and it is still true.
Upload and catalogue happen together, and if the catalogue insert fails
the uploaded object is removed rather than left as an orphan nobody can
find. Deleting removes the file first, then the row: a failure then
leaves a row pointing at a file that still exists, which is the
recoverable direction.

## What the main app now records

`lib/prompt-pipeline.ts` in **modagallery** resolves a chain by weighted
draw, assembles the prompt from its steps, and interpolates
`{{wing.name}}`, `{{school.direction}}`, `{{audience}}`, `{{house_rules}}`,
`{{palette}}`, `{{canvas.w}}`, plus `{{examples}}` and `{{terms}}` which
are database lookups of their own. An unknown placeholder is left in
place rather than blanked, so a typo in a template shows up in the
stored prompt instead of silently deleting an instruction.

Every attempt writes a `generation_requests` row before the model is
called and completes it afterwards, with an `llm_responses` row carrying
`finish_reason`, token counts (including **thought** tokens), latency,
and the SVG sanitiser's verdict. That makes `/requests` able to report
success rate by department, p50 and p95 latency, the sanitiser rejection
rate, and how often a generation dies at `MAX_TOKENS` — the failure that
caused the poetry bug, since thinking and output share one budget.

**The literals in `lib/gemini.ts` are kept as a fallback.** If no chain
resolves — 010 not run, or every chain in a department switched off by
mistake — generation uses them instead of failing. A configuration
screen that can take the whole museum offline is a bad trade. All
telemetry is best-effort for the same reason: it is never the cause of a
failed commission.
