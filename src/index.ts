export interface Env {
  DB: D1Database;
}

export interface LinkRecord {
  id: number;
  code: string;
  original_url: string;
  clicks: number;
  created_at: string;
}

export type ValidationResult =
  | { valid: true; url: string }
  | { valid: false; error: string };

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHORT_CODE_LENGTH = 6;
const MAX_COLLISION_RETRIES = 5;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function getEffectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

/**
 * Validates a candidate URL string:
 * 1. Parses using `new URL()`
 * 2. Strictly allows only `http:` and `https:` protocols
 * 3. Rejects URLs pointing to the shortener's own host to prevent redirect loops
 */
export function validateUrl(rawUrl: unknown, request: Request): ValidationResult {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { valid: false, error: "Please provide a non-empty URL." };
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: "Invalid URL format. Please enter a complete URL starting with http:// or https://.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Invalid URL protocol. Only http: and https: protocols are allowed.",
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      error: "Invalid URL: hostname is missing.",
    };
  }

  const requestUrl = new URL(request.url);
  const requestHostHeader = request.headers.get("host")?.toLowerCase().trim();
  const targetHost = parsed.host.toLowerCase();
  const currentHost = requestUrl.host.toLowerCase();

  const isExactHostMatch =
    targetHost === currentHost ||
    (requestHostHeader !== undefined && targetHost === requestHostHeader);

  const isLocalAliasMatch =
    LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase()) &&
    LOCAL_HOSTNAMES.has(requestUrl.hostname.toLowerCase()) &&
    getEffectivePort(parsed) === getEffectivePort(requestUrl);

  if (isExactHostMatch || isLocalAliasMatch) {
    return {
      valid: false,
      error: "Cannot shorten a URL pointing to this shortener's own host (redirect loop prevented).",
    };
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * Generates a cryptographically random 6-character alphanumeric code.
 */
export function generateShortCode(length = SHORT_CODE_LENGTH): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHANUMERIC[randomBytes[i] % ALPHANUMERIC.length];
  }
  return code;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function handleCreateLink(request: Request, env: Env): Promise<Response> {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validation = validateUrl(body?.url, request);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const code = generateShortCode();
    try {
      const created = await env.DB.prepare(
        `INSERT INTO links (code, original_url)
         VALUES (?, ?)
         RETURNING id, code, original_url, clicks, created_at`
      )
        .bind(code, validation.url)
        .first<LinkRecord>();

      if (created) {
        return jsonResponse(created, 201);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE") && attempt < MAX_COLLISION_RETRIES - 1) {
        continue;
      }
      return jsonResponse({ error: "Failed to save shortened link." }, 500);
    }
  }

  return jsonResponse({ error: "Could not generate a unique short code. Please try again." }, 500);
}

async function handleListLinks(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, code, original_url, clicks, created_at
     FROM links
     ORDER BY created_at DESC, id DESC`
  ).all<LinkRecord>();

  return jsonResponse(results ?? [], 200);
}

async function handleRedirect(code: string, env: Env): Promise<Response> {
  const link = await env.DB.prepare(
    `UPDATE links
     SET clicks = clicks + 1
     WHERE code = ?
     RETURNING id, code, original_url, clicks, created_at`
  )
    .bind(code)
    .first<LinkRecord>();

  if (!link) {
    return htmlResponse(renderNotFoundPage(code), 404);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.original_url,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

function renderNotFoundPage(code: string): string {
  const safeCode = escapeHtml(code);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Short Link Not Found</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f8fafc;
      --surface: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --border: #e2e8f0;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --code-bg: #f1f5f9;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #334155;
        --primary: #3b82f6;
        --primary-hover: #60a5fa;
        --code-bg: #0f172a;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    main {
      max-width: 28rem;
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 2rem;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }
    .badge {
      display: inline-block;
      font-size: 0.875rem;
      font-weight: 700;
      color: #dc2626;
      background: rgba(220, 38, 38, 0.12);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 1.5rem;
    }
    p {
      margin: 0 0 1.5rem;
      color: var(--muted);
      line-height: 1.5;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: var(--code-bg);
      padding: 0.15rem 0.4rem;
      border-radius: 0.25rem;
      color: var(--text);
    }
    a.button {
      display: inline-block;
      background: var(--primary);
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      padding: 0.65rem 1.25rem;
      border-radius: 0.5rem;
      transition: background 0.15s ease;
    }
    a.button:hover {
      background: var(--primary-hover);
    }
    a.button:focus-visible {
      outline: 3px solid var(--primary);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <main>
    <span class="badge">404 Error</span>
    <h1>Short Link Not Found</h1>
    <p>We couldn't find any shortened link matching <code>/${safeCode}</code>. It may have been mistyped or never existed.</p>
    <a class="button" href="/">Back to URL Shortener</a>
  </main>
</body>
</html>`;
}

