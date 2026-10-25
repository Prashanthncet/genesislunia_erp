// @ts-nocheck
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare Worker build for the Next.js frontend.
 *
 * `opennextjs-cloudflare build` runs `next build` and then turns the output into
 * a Worker (`.open-next/worker.js` + static assets), so the app keeps its server
 * features — the `/api/*` rewrite to the NestJS API, per-route headers and the
 * client components — instead of being a static export.
 *
 * BACKEND_URL must be present when this build runs: Next bakes `rewrites()` into
 * the routes manifest at build time.
 */
export default defineCloudflareConfig({});
