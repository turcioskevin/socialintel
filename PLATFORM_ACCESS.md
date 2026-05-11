# Platform Access Plan

SignalTrace should treat major consumer platforms as backend connectors with explicit access states. The product can discover public profile candidates immediately, but deep activity history depends on each platform's official API access, partner approval, or an approved data provider.

## Instagram

- Best official path: Meta Instagram APIs for Business and Creator accounts.
- Useful data: professional account profile data, owned media, business discovery, hashtag discovery, public media fields that the app is approved to access.
- Limits: personal account media is no longer broadly available through the old Basic Display API flow; production apps need Meta app review and permissions.

## Facebook

- Best official path: Meta Graph API for Pages and, where eligible, Meta Content Library/API.
- Useful data: public Page metadata and permitted Page feed content.
- Limits: personal profile activity is not a general public API surface.
- Current connector: `POST /api/search` accepts `facebook` as a source and reads exact public Page handles, Page IDs, or Page URLs when `FACEBOOK_ACCESS_TOKEN` is set.
- Required access: `Page Public Metadata Access` for public Page details, `Page Public Content Access` for public Page posts, or `pages_read_engagement` with a Page access token for Pages you manage.

## TikTok

- Best official path: TikTok Research API for approved research use, or an approved commercial data provider.
- Useful data: public videos, comments, account metadata, timestamps, and engagement fields exposed by the approved access tier.
- Limits: access requires application and approval; general unrestricted public scraping is not a stable production strategy.

## Snapchat

- Best official path: Snap Public Profile API.
- Useful data: Public Profile metadata, creator discovery, public stats, Spotlight and Saved Story metrics depending on access.
- Limits: the Public Profile API is allowlist-based.

## Implementation Order

1. Keep `/api/search` as the single connector gateway.
2. Add a `source_runs` table before storing results.
3. Add provider credentials as Vercel environment variables.
4. Implement one approved connector at a time.
5. Keep candidate identity review separate from confirmed identity matching.
