# SignalTrace

SignalTrace is a public social presence intelligence dashboard. It searches public identities, normalizes candidate profiles, and builds a cross-platform activity timeline.

## Current MVP

- Static browser app with a Vercel serverless search API.
- Live public lookups for GitHub, Reddit public user overview, and Hacker News through `/api/search`.
- Connector slots for Instagram, TikTok, Facebook, Snapchat, X / Twitter, and YouTube to show how API-backed sources will appear.
- Unified activity model with platform, type, title, body, source URL, timestamp, engagement, and tags.
- Candidate profile list with match confidence.
- Timeline filters, topic extraction, and JSON export.

## Run Locally

```bash
cd SocialPresenceIntel
npm run dev
```

Then open:

```text
http://[::1]:4173/
```

## Build

```bash
npm run build
```

The deployable static site is copied into `dist/`.

## API

The frontend calls `POST /api/search` on Vercel:

```json
{
  "query": "octocat",
  "sources": ["github", "reddit", "hn", "sample"]
}
```

The endpoint returns normalized `profiles`, `activities`, and source-level `failures`.

### Facebook Setup

The Facebook connector supports public Facebook Pages through Meta Graph API. It does not support ordinary personal profile history.

Add this Vercel environment variable:

```text
FACEBOOK_ACCESS_TOKEN=your_meta_graph_api_token
```

Optional:

```text
FACEBOOK_GRAPH_VERSION=v25.0
```

Then search by exact Page handle, Page ID, or Page URL, for example:

```text
nasa
facebook.com/nasa
```

If Meta returns a `(#100)` permission error, the token is missing one of the required Page access paths:

- `Page Public Metadata Access` for public Page metadata.
- `Page Public Content Access` for public Page posts.
- `pages_read_engagement` with a Page access token for Pages you manage.

This is configured in the Meta Developer Dashboard under app review / feature access. A basic user token usually is not enough for arbitrary public Page activity.

## Deploy

### Vercel

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Use these settings:
   - Framework preset: Other
   - Root directory: `SocialPresenceIntel` if this is inside a larger repo
   - Build command: `npm run build`
   - Output directory: `dist`

### Netlify

1. Push this folder to a GitHub repository.
2. Create a new Netlify site from the repository.
3. Use these settings:
   - Base directory: `SocialPresenceIntel` if this is inside a larger repo
   - Build command: `npm run build`
   - Publish directory: `dist`

### GitHub Pages

Run `npm run build`, then publish the contents of `dist/` with GitHub Pages. If this app lives inside a larger repository, GitHub Actions is the cleanest way to copy `SocialPresenceIntel/dist` into the Pages artifact.

## Next Backend Step

For production platform coverage, add a backend service that:

- Stores source API keys outside the browser.
- Runs rate-limited connector jobs.
- Keeps source URLs and fetch timestamps for auditability.
- Uses official APIs or approved data providers where required.
- Separates "candidate match" from "confirmed same person" until a user reviews profile evidence.

Good first backend tables:

- `searches`: query, requester, created time, policy mode.
- `profiles`: platform, handle, display name, URL, avatar, confidence, review status.
- `activities`: profile id, platform, type, content, URL, published time, engagement, raw metadata.
- `source_runs`: provider, status, error, rate-limit metadata, started/finished timestamps.

Private accounts, deleted content, direct messages, hidden likes/follows, and authenticated-only activity should remain out of scope unless the account owner explicitly authorizes access through the platform.

See `PLATFORM_ACCESS.md` for the major-platform connector plan.
