// Feasibility probe for transcribing Threads videos from a link alone.
// It only looks: it never downloads a video and never changes what the clipping flow does.
// Each probe writes one "[threads-video-probe]" line to the server log with hosts only, no full addresses.

export type VideoFinding = {
  /** Where in the page a video address was found. */
  kinds: string[];
  /** Video addresses found, unescaped. Kept in memory for the reachability check, never logged in full. */
  urls: string[];
};

const decode = (value: string) => value
  .replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/");

/** Finds video addresses in one Threads page. Pure, for tests. */
export function findThreadsVideo(html: string): VideoFinding {
  const kinds = new Set<string>();
  const urls: string[] = [];
  const add = (kind: string, raw: string) => {
    const url = decode(raw.trim());
    if (!/^https:\/\//.test(url)) return;
    kinds.add(kind);
    if (!urls.includes(url)) urls.push(url);
  };
  for (const match of html.matchAll(/<(?:video|source)\b[^>]*?\bsrc=["']([^"']+)["']/gi)) add("video_tag", match[1]);
  for (const match of html.matchAll(/<meta\b[^>]*?property=["']og:video(?::secure_url|:url)?["'][^>]*?content=["']([^"']+)["']/gi)) add("og_video", match[1]);
  for (const match of html.matchAll(/<meta\b[^>]*?content=["']([^"']+)["'][^>]*?property=["']og:video(?::secure_url|:url)?["']/gi)) add("og_video", match[1]);
  for (const block of html.matchAll(/"video_versions"\s*:\s*\[([^\]]*)\]/g))
    for (const match of block[1].matchAll(/"url"\s*:\s*"([^"]+)"/g)) add("video_versions", match[1]);
  for (const match of html.matchAll(/https?:(?:\\\/|\/){2}[^"'\s<>]+?\.mp4[^"'\s<>]*/g)) add("mp4_link", match[0]);
  return { kinds: [...kinds], urls };
}

const host = (url: string) => { try { return new URL(url).hostname; } catch { return "invalid"; } };

/** Asks for the first two bytes of a video to learn whether it can be fetched without signing in. */
async function reachable(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
    return {
      status: res.status,
      type: res.headers.get("content-type") || "",
      total: (res.headers.get("content-range") || "").split("/")[1] || res.headers.get("content-length") || "",
      expires: /[?&]oe=/.test(url),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.name : "unknown" };
  }
}

function summary(finding: VideoFinding) {
  return { found: finding.urls.length > 0, kinds: finding.kinds, hosts: [...new Set(finding.urls.map(host))], count: finding.urls.length };
}

/**
 * Logs whether a post's embed page, and its post page when the embed shows none, carries a video
 * that can be fetched. Runs in the background; every failure is swallowed.
 */
export function probeThreadsVideo(code: string, embedHtml: string, readPage: () => Promise<string>): void {
  void (async () => {
    try {
      const embed = findThreadsVideo(embedHtml);
      let page: VideoFinding | null = null;
      // The extra post-page read happens only on the running site, so tests that count requests stay unchanged.
      if (!embed.urls.length && process.env.NODE_ENV === "production") {
        try { page = findThreadsVideo(await readPage()); } catch { page = { kinds: ["page_unreadable"], urls: [] }; }
      }
      const first = embed.urls[0] ?? page?.urls[0];
      console.info("[threads-video-probe]", JSON.stringify({
        code, embed: summary(embed), ...(page ? { page: summary(page) } : {}),
        ...(first ? { fetch: await reachable(first) } : {}),
      }));
    } catch (error) {
      console.info("[threads-video-probe]", JSON.stringify({ code, error: error instanceof Error ? error.name : "unknown" }));
    }
  })();
}
