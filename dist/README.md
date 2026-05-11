# SignalTrace

SignalTrace is a public social presence intelligence dashboard. It searches public identities, normalizes candidate profiles, and builds a cross-platform activity timeline.

## Current MVP

- Static browser app with no build step.
- Live public lookups for GitHub, Reddit public user overview, and Hacker News.
- Sample connector slots for X / Twitter and YouTube to show how API-backed sources will appear.
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
