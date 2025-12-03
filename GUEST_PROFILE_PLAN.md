# Guest Mode & Onboarding Plan

## Objectives
- Replace the static landing page with an onboarding-first flow that activates new visitors via pre-built curiosity quizzes before revealing the URL submission UI.
- Persist lightweight “guest” identities so repeat visitors skip onboarding and their submissions are attributable without requiring email/password registration.
- Harden backend workflows by binding every session token to a `user_id`, ensuring leaked links cannot access someone else’s quizzes without the matching identifier.

## Data Model Changes
### `public.users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK, default `gen_random_uuid()` | Source of truth for guest + future registered users |
| `auth_method` | `text` (`guest\|email\|oauth`), default `guest` | Allows seamless upgrade paths later |
| `email` | `text` unique nullable | Placeholder emails like `guest+<id>@diffread.internal` keep mail columns non-null without sending mail |
| `display_name` | `text` nullable | Optional personalization |
| `last_seen_at` | `timestamptz` | Touch on every authenticated request |
| `metadata` | `jsonb` default `{}` | Flags for onboarding completion, experiments, device info |
| `created_at` / `updated_at` | `timestamptz` default `now()` | Managed by shared trigger |

### `public.sessions`
- Add `user_id uuid not null references public.users(id)`.
- Backfill existing sessions by collapsing distinct `user_email` values into user rows and linking them.
- Drop the `UNIQUE (user_email, article_url)` constraint; replace with `UNIQUE (user_id, article_url)`.
- Continue storing `user_email`, but frontends will eventually send synthesized guest emails (or leave null once downstream code no longer depends on it).

### `public.quizzes`
- Rebuild `user_id` as a `uuid references public.users(id)` (previously an unused `bigint`).
- Recreate the partial index `one_shared_quiz_per_article` so shared quizzes still enforce uniqueness when `user_id IS NULL`.

## Client Workflow
1. **Bootstrap guest profile**
   - On first visit, frontend omits `userId`; backend creates the user row, returns `{ userId }`, frontend writes it to `localStorage`.
2. **Onboarding gate**
   - Without a stored `userId`, render two predefined curiosity quizzes + CTA. Completion toggles `onboardingCompleted` in `metadata` and reveals the URL form.
   - Returning guests (storage hit) skip quizzes immediately.
3. **URL submission**
   - Form always includes `?q=sessionToken` plus `userId` in the JSON payload/header. Backend associates the session + quiz jobs with that user.

## Backend Workflow
1. **Request validation**
   - Every handler reading `session_token` also expects `userId`.
   - If the provided `userId` is missing: create a new guest row, return its ID, treat request as the first session.
   - If the `userId` does not exist: recreate it (log as `bogus_guest_id`) and proceed; TODO: tighten policy later.
   - If `session_token` maps to a different `user_id`: do *not* return data; instead mint a fresh session for the provided user.
2. **Job orchestration**
   - `sessions.user_id` propagates to `quizzes.user_id`, then to curiosity/scaffold worker logs for personalization and analytics.
   - All analytics/events should include `user_id` so we can merge cross-session history.

## Security + Recovery Decisions
- **No session-token recovery**: without the matching `userId`, leaked URLs cannot resume another user’s quiz.
- **Guest ID recovery**: optional “Have a guest ID?” affordance lets users paste a saved ID to repopulate storage. Otherwise they start fresh.
- **Logging**: auto-creation of missing IDs is logged and tagged with TODO to enforce stricter validation (rate limits, signed tokens) later.

## Implementation Checklist
1. **DB migration** (this change set) — add `users` table, backfill `sessions`, rebuild `quizzes.user_id`, recreate indexes/triggers/grants.
2. **Supabase client updates** — regenerate types, update server utilities to expect `userId`.
3. **Backend API changes** — enforce session/user binding, create guest records, emit placeholder emails where required.
4. **Frontend onboarding** — `localStorage` guestId helper, onboarding quiz UI, gated URL submission form.
5. **Observability** — log bogus ID recreations and key onboarding milestones.
