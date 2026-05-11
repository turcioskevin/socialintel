const providerMap = {
  github: {
    label: "GitHub",
    async search(query) {
      const username = cleanHandle(query);
      const profileResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
      if (!profileResponse.ok) return emptyResult();

      const profile = await profileResponse.json();
      const [events, repos] = await Promise.all([
        fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`),
        fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=20`)
      ]);

      return {
        profiles: [{
          platform: "GitHub",
          handle: profile.login,
          displayName: profile.name || profile.login,
          avatar: profile.avatar_url,
          url: profile.html_url,
          confidence: exactConfidence(username, profile.login),
          details: `${profile.public_repos || 0} public repos - ${profile.followers || 0} followers`
        }],
        activities: [
          ...(repos || []).map((repo) => ({
            platform: "GitHub",
            type: "repo",
            title: repo.name,
            body: repo.description || `${profile.login} maintains this public repository.`,
            url: repo.html_url,
            date: repo.updated_at,
            engagement: repo.stargazers_count || 0,
            tags: [repo.language, "repository"].filter(Boolean)
          })),
          ...(events || []).map((event) => ({
            platform: "GitHub",
            type: "event",
            title: githubEventTitle(event),
            body: githubEventBody(event),
            url: `https://github.com/${event.repo?.name || profile.login}`,
            date: event.created_at,
            engagement: 0,
            tags: [event.type.replace("Event", ""), event.repo?.name].filter(Boolean)
          }))
        ]
      };
    }
  },
  reddit: {
    label: "Reddit",
    async search(query) {
      const username = cleanHandle(query);
      const [overview, about] = await Promise.all([
        fetchJson(`https://www.reddit.com/user/${encodeURIComponent(username)}/overview.json?limit=30`),
        fetchJson(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`)
      ]);

      if (!overview?.data?.children?.length && !about?.data?.name) return emptyResult();

      const account = about?.data || { name: username };
      return {
        profiles: [{
          platform: "Reddit",
          handle: account.name || username,
          displayName: `u/${account.name || username}`,
          avatar: account.icon_img || "",
          url: `https://www.reddit.com/user/${encodeURIComponent(account.name || username)}`,
          confidence: exactConfidence(username, account.name || username),
          details: `${account.total_karma || 0} karma - public overview`
        }],
        activities: (overview?.data?.children || []).map(({ data }) => ({
          platform: "Reddit",
          type: data.is_self || data.title ? "post" : "comment",
          title: data.title || `Comment in r/${data.subreddit}`,
          body: stripHtml(data.selftext || data.body || data.link_title || ""),
          url: `https://www.reddit.com${data.permalink}`,
          date: new Date((data.created_utc || 0) * 1000).toISOString(),
          engagement: data.score || 0,
          tags: [`r/${data.subreddit}`, data.link_flair_text].filter(Boolean)
        }))
      };
    }
  },
  hn: {
    label: "Hacker News",
    async search(query) {
      const username = cleanHandle(query);
      const user = await fetchJson(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`);
      if (!user?.id) return emptyResult();

      const itemIds = (user.submitted || []).slice(0, 25);
      const items = await Promise.all(itemIds.map((id) => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));

      return {
        profiles: [{
          platform: "Hacker News",
          handle: user.id,
          displayName: user.id,
          avatar: "",
          url: `https://news.ycombinator.com/user?id=${encodeURIComponent(user.id)}`,
          confidence: exactConfidence(username, user.id),
          details: `${user.karma || 0} karma - account created ${formatDate(new Date((user.created || 0) * 1000).toISOString())}`
        }],
        activities: items.filter(Boolean).map((item) => ({
          platform: "Hacker News",
          type: item.type === "comment" ? "comment" : "post",
          title: item.title || `Comment by ${user.id}`,
          body: stripHtml(item.text || item.url || ""),
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          date: new Date((item.time || 0) * 1000).toISOString(),
          engagement: item.score || 0,
          tags: [item.type, item.dead ? "dead" : ""].filter(Boolean)
        }))
      };
    }
  },
  instagram: {
    label: "Instagram",
    async search(query) {
      return placeholderSocialResult(query, {
        platform: "Instagram",
        url: `https://www.instagram.com/${encodeURIComponent(cleanHandle(query))}/`,
        details: "Official APIs focus on Business/Creator accounts and approved Meta access.",
        title: "Instagram public profile and media connector",
        body: "Next step: connect Meta's Instagram APIs for professional accounts, hashtag discovery, business discovery, and permitted public media fields.",
        tags: ["meta", "business-creator", "api-review"]
      });
    }
  },
  tiktok: {
    label: "TikTok",
    async search(query) {
      return placeholderSocialResult(query, {
        platform: "TikTok",
        url: `https://www.tiktok.com/@${encodeURIComponent(cleanHandle(query))}`,
        details: "Public research-grade access generally requires TikTok Research API approval.",
        title: "TikTok public videos, comments, and account data connector",
        body: "Next step: apply for TikTok Research API access or use an approved data provider for public creator/video discovery.",
        tags: ["research-api", "approval-required", "video"]
      });
    }
  },
  facebook: {
    label: "Facebook",
    async search(query) {
      return searchFacebookPage(query);
    }
  },
  snapchat: {
    label: "Snapchat",
    async search(query) {
      return placeholderSocialResult(query, {
        platform: "Snapchat",
        url: `https://www.snapchat.com/add/${encodeURIComponent(cleanHandle(query))}`,
        details: "Snap Public Profile API is allowlist-based.",
        title: "Snapchat Public Profile connector",
        body: "Next step: request Snap Public Profile API access for creator discovery, profile metadata, public Spotlight, and Saved Story metrics.",
        tags: ["allowlist", "public-profile", "spotlight"]
      });
    }
  },
  sample: {
    label: "Sample social graph",
    async search(query) {
      const handle = cleanHandle(query);
      return {
        profiles: [
          {
            platform: "X / Twitter",
            handle,
            displayName: query,
            avatar: "",
            url: `https://x.com/${encodeURIComponent(handle)}`,
            confidence: 64,
            details: "Connector stub: requires official API or approved data partner"
          },
          {
            platform: "YouTube",
            handle,
            displayName: `${query} channel`,
            avatar: "",
            url: `https://www.youtube.com/@${encodeURIComponent(handle)}`,
            confidence: 58,
            details: "Connector stub: needs YouTube Data API key"
          }
        ],
        activities: [
          {
            platform: "X / Twitter",
            type: "post",
            title: `Potential public posts for @${handle}`,
            body: "This slot shows how the timeline will look once a compliant X API provider is connected.",
            url: `https://x.com/search?q=${encodeURIComponent(handle)}`,
            date: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
            engagement: 0,
            tags: ["connector-needed", "public-search"]
          },
          {
            platform: "YouTube",
            type: "profile",
            title: "YouTube channel discovery",
            body: "Use channel search and video list endpoints on the backend to avoid exposing API keys in the browser.",
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            date: new Date(Date.now() - 3600 * 1000 * 24 * 3).toISOString(),
            engagement: 0,
            tags: ["api-key", "backend"]
          }
        ]
      };
    }
  }
};

