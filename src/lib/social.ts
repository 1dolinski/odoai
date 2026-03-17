import { createClient } from "apinow-sdk";

const BASE_URL = "https://stablesocial.dev";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createClient({ privateKey: process.env.APINOW_PRIVATE_KEY as `0x${string}` });
  }
  return _client;
}

export type Platform = "tiktok" | "instagram" | "facebook" | "reddit";

export interface SocialEndpoint {
  id: string;
  path: string;
  description: string;
  dependsOn?: string;
  params: { name: string; required: boolean; description: string }[];
}

export const SOCIAL_PLATFORMS: Record<Platform, { label: string; endpoints: SocialEndpoint[] }> = {
  tiktok: {
    label: "TikTok",
    endpoints: [
      { id: "profile", path: "/api/tiktok/profile", description: "Get user profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "posts", path: "/api/tiktok/posts", description: "Get user posts", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }, { name: "max_posts", required: false, description: "Max posts (default 50)" }] },
      { id: "post-comments", path: "/api/tiktok/post-comments", description: "Get video comments", dependsOn: "posts", params: [{ name: "post_id", required: true, description: "Post/video ID" }, { name: "max_results", required: false, description: "Max results" }] },
      { id: "comment-replies", path: "/api/tiktok/comment-replies", description: "Get replies to a comment", dependsOn: "post-comments", params: [{ name: "comment_id", required: true, description: "Comment ID" }] },
      { id: "followers", path: "/api/tiktok/followers", description: "Get followers", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }, { name: "max_followers", required: false, description: "Max followers (default 500)" }] },
      { id: "following", path: "/api/tiktok/following", description: "Get following", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }, { name: "max_followers", required: false, description: "Max (default 500)" }] },
      { id: "search", path: "/api/tiktok/search", description: "Search posts by keyword", params: [{ name: "query", required: true, description: "Search keyword" }, { name: "max_results", required: false, description: "Max results" }] },
      { id: "search-hashtag", path: "/api/tiktok/search-hashtag", description: "Search by hashtag", params: [{ name: "hashtag", required: true, description: "Hashtag" }] },
      { id: "search-profiles", path: "/api/tiktok/search-profiles", description: "Search user profiles", params: [{ name: "query", required: true, description: "Search query" }] },
      { id: "search-music", path: "/api/tiktok/search-music", description: "Search by music/sound", params: [{ name: "query", required: true, description: "Music/sound query" }] },
    ],
  },
  instagram: {
    label: "Instagram",
    endpoints: [
      { id: "profile", path: "/api/instagram/profile", description: "Get user profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "posts", path: "/api/instagram/posts", description: "Get user posts", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }, { name: "max_posts", required: false, description: "Max posts" }] },
      { id: "post-comments", path: "/api/instagram/post-comments", description: "Get post comments", dependsOn: "posts", params: [{ name: "post_id", required: true, description: "Post ID" }] },
      { id: "comment-replies", path: "/api/instagram/comment-replies", description: "Get replies to a comment", dependsOn: "post-comments", params: [{ name: "comment_id", required: true, description: "Comment ID" }] },
      { id: "followers", path: "/api/instagram/followers", description: "Get followers", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }, { name: "max_followers", required: false, description: "Max followers" }] },
      { id: "following", path: "/api/instagram/following", description: "Get following", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "stories", path: "/api/instagram/stories", description: "Get user stories", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "highlights", path: "/api/instagram/highlights", description: "Get user highlights", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "search", path: "/api/instagram/search", description: "Search posts by keyword", params: [{ name: "query", required: true, description: "Search keyword" }] },
      { id: "search-tags", path: "/api/instagram/search-tags", description: "Search by tag", params: [{ name: "tag", required: true, description: "Tag" }] },
    ],
  },
  facebook: {
    label: "Facebook",
    endpoints: [
      { id: "profile", path: "/api/facebook/profile", description: "Get page/user profile", params: [{ name: "handle", required: true, description: "Username or page" }] },
      { id: "posts", path: "/api/facebook/posts", description: "Get page/user posts", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username or page" }, { name: "max_posts", required: false, description: "Max posts" }] },
      { id: "post-comments", path: "/api/facebook/post-comments", description: "Get post comments", dependsOn: "posts", params: [{ name: "post_id", required: true, description: "Post ID" }] },
      { id: "comment-replies", path: "/api/facebook/comment-replies", description: "Get replies to comment", dependsOn: "post-comments", params: [{ name: "comment_id", required: true, description: "Comment ID" }] },
      { id: "followers", path: "/api/facebook/followers", description: "Get followers", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "following", path: "/api/facebook/following", description: "Get following", dependsOn: "profile", params: [{ name: "handle", required: true, description: "Username" }] },
      { id: "search", path: "/api/facebook/search", description: "Search posts by keyword", params: [{ name: "query", required: true, description: "Search keyword" }] },
      { id: "search-people", path: "/api/facebook/search-people", description: "Search people profiles", params: [{ name: "query", required: true, description: "Search query" }] },
      { id: "search-pages", path: "/api/facebook/search-pages", description: "Search page profiles", params: [{ name: "query", required: true, description: "Search query" }] },
      { id: "search-groups", path: "/api/facebook/search-groups", description: "Search group profiles", params: [{ name: "query", required: true, description: "Search query" }] },
    ],
  },
  reddit: {
    label: "Reddit",
    endpoints: [
      { id: "post", path: "/api/reddit/post", description: "Get post details", params: [{ name: "post_id", required: true, description: "Post ID or URL" }] },
      { id: "post-comments", path: "/api/reddit/post-comments", description: "Get post comments", dependsOn: "post", params: [{ name: "post_id", required: true, description: "Post ID" }] },
      { id: "comment", path: "/api/reddit/comment", description: "Get comment details", params: [{ name: "comment_id", required: true, description: "Comment ID" }] },
      { id: "search", path: "/api/reddit/search", description: "Search posts by keyword", params: [{ name: "query", required: true, description: "Search keyword" }] },
      { id: "search-profiles", path: "/api/reddit/search-profiles", description: "Search user profiles", params: [{ name: "query", required: true, description: "Search query" }] },
      { id: "subreddit", path: "/api/reddit/subreddit", description: "Get subreddit posts", params: [{ name: "subreddit", required: true, description: "Subreddit name" }] },
    ],
  },
};