function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>URL Shortener — Cloudflare Workers &amp; D1</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-alt: #f1f5f9;
      --text: #0f172a;
      --muted: #475569;
      --border: #e2e8f0;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --error-text: #b91c1c;
      --success-bg: #f0fdf4;
      --success-border: #bbf7d0;
      --success-text: #15803d;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --surface-alt: #0f172a;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #334155;
        --primary: #3b82f6;
        --primary-hover: #2563eb;
        --error-bg: rgba(239, 68, 68, 0.15);
        --error-border: rgba(239, 68, 68, 0.4);
        --error-text: #fca5a5;
        --success-bg: rgba(34, 197, 94, 0.15);
        --success-border: rgba(34, 197, 94, 0.4);
        --success-text: #86efac;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem 4rem;
    }
    .container {
      max-width: 56rem;
      margin: 0 auto;
    }
    header {
      margin-bottom: 1.75rem;
    }
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.875rem;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 0;
      color: var(--muted);
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    label {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .input-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    input[type="url"] {
      flex: 1 1 18rem;
      padding: 0.7rem 0.9rem;
      font-size: 1rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background: var(--surface-alt);
      color: var(--text);
    }
    input[type="url"]:focus-visible,
    button:focus-visible,
    a:focus-visible {
      outline: 3px solid var(--primary);
      outline-offset: 2px;
    }
    button {
      cursor: pointer;
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 0.5rem;
      padding: 0.7rem 1.35rem;
      font-size: 1rem;
      font-weight: 600;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    button:hover:not(:disabled) {
      background: var(--primary-hover);
    }
    button:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--surface-alt);
    }
    .alert {
      margin-top: 0.85rem;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.925rem;
      border: 1px solid transparent;
    }
    .alert[hidden] {
      display: none;
    }
    .alert-error {
      background: var(--error-bg);
      border-color: var(--error-border);
      color: var(--error-text);
    }
    .alert-success {
      background: var(--success-bg);
      border-color: var(--success-border);
      color: var(--success-text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .alert-success a {
      color: inherit;
      font-weight: 700;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 0.5rem;
    }
    .section-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }
    .table-wrapper {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.95rem;
    }
    th, td {
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th {
      font-weight: 600;
      color: var(--muted);
      font-size: 0.825rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .original-url {
      max-width: 24rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
      color: var(--text);
      text-decoration: none;
    }
    .original-url:hover {
      text-decoration: underline;
    }
    .short-link {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 600;
      color: var(--primary);
      text-decoration: none;
    }
    .short-link:hover {
      text-decoration: underline;
    }
    .clicks-badge {
      display: inline-block;
      min-width: 2rem;
      text-align: center;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 0.15rem 0.6rem;
      font-size: 0.85rem;
    }
    .empty-state {
      text-align: center;
      color: var(--muted);
      padding: 2rem 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>URL Shortener</h1>
      <p>Fast local link shortener powered by Cloudflare Workers &amp; D1.</p>
    </header>

    <main>
      <section class="card" aria-labelledby="shorten-heading">
        <form id="shorten-form" novalidate>
          <label id="shorten-heading" for="url-input">Long URL to shorten</label>
          <div class="input-row">
            <input
              id="url-input"
              name="url"
              type="url"
              inputmode="url"
              placeholder="https://example.com/some/very/long/path"
              autocomplete="off"
              required
            />
            <button id="submit-btn" type="submit">Shorten URL</button>
          </div>
        </form>

        <div id="error-banner" class="alert alert-error" role="alert" aria-live="assertive" hidden></div>
        <div id="success-banner" class="alert alert-success" role="status" aria-live="polite" hidden></div>
      </section>

      <section class="card" aria-labelledby="links-heading">
        <div class="section-header">
          <h2 id="links-heading">Shortened Links</h2>
          <button id="refresh-btn" type="button" class="btn-secondary">Refresh</button>
        </div>

        <div class="table-wrapper">
          <table aria-describedby="links-heading">
            <thead>
              <tr>
                <th scope="col">Original URL</th>
                <th scope="col">Short Link</th>
                <th scope="col">Click Count</th>
              </tr>
            </thead>
            <tbody id="links-tbody">
              <tr>
                <td colspan="3" class="empty-state">Loading links...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <script>
    const form = document.getElementById("shorten-form");
    const urlInput = document.getElementById("url-input");
    const submitBtn = document.getElementById("submit-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const errorBanner = document.getElementById("error-banner");
    const successBanner = document.getElementById("success-banner");
    const linksTbody = document.getElementById("links-tbody");

    function showError(message) {
      errorBanner.textContent = message;
      errorBanner.hidden = false;
      successBanner.hidden = true;
    }

    function showSuccess(record) {
      errorBanner.hidden = true;
      const shortUrl = window.location.origin + "/" + record.code;
      successBanner.textContent = "";

      const span = document.createElement("span");
      span.append("Created short link: ");
      const link = document.createElement("a");
      link.href = "/" + record.code;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = shortUrl;
      link.addEventListener("click", () => setTimeout(loadLinks, 400));
      span.appendChild(link);

      successBanner.appendChild(span);
      successBanner.hidden = false;
    }

    function renderLinks(links) {
      linksTbody.textContent = "";
      if (!Array.isArray(links) || links.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.className = "empty-state";
        td.textContent = "No links shortened yet. Enter a URL above to create your first short link.";
        tr.appendChild(td);
        linksTbody.appendChild(tr);
        return;
      }

      for (const item of links) {
        const tr = document.createElement("tr");

        const tdOriginal = document.createElement("td");
        const originalAnchor = document.createElement("a");
        originalAnchor.className = "original-url";
        originalAnchor.href = item.original_url;
        originalAnchor.target = "_blank";
        originalAnchor.rel = "noopener noreferrer";
        originalAnchor.title = item.original_url;
        originalAnchor.textContent = item.original_url;
        tdOriginal.appendChild(originalAnchor);

        const tdShort = document.createElement("td");
        const shortAnchor = document.createElement("a");
        shortAnchor.className = "short-link";
        shortAnchor.href = "/" + item.code;
        shortAnchor.target = "_blank";
        shortAnchor.rel = "noopener noreferrer";
        shortAnchor.textContent = window.location.origin + "/" + item.code;
        shortAnchor.addEventListener("click", () => setTimeout(loadLinks, 400));
        tdShort.appendChild(shortAnchor);

        const tdClicks = document.createElement("td");
        const clicksBadge = document.createElement("span");
        clicksBadge.className = "clicks-badge";
        clicksBadge.textContent = String(item.clicks ?? 0);
        tdClicks.appendChild(clicksBadge);

        tr.appendChild(tdOriginal);
        tr.appendChild(tdShort);
        tr.appendChild(tdClicks);
        linksTbody.appendChild(tr);
      }
    }

    async function loadLinks() {
      try {
        const response = await fetch("/api/links", {
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) {
          throw new Error("Failed to load links.");
        }
        const data = await response.json();
        renderLinks(data);
      } catch (err) {
        linksTbody.textContent = "";
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.className = "empty-state";
        td.textContent = "Unable to load links right now.";
        tr.appendChild(td);
        linksTbody.appendChild(tr);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorBanner.hidden = true;
      successBanner.hidden = true;
      submitBtn.disabled = true;

      try {
        const response = await fetch("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.value })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          showError(payload.error || "Invalid URL. Please check your input and try again.");
          return;
        }

        urlInput.value = "";
        showSuccess(payload);
        await loadLinks();
      } catch (err) {
        showError("Network error while creating short link. Please try again.");
      } finally {
        submitBtn.disabled = false;
      }
    });

    refreshBtn.addEventListener("click", () => loadLinks());
    window.addEventListener("focus", () => loadLinks());
    loadLinks();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (pathname === "/" && method === "GET") {
      return htmlResponse(renderHomePage(), 200);
    }

    if (pathname === "/api/links") {
      if (method === "POST") {
        return handleCreateLink(request, env);
      }
      if (method === "GET") {
        return handleListLinks(env);
      }
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    // Match single-segment short code route `GET /:code`
    const codeMatch = /^\/([^/]+)$/.exec(pathname);
    if (codeMatch && method === "GET") {
      const code = decodeURIComponent(codeMatch[1]);
      return handleRedirect(code, env);
    }

    return htmlResponse(renderNotFoundPage(pathname.slice(1)), 404);
  },
} satisfies ExportedHandler<Env>;