module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = String(request.body?.query || "").trim();
  const sources = Array.isArray(request.body?.sources) ? request.body.sources : [];
  const selectedSources = sources.filter((source) => providerMap[source]);

  if (!query) {
    response.status(400).json({ error: "Missing search query" });
    return;
  }

  if (!selectedSources.length) {
    response.status(400).json({ error: "Select at least one supported source" });
    return;
  }

  const settled = await Promise.allSettled(selectedSources.map(async (source) => {
    const result = await providerMap[source].search(query);
    return { source, ...result };
  }));

  const profiles = [];
  const activities = [];
  const failures = [];

  settled.forEach((result, index) => {
    const source = selectedSources[index];
    if (result.status === "fulfilled") {
      profiles.push(...result.value.profiles);
      activities.push(...result.value.activities);
    } else {
      failures.push({
        source,
        label: providerMap[source].label,
        message: result.reason?.message || "Source failed"
      });
    }
  });

  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  response.status(200).json({
    query,
    generatedAt: new Date().toISOString(),
    profiles,
    activities,
    failures
  });
};

const setCorsHeaders = (response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const searchFacebookPage = async (query) => {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageIdentifier = cleanFacebookPageIdentifier(query);

  if (!accessToken) {
    return placeholderSocialResult(query, {
      platform: "Facebook",
      url: `https://www.facebook.com/${encodeURIComponent(pageIdentifier)}`,
      details: "Set FACEBOOK_ACCESS_TOKEN in Vercel to fetch Page metadata and posts.",
      title: "Facebook connector needs a Meta access token",
      body: "This connector is wired for public Facebook Pages. Add a Meta Graph API token in Vercel, then search by Page handle, Page ID, or Page URL.",
      tags: ["env-required", "meta", "pages"]
    });
  }

  const version = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
  const fields = [
    "id",
    "name",
    "username",
    "link",
    "category",
    "fan_count",
    "verification_status",
    "picture.type(large)",
    "about",
    "posts.limit(25){id,message,story,created_time,permalink_url,full_picture,shares,comments.summary(true),likes.summary(true)}"
  ].join(",");
  const params = new URLSearchParams({
    fields,
    access_token: accessToken
  });
  const page = await fetchFacebookJson(`https://graph.facebook.com/${version}/${encodeURIComponent(pageIdentifier)}?${params}`);

  if (!page?.id) {
    return placeholderSocialResult(query, {
      platform: "Facebook",
      url: `https://www.facebook.com/${encodeURIComponent(pageIdentifier)}`,
      details: "No Facebook Page data returned for this handle or ID.",
      title: "Facebook Page not found or not accessible",
      body: "Try an exact public Page handle or Page URL. Personal profiles and many restricted Pages are not available through this connector.",
      tags: ["not-found", "pages", "exact-handle"]
    });
  }

  return {
    profiles: [{
      platform: "Facebook",
      handle: page.username || page.id,
      displayName: page.name || pageIdentifier,
      avatar: page.picture?.data?.url || "",
      url: page.link || `https://www.facebook.com/${page.id}`,
      confidence: exactConfidence(query, page.username || page.name || pageIdentifier),
      details: [
        page.category,
        typeof page.fan_count === "number" ? `${page.fan_count.toLocaleString("en-US")} followers` : "",
        page.verification_status ? `${page.verification_status} verification` : ""
      ].filter(Boolean).join(" - ") || "Facebook Page"
    }],
    activities: (page.posts?.data || []).map((post) => ({
      platform: "Facebook",
      type: post.full_picture ? "post" : "comment",
      title: post.story || page.name || "Facebook Page post",
      body: post.message || post.story || "Public Facebook Page activity.",
      url: post.permalink_url || `https://www.facebook.com/${post.id}`,
      date: post.created_time,
      engagement: facebookEngagement(post),
      tags: ["facebook-page", post.full_picture ? "media" : "status"].filter(Boolean)
    }))
  };
};

const fetchFacebookJson = async (url) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || `Facebook API request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const cleanFacebookPageIdentifier = (value) => {
  const input = String(value || "").trim();
  const withoutProtocol = input.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (withoutProtocol.toLowerCase().startsWith("facebook.com/")) {
    const path = withoutProtocol.slice("facebook.com/".length).split(/[/?#]/)[0];
    return path || cleanHandle(input);
  }
  return cleanHandle(input);
};

const facebookEngagement = (post) => {
  const shares = post.shares?.count || 0;
  const comments = post.comments?.summary?.total_count || 0;
  const likes = post.likes?.summary?.total_count || 0;
  return shares + comments + likes;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SignalTrace/0.1 public-social-intel"
    }
  });
  if (!response.ok) return null;
  return response.json();
};

const emptyResult = () => ({ profiles: [], activities: [] });
const placeholderSocialResult = (query, config) => {
  const handle = cleanHandle(query);
  return {
    profiles: [{
      platform: config.platform,
      handle,
      displayName: query,
      avatar: "",
      url: config.url,
      confidence: 55,
      details: config.details
    }],
    activities: [{
      platform: config.platform,
      type: "profile",
      title: config.title,
      body: config.body,
      url: config.url,
      date: new Date().toISOString(),
      engagement: 0,
      tags: config.tags
    }]
  };
};
const cleanHandle = (value) => value.trim().replace(/^@/, "").replace(/^u\//i, "").split(/\s+/)[0];
const exactConfidence = (query, handle) => cleanHandle(query).toLowerCase() === String(handle).toLowerCase() ? 96 : 62;
const formatDate = (value) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "-";
const stripHtml = (value) => String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const capitalize = (value) => String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);

const githubEventTitle = (event) => {
  const repo = event.repo?.name || "a repository";
  const verbs = {
    PushEvent: `Pushed commits to ${repo}`,
    CreateEvent: `Created ${event.payload?.ref_type || "item"} in ${repo}`,
    PullRequestEvent: `${capitalize(event.payload?.action || "updated")} pull request in ${repo}`,
    IssuesEvent: `${capitalize(event.payload?.action || "updated")} issue in ${repo}`,
    WatchEvent: `Starred ${repo}`,
    ForkEvent: `Forked ${repo}`
  };
  return verbs[event.type] || `${event.type.replace("Event", "")} in ${repo}`;
};

const githubEventBody = (event) => {
  if (event.type === "PushEvent") {
    return (event.payload?.commits || []).map((commit) => commit.message).join(" ");
  }
  if (event.payload?.pull_request?.title) return event.payload.pull_request.title;
  if (event.payload?.issue?.title) return event.payload.issue.title;
  return `${event.actor?.login || "This user"} had public activity on ${event.repo?.name || "GitHub"}.`;
};
