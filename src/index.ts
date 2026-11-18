import {
  handleCreateLink,
  handleListLinks,
  handleRedirect,
  htmlResponse,
  jsonResponse,
  renderNotFoundPage,
} from "./routes";
import type { Env } from "./types";

const STATIC_ASSET_PATHS = new Set([
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/favicon.ico",
]);

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // 1. API endpoints (/api/*)
    if (pathname === "/api/links") {
      if (method === "GET") {
        return handleListLinks(request, env);
      }
      if (method === "POST") {
        return handleCreateLink(request, env);
      }
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "API endpoint not found." }, 404);
    }

    if (pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    // 2. Serve static React assets for root or asset paths
    if (STATIC_ASSET_PATHS.has(pathname) || pathname.startsWith("/assets/")) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
    }

    // 3. Single-segment short code redirect route (`GET /:code`)
    const codeMatch = /^\/([^/]+)$/.exec(pathname);
    if (codeMatch && method === "GET") {
      const code = decodeURIComponent(codeMatch[1]);
      return handleRedirect(code, env);
    }

    // 4. Fallback to static assets or 404 Not Found
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return assetRes;
      }
    }

    return htmlResponse(renderNotFoundPage(pathname.slice(1)), 404);
  },
} satisfies ExportedHandler<Env>;
