const providers = [
  {
    id: "github",
    label: "GitHub",
    status: "live",
    async search(query) {
      const username = cleanHandle(query);
      const profileResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
      if (!profileResponse.ok) return emptyResult("GitHub");

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
          details: `${profile.public_repos || 0} public repos • ${profile.followers || 0} followers`
        }],
        activities: [
          ...repos.map((repo) => ({
            platform: "GitHub",
            type: "repo",
            title: repo.name,
            body: repo.description || `${profile.login} maintains this public repository.`,
            url: repo.html_url,
            date: repo.updated_at,
            engagement: repo.stargazers_count || 0,
            tags: [repo.language, "repository"].filter(Boolean)
          })),
          ...events.map((event) => ({
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
  {
    id: "reddit",
    label: "Reddit",
    status: "limited",
    async search(query) {
      const username = cleanHandle(query);
      const [overview, about] = await Promise.all([
        fetchJson(`https://www.reddit.com/user/${encodeURIComponent(username)}/overview.json?limit=30`),
        fetchJson(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`)
      ]);

      if (!overview?.data?.children?.length && !about?.data?.name) return emptyResult("Reddit");

      const account = about?.data || { name: username };
      return {
        profiles: [{
          platform: "Reddit",
          handle: account.name || username,
          displayName: `u/${account.name || username}`,
          avatar: account.icon_img || "",
          url: `https://www.reddit.com/user/${encodeURIComponent(account.name || username)}`,
          confidence: exactConfidence(username, account.name || username),
          details: `${account.total_karma || 0} karma • public overview`
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
  {
    id: "hn",
    label: "Hacker News",
    status: "live",
    async search(query) {
      const username = cleanHandle(query);
      const user = await fetchJson(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`);
      if (!user?.id) return emptyResult("Hacker News");

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
          details: `${user.karma || 0} karma • account created ${formatDate(new Date((user.created || 0) * 1000).toISOString())}`
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
  {
    id: "sample",
    label: "Sample social graph",
    status: "live",
    async search(query) {
      const handle = cleanHandle(query);
      await wait(350);
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
];

const state = {
  query: "",
  profiles: [],
  activities: [],
  selectedPlatform: "all",
  selectedType: "all"
};

const form = document.querySelector("#searchForm");
const sourceList = document.querySelector("#sourceList");
const statusEl = document.querySelector("#status");
const timelineEl = document.querySelector("#timeline");
const profilesEl = document.querySelector("#profiles");
const topicsEl = document.querySelector("#topics");
const resultTitle = document.querySelector("#resultTitle");
const platformFilter = document.querySelector("#platformFilter");
const typeFilter = document.querySelector("#typeFilter");
const exportButton = document.querySelector("#exportButton");

const renderSources = () => {
  sourceList.innerHTML = providers.map((provider) => `
    <li><span class="dot ${provider.status}" aria-hidden="true"></span>${provider.label}</li>
  `).join("");
};

const runSearch = async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const query = formData.get("query").trim();
  const selectedProviders = providers.filter((provider) => formData.get(provider.id));
  if (!query || !selectedProviders.length) return;

  state.query = query;
  state.profiles = [];
  state.activities = [];
  resultTitle.textContent = `Searching "${query}"`;
  statusEl.textContent = `Checking ${selectedProviders.map((provider) => provider.label).join(", ")}...`;
  render();

  const sourceIds = selectedProviders.map((provider) => provider.id);
  const apiResult = await searchViaApi(query, sourceIds);
  let failures = [];

  if (apiResult) {
    state.profiles = apiResult.profiles;
    state.activities = apiResult.activities;
    failures = apiResult.failures.map((failure) => `${failure.label}: ${failure.message}`);
  } else {
    const settled = await Promise.allSettled(selectedProviders.map((provider) => provider.search(query)));

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        state.profiles.push(...result.value.profiles);
        state.activities.push(...result.value.activities);
      } else {
        failures.push(`${selectedProviders[index].label}: ${result.reason.message}`);
      }
    });
  }

  state.activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  resultTitle.textContent = `Public activity for "${query}"`;
  statusEl.textContent = failures.length
    ? `Search complete with ${failures.length} source issue${failures.length === 1 ? "" : "s"}. ${failures.join(" ")}`
    : "Search complete. Review candidate matches before treating profiles as the same person.";
  updatePlatformFilter();
  render();
};

const searchViaApi = async (query, sources) => {
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, sources })
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

const render = () => {
  const activities = filteredActivities();
  document.querySelector("#profileCount").textContent = state.profiles.length;
  document.querySelector("#activityCount").textContent = activities.length;
  document.querySelector("#sourceCount").textContent = new Set(state.activities.map((item) => item.platform)).size;
  document.querySelector("#latestActivity").textContent = activities[0] ? formatDate(activities[0].date) : "-";

  timelineEl.innerHTML = activities.length ? activities.map(renderActivity).join("") : `<div class="empty">No timeline items yet.</div>`;
  profilesEl.innerHTML = state.profiles.length ? state.profiles.map(renderProfile).join("") : `<div class="empty">No candidate profiles yet.</div>`;
  topicsEl.innerHTML = renderTopics(activities);
};

const renderActivity = (item) => `
  <article class="activity-card">
    <div class="activity-meta">
      <span class="pill">${escapeHtml(item.platform)}</span>
      <span class="pill">${escapeHtml(item.type)}</span>
      <span class="pill">${formatDate(item.date)}</span>
      <span class="pill">${Number(item.engagement || 0)} engagement</span>
    </div>
    <h2>${escapeHtml(item.title || "Untitled activity")}</h2>
    <p>${escapeHtml(truncate(item.body || "No public text available.", 260))}</p>
    <div class="activity-meta">
      ${(item.tags || []).slice(0, 4).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
    </div>
    <a href="${item.url}" target="_blank" rel="noopener noreferrer">Open source</a>
  </article>
`;

const renderProfile = (profile) => {
  const avatar = profile.avatar
    ? `<img class="avatar" src="${profile.avatar}" alt="" />`
    : `<div class="avatar avatar-fallback" aria-hidden="true">${escapeHtml(initials(profile.displayName))}</div>`;

  return `
    <article class="profile-card">
      ${avatar}
      <div>
        <strong>${escapeHtml(profile.displayName)}</strong>
        <span>${escapeHtml(profile.platform)} • ${escapeHtml(profile.handle)} • ${profile.confidence}% match</span>
        <span>${escapeHtml(profile.details)}</span>
      </div>
    </article>
  `;
};

const renderTopics = (activities) => {
  const counts = new Map();
  activities.forEach((activity) => {
    [...(activity.tags || []), activity.platform, activity.type].forEach((tag) => {
      const key = String(tag).toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...topics.map((topic) => topic[1]), 1);

  return topics.length ? topics.map(([topic, count]) => `
    <div class="topic">
      <span>${escapeHtml(topic)}</span>
      <meter min="0" max="${max}" value="${count}"></meter>
      <strong>${count}</strong>
    </div>
  `).join("") : `<div class="empty">Topics appear after search.</div>`;
};

const updatePlatformFilter = () => {
  const platforms = [...new Set(state.activities.map((item) => item.platform))].sort();
  platformFilter.innerHTML = `<option value="all">All platforms</option>${platforms.map((platform) => `<option value="${escapeHtml(platform)}">${escapeHtml(platform)}</option>`).join("")}`;
};

const filteredActivities = () => state.activities.filter((item) => {
  const platformMatch = state.selectedPlatform === "all" || item.platform === state.selectedPlatform;
  const typeMatch = state.selectedType === "all" || item.type === state.selectedType;
  return platformMatch && typeMatch;
});

const exportData = () => {
  const blob = new Blob([JSON.stringify({
    query: state.query,
    generatedAt: new Date().toISOString(),
    profiles: state.profiles,
    activities: state.activities
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `signaltrace-${cleanHandle(state.query || "export")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
};

const emptyResult = (platform) => ({ platform, profiles: [], activities: [] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanHandle = (value) => value.trim().replace(/^@/, "").replace(/^u\//i, "").split(/\s+/)[0];
const exactConfidence = (query, handle) => cleanHandle(query).toLowerCase() === String(handle).toLowerCase() ? 96 : 62;
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "-";
const truncate = (value, length) => value.length > length ? `${value.slice(0, length - 1)}...` : value;
const stripHtml = (value) => String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const initials = (value) => String(value).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ST";

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

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

const capitalize = (value) => String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);

form.addEventListener("submit", runSearch);
platformFilter.addEventListener("change", () => {
  state.selectedPlatform = platformFilter.value;
  render();
});
typeFilter.addEventListener("change", () => {
  state.selectedType = typeFilter.value;
  render();
});
exportButton.addEventListener("click", exportData);

renderSources();
render();
