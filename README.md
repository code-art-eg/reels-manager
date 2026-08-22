# Reels Manager

A shared library of Instagram Reels and TikTok clips for a small team. Paste a
link, get a human-readable reference id, tag it by style and client, and find it
again later.

## What it does

- **Add clips** — paste an Instagram Reel or TikTok URL. The platform is detected
  from the link, short/share links are followed, the clip is verified against the
  platform, and a small thumbnail is generated and stored as binary in Postgres.
  Each clip gets an incrementing reference: `PT-0001`, `PT-0002`, …
- **Tag clips** — open-ended **style** tags and **client** tags. Typing a new
  name creates it; existing ones are offered as suggestions. Plus free-text notes.
- **Browse & find** — search across reference id, URL, tags and notes; click any
  tag to filter (multiple tags narrow the results); grid/list toggle; 20 per page,
  newest first. All view state lives in the URL, so any view can be shared.
- **Multi-user** — one shared library. `admin` manages users; `member` can do
  everything else. Enforced by Postgres row-level security, not just the UI.
- **Delete** — permanent, with a confirmation step. Tags and thumbnails cascade.

## Setup

### 1. Environment

`.env.local` holds:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Server-only. Needed for user management (invite / change role / delete).
SUPABASE_SECRET_KEY=sb_secret_...

# Server-only. Used to apply migrations from scripts/db.mjs.
SUPABASE_DB_PASSWORD=...

# Optional. Instagram thumbnails — see "Instagram thumbnails" below.
META_APP_ID=...
META_CLIENT_TOKEN=...

# Optional. Absolute URL used in invitation emails.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Database

Migrations live in `supabase/migrations/` and are applied in filename order:

```sh
for f in supabase/migrations/*.sql; do node scripts/db.mjs apply "$f"; done
```

`scripts/db.mjs` connects through Supabase's session-mode pooler, because the
direct database host is IPv6-only and many networks cannot reach it. It probes
the pooler regions once and caches the result in `.supabase-region`.

Ad-hoc queries:

```sh
node scripts/db.mjs query "select count(*) from clips"
```

### 3. Accounts

The library is **invite only**. There is exactly one exception: while the
instance has *no* accounts at all, `/auth/sign-up` offers a one-time bootstrap
form, and the account it creates becomes the `admin`. As soon as any account
exists that page shows "Sign-up is closed" and the login page stops linking to
it.

Everyone else is added by an admin from **Users** in the app. That creates the
account and shows a **one-time set-password link** to pass on — links are shown
rather than emailed because Supabase's built-in mailer is heavily rate limited
and restricted to project members. Configure custom SMTP if you would rather it
send email (the user can also just use "Forgot your password?").

There is also a CLI route, useful for the very first admin:

```sh
pnpm tsx scripts/create-user.ts you@example.com 'a-strong-password' admin
```

> **Required for invite-only to actually hold:** turn **off**
> Supabase → Authentication → Sign In / Providers → Email →
> *"Allow new users to sign up"*. Until that is off, anyone holding the
> publishable key can self-register by calling the auth endpoint directly,
> bypassing the UI. Both the bootstrap form and the admin add-member form go
> through the admin API, so they keep working with it disabled.
>
> Blocking self-service sign-up in a database trigger does *not* work, and was
> tried and reverted (see `supabase/migrations/20260822000900_*`): GoTrue inserts
> the `auth.users` row before applying `invited_at` / `app_metadata`, so at
> INSERT time an admin-created account is indistinguishable from a public one.

### 4. Run

```sh
pnpm dev
```

## Instagram thumbnails

TikTok works out of the box: its oEmbed endpoint is public, confirms the video
exists, and returns a thumbnail. It rate-limits per IP, so lookups retry briefly.

Instagram is different, and worth knowing about:

- Fetching a reel page server-side returns a JavaScript shell with **no**
  `og:image`, and answers HTTP 200 even for reels that do not exist — so
  scraping can neither thumbnail nor validate.
- The official route is Meta's `instagram_oembed`, but Meta gates the
  **oEmbed Read** feature behind **App Review**. Until an app is approved the
  endpoint returns error code 10 for everyone.

So the app degrades honestly: an Instagram clip still saves, keeps its reference
id, tags and notes, and renders a branded placeholder tile instead of a
thumbnail — and the save message says the link could not be verified. Once your
Meta app passes App Review for oEmbed Read, thumbnails and real validation start
working with no code change.

## Architecture notes

| Area | Where |
| --- | --- |
| URL parsing / platform detection | `lib/clips/platform.ts` |
| Provider lookups (existence + metadata) | `lib/clips/oembed.ts` |
| Thumbnail download and re-encode | `lib/clips/thumbnail.ts` |
| Add / edit / delete server actions | `lib/clips/actions.ts` |
| Reads (search, facets, one clip) | `lib/clips/queries.ts` |
| URL ⇄ filter state | `lib/clips/search-params.ts` |
| Auth + role helpers | `lib/auth.ts` |
| First-admin bootstrap | `lib/bootstrap.ts`, `lib/signup.ts` |
| User management actions | `lib/admin/actions.ts` |
| Schema, RLS, functions | `supabase/migrations/` |

Some deliberate choices:

- **Thumbnails are `bytea` in a side table** (`clip_thumbnails`), not on `clips`.
  List queries never touch the blobs, and they are served through
  `/api/clips/[id]/thumbnail` behind the same auth as everything else. Images are
  re-encoded to WebP bounded to 400×720, which lands around 13–25 KB.
- **`bytea` moves as base64** through `set_clip_thumbnail` /
  `get_clip_thumbnail`, because PostgREST cannot carry binary in a JSON body.
- **Search uses a denormalised `search_text` column** on `clips`, refreshed by
  triggers when the clip or its tags change, with a trigram GIN index. That keeps
  "search across id, URL, tags and notes" a single indexed predicate.
- **`search_clips` is one RPC returning `{ total, items }`** so a page and its
  count arrive together, and multi-tag AND filtering stays in SQL.
- **Helper functions live in a `private` schema** that is not exposed over the
  API. Trigger helpers are `security definer` so writes do not depend on the
  calling role having access to that schema.
- **Cache Components is off** (`next.config.ts`). Every route is authenticated
  and per-user, so there is no static shell worth streaming — and a prerendered
  shell commits HTTP 200 before `notFound()` can run.

## Checks

These are executable scripts rather than a test runner. Run them with the dev
server up:

```sh
pnpm tsx scripts/check-e2e.ts               # schema, RLS, roles, cascades
pnpm tsx scripts/check-pages.ts             # every page renders, auth gates hold
pnpm tsx scripts/check-add-flow.ts          # real URL -> verify -> thumbnail -> serve
pnpm tsx scripts/check-instagram-fallback.ts# Instagram degrades without oEmbed
pnpm tsx scripts/check-lookup.ts <url>      # inspect one link's pipeline
```

`check-e2e.ts` and `check-add-flow.ts` create and remove their own fixtures.
`check-pages.ts` and the others sign in as `uitest@example.com`; create that user
first with `scripts/create-user.ts`.
