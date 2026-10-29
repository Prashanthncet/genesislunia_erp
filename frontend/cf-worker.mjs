// Cloudflare Worker entry for genesis-erp-web.
//
// `/api/*` is proxied to the NestJS backend whose URL lives in Workers KV (binding CONFIG,
// key BACKEND_URL) and is read at request time. The backend currently runs behind a
// cloudflared tunnel whose hostname can change; updating that one KV key re-points the live
// site with no rebuild and no redeploy (.bin/keepalive.ps1 does it automatically).
// Everything else is the OpenNext-built Next.js app.
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const json = (status, message) =>
  new Response(JSON.stringify({ statusCode: status, message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const base = (await env.CONFIG.get("BACKEND_URL", { cacheTtl: 30 }))?.trim().replace(/\/+$/, "");
      if (!base) return json(503, "The school server is not configured yet. Please try again shortly.");
      const headers = new Headers(request.headers);
      headers.delete("host");
      const hasBody = !["GET", "HEAD"].includes(request.method);
      try {
        const res = await fetch(base + url.pathname + url.search, {
          method: request.method,
          headers,
          body: hasBody ? request.body : undefined,
          redirect: "manual",
          ...(hasBody ? { duplex: "half" } : {}),
        });
        // Tunnel up but backend down (Cloudflare 530/52x HTML pages) → a clean JSON error.
        if (res.status === 530 || (res.status >= 520 && res.status <= 527)) {
          return json(502, "The school server is unreachable right now. Please try again in a minute.");
        }
        return res;
      } catch {
        return json(502, "The school server is unreachable right now. Please try again in a minute.");
      }
    }
    return handler.fetch(request, env, ctx);
  },
};
