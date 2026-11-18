import { createLink, getLinkByCode, incrementLinkClicks, listLinks } from "./db";
import type { CreateLinkRequest, Env } from "./types";
import {
  generateShortCode,
  validateCustomCode,
  validateMaxClicks,
  validateUrl,
} from "./validation";

const MAX_COLLISION_RETRIES = 5;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
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

/**
 * POST /api/links
 * Validates URL (and optional custom code / max_clicks), generates a short code if none
 * was specified, stores the link in D1, and returns the created record.
 */
export async function handleCreateLink(request: Request, env: Env): Promise<Response> {
  let body: CreateLinkRequest;
  try {
    body = (await request.json()) as CreateLinkRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const urlValidation = validateUrl(body?.url, request);
  if (!urlValidation.valid) {
    return jsonResponse({ error: urlValidation.error }, 400);
  }

  const rawCustomCode = body?.customCode ?? body?.custom_code ?? body?.code;
  const codeValidation = validateCustomCode(rawCustomCode);
  if (!codeValidation.valid) {
    return jsonResponse({ error: codeValidation.error }, 400);
  }

  const rawMaxClicks = body?.maxClicks ?? body?.max_clicks;
  const maxClicksValidation = validateMaxClicks(rawMaxClicks);
  if (!maxClicksValidation.valid) {
    return jsonResponse({ error: maxClicksValidation.error }, 400);
  }

  // Handle user-supplied custom code
  if (codeValidation.code !== null) {
    const existing = await getLinkByCode(env.DB, codeValidation.code);
    if (existing) {
      return jsonResponse(
        { error: `Short code "${codeValidation.code}" is already in use.` },
        409
      );
    }

    try {
      const created = await createLink(
        env.DB,
        codeValidation.code,
        urlValidation.url,
        maxClicksValidation.maxClicks
      );
      if (created) {
        return jsonResponse(created, 201);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE")) {
        return jsonResponse(
          { error: `Short code "${codeValidation.code}" is already in use.` },
          409
        );
      }
      return jsonResponse({ error: "Failed to save shortened link." }, 500);
    }
  }

  // Auto-generate a unique 6-character alphanumeric short code
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const generatedCode = generateShortCode();
    try {
      const created = await createLink(
        env.DB,
        generatedCode,
        urlValidation.url,
        maxClicksValidation.maxClicks
      );
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

  return jsonResponse(
    { error: "Could not generate a unique short code. Please try again." },
    500
  );
}

/**
 * GET /api/links
 * Returns all shortened links ordered by created_at DESC.
 */
export async function handleListLinks(env: Env): Promise<Response> {
  const links = await listLinks(env.DB);
  return jsonResponse(links, 200);
}

/**
 * GET /:code
 * Looks up short code in D1:
 * - If found and within click limits, atomically increments `clicks = clicks + 1` and returns 302 redirect.
 * - If found but `max_clicks` has been reached, returns 410 Gone HTML page.
 * - If not found, returns 404 Not Found HTML page.
 */
export async function handleRedirect(code: string, env: Env): Promise<Response> {
  const updatedLink = await incrementLinkClicks(env.DB, code);

  if (updatedLink) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: updatedLink.original_url,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  const existingLink = await getLinkByCode(env.DB, code);
  if (
    existingLink &&
    existingLink.max_clicks !== null &&
    existingLink.clicks >= existingLink.max_clicks
  ) {
    return htmlResponse(renderGonePage(code, existingLink.max_clicks), 410);
  }

  return htmlResponse(renderNotFoundPage(code), 404);
}

function renderStatusPage(options: {
  statusBadge: string;
  badgeColor: string;
  title: string;
  messageHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.statusBadge)} — ${escapeHtml(options.title)}</title>
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
      color: ${options.badgeColor};
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
    <span class="badge">${escapeHtml(options.statusBadge)}</span>
    <h1>${escapeHtml(options.title)}</h1>
    <p>${options.messageHtml}</p>
    <a class="button" href="/">Back to URL Shortener</a>
  </main>
</body>
</html>`;
}

export function renderNotFoundPage(code: string): string {
  const safeCode = escapeHtml(code);
  return renderStatusPage({
    statusBadge: "404 Not Found",
    badgeColor: "#dc2626",
    title: "Short Link Not Found",
    messageHtml: `We couldn't find any shortened link matching <code>/${safeCode}</code>. It may have been mistyped or never existed.`,
  });
}

export function renderGonePage(code: string, maxClicks: number): string {
  const safeCode = escapeHtml(code);
  return renderStatusPage({
    statusBadge: "410 Gone",
    badgeColor: "#d97706",
    title: "Short Link Expired",
    messageHtml: `The short link <code>/${safeCode}</code> has reached its maximum limit of <strong>${maxClicks}</strong> click${maxClicks === 1 ? "" : "s"} and is no longer active.`,
  });
}
