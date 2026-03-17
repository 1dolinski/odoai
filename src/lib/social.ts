import { createClient } from "apinow-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createSIWxPayload, encodeSIWxHeader } from "@x402/extensions/sign-in-with-x";
import { decodePaymentRequiredHeader } from "@x402/core/http";

const BASE_URL = "https://stablesocial.dev";
const JOBS_URL = `${BASE_URL}/api/jobs`;

let _client: ReturnType<typeof createClient> | null = null;

function cleanKey(raw: string): `0x${string}` {
  let k = raw.trim();
  if (!k.startsWith("0x")) k = `0x${k}`;
  if (k.length !== 66) throw new Error(`APINOW_PRIVATE_KEY wrong length: got ${k.length} chars, expected 66 (0x + 64 hex)`);
  return k as `0x${string}`;
}

function getPrivateKey(): `0x${string}` {
  const pk = process.env.APINOW_PRIVATE_KEY;
  if (!pk) throw new Error("APINOW_PRIVATE_KEY not configured — set it in Vercel env vars");
  return cleanKey(pk);
}

function getClient() {
  if (!_client) {
    _client = createClient({ privateKey: getPrivateKey() });
  }
  return _client;
}

function getSigner() {
  return privateKeyToAccount(getPrivateKey());
}

export function isConfigured(): boolean {
  const pk = process.env.APINOW_PRIVATE_KEY?.trim();
  return !!pk && pk.length >= 64;
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
      { id: "profile", path: "/api/instagram/profile", description: "Get user profile", params: [{ name: "handle", required: true, description: "Username (without @)" }] },
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
  jobToken?: string;
  pollStatus?: "pending" | "finished" | "failed" | "timeout";
}

export interface PollResult {
  status: "pending" | "finished" | "failed" | "timeout";
  data?: unknown;
  error?: string;
  attempts: number;
}

async function siwxAuthFetch(url: string): Promise<Response> {
  const signer = getSigner();
  const res = await fetch(url);

  if (res.status !== 402) return res;

  const prHeader = res.headers.get("PAYMENT-REQUIRED") || res.headers.get("payment-required");
  if (!prHeader) return res;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paymentRequired: any;
  try {
    paymentRequired = decodePaymentRequiredHeader(prHeader);
  } catch {
    return res;
  }

  const siwxExt = paymentRequired.extensions?.["sign-in-with-x"];
  if (!siwxExt?.supportedChains?.length) return res;

  const paymentNetwork = paymentRequired.accepts?.[0]?.network;
  const chain = paymentNetwork
    ? siwxExt.supportedChains.find((c: { chainId: string }) => c.chainId === paymentNetwork)
    : siwxExt.supportedChains.find((c: { chainId: string }) => c.chainId.startsWith("eip155:"));

  if (!chain) return res;

  const completeInfo = { ...siwxExt.info, chainId: chain.chainId, type: chain.type };
  const payload = await createSIWxPayload(completeInfo as Parameters<typeof createSIWxPayload>[0], signer);
  const header = encodeSIWxHeader(payload);

  return fetch(url, { headers: { "SIGN-IN-WITH-X": header } });
}

export async function pollJobResult(
  token: string,
  { maxAttempts = 20, initialDelayMs = 2000, maxDelayMs = 10000, deadlineMs = 50000 } = {}
): Promise<PollResult> {
  const url = `${JOBS_URL}?token=${encodeURIComponent(token)}`;
  const start = Date.now();
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - start > deadlineMs) {
      return { status: "timeout", attempts: attempt - 1, error: `Polling timed out after ${deadlineMs}ms` };
    }

    try {
      const res = await siwxAuthFetch(url);

      if (!res.ok && res.status !== 200) {
        const text = await res.text().catch(() => "");
        if (res.status === 401) return { status: "failed", attempts: attempt, error: `Token invalid/expired (401): ${text}` };
        if (res.status === 403) return { status: "failed", attempts: attempt, error: `Wrong wallet (403): ${text}` };
        if (res.status === 402) {
          return { status: "failed", attempts: attempt, error: `SIWX auth not accepted (402) — server may not support server-side SIWX yet: ${text}` };
        }
        return { status: "failed", attempts: attempt, error: `HTTP ${res.status}: ${text}` };
      }

      const body = await res.json();

      if (body.status === "finished") {
        return { status: "finished", data: body.data, attempts: attempt };
      }
      if (body.status === "failed") {
        return { status: "failed", error: body.error || "Job failed", attempts: attempt };
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        return { status: "failed", attempts: attempt, error: `Poll error: ${err}` };
      }
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, maxDelayMs);
  }

  return { status: "timeout", attempts: maxAttempts, error: "Max poll attempts reached" };
}

export async function querySocial(
  platform: Platform,
  endpointId: string,
  params: Record<string, string>,
  { autoPoll = true, pollDeadlineMs = 50000 } = {}
): Promise<SocialQueryResult> {
  const platformDef = SOCIAL_PLATFORMS[platform];
  if (!platformDef) {
    return { platform, endpoint: endpointId, params, data: null, cost: "$0.00", fetchedAt: new Date(), error: `Unknown platform: ${platform}` };
  }
  const ep = platformDef.endpoints.find((e) => e.id === endpointId);
  if (!ep) {
    return { platform, endpoint: endpointId, params, data: null, cost: "$0.00", fetchedAt: new Date(), error: `Unknown endpoint: ${endpointId}` };
  }

  const url = `${BASE_URL}${ep.path}`;

  try {
    const apinow = getClient();
    const data = await apinow.callExternal(url, {
      method: "POST",
      body: params,
    });

    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    if (parsed?.token) {
      const jobToken: string = parsed.token;

      if (!autoPoll) {
        return {
          platform, endpoint: endpointId, params,
          data: parsed, cost: "$0.07", fetchedAt: new Date(),
          jobToken, pollStatus: "pending",
        };
      }

      const poll = await pollJobResult(jobToken, { deadlineMs: pollDeadlineMs });

      if (poll.status === "finished" && poll.data) {
        return {
          platform, endpoint: endpointId, params,
          data: poll.data, cost: "$0.07", fetchedAt: new Date(),
          jobToken, pollStatus: "finished",
        };
      }

      return {
        platform, endpoint: endpointId, params,
        data: parsed, cost: "$0.07", fetchedAt: new Date(),
        jobToken, pollStatus: poll.status,
        error: poll.status !== "finished" ? `Poll ${poll.status} after ${poll.attempts} attempts: ${poll.error || ""}` : undefined,
      };
    }

    return {
      platform, endpoint: endpointId, params,
      data: parsed, cost: "$0.07", fetchedAt: new Date(),
      pollStatus: "finished",
    };
  } catch (err) {
    _client = null;
    const e = err as Error;
    const detail = e.cause ? `${e.message} | cause: ${JSON.stringify(e.cause)}` : String(err);
    return {
      platform, endpoint: endpointId, params,
      data: null, cost: "$0.00", fetchedAt: new Date(),
      error: detail,
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