export function getAllPlatforms(): { id: Platform; label: string; endpointCount: number }[] {
  return (Object.entries(SOCIAL_PLATFORMS) as [Platform, typeof SOCIAL_PLATFORMS[Platform]][]).map(([id, p]) => ({
    id,
    label: p.label,
    endpointCount: p.endpoints.length,
  }));
}

export function getEndpointsForPlatform(platform: Platform): SocialEndpoint[] {
  return SOCIAL_PLATFORMS[platform]?.endpoints || [];
}

export interface SocialQueryResult {
  platform: Platform;
  endpoint: string;
  params: Record<string, string>;
  data: unknown;
  cost: string;
  fetchedAt: Date;
  error?: string;
}

export async function querySocial(
  platform: Platform,
  endpointId: string,
  params: Record<string, string>
): Promise<SocialQueryResult> {
  const platformDef = SOCIAL_PLATFORMS[platform];
  if (!platformDef) {
    return { platform, endpoint: endpointId, params, data: null, cost: "$0.00", fetchedAt: new Date(), error: `Unknown platform: ${platform}` };
  }
  const ep = platformDef.endpoints.find((e) => e.id === endpointId);
  if (!ep) {
    return { platform, endpoint: endpointId, params, data: null, cost: "$0.00", fetchedAt: new Date(), error: `Unknown endpoint: ${endpointId}` };
  }

  const apinow = getClient();
  const url = `${BASE_URL}${ep.path}`;

  try {
    const data = await apinow.callExternal(url, {
      method: "POST",
      body: params,
    });

    return {
      platform,
      endpoint: endpointId,
      params,
      data: typeof data === "string" ? JSON.parse(data) : data,
      cost: "$0.06",
      fetchedAt: new Date(),
    };
  } catch (err) {
    return {
      platform,
      endpoint: endpointId,
      params,
      data: null,
      cost: "$0.00",
      fetchedAt: new Date(),
      error: String(err),
    };
  }
}

export async function discoverPrice(platform: Platform, endpointId: string): Promise<{ totalPrice: string; upstreamPrice: string; proxyFee: string } | null> {
  const ep = SOCIAL_PLATFORMS[platform]?.endpoints.find((e) => e.id === endpointId);
  if (!ep) return null;
  const apinow = getClient();
  try {
    const price = await apinow.discoverPrice(`${BASE_URL}${ep.path}`);
    return price as { totalPrice: string; upstreamPrice: string; proxyFee: string };
  } catch {
    return null;
  }
}
