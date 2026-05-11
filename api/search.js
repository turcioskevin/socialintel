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
