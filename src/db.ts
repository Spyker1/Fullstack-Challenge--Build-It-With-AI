import type { LinkRecord } from "./types";

/**
 * Inserts a new shortened link into D1 and returns the created record.
 */
export async function createLink(
  db: D1Database,
  code: string,
  originalUrl: string,
  maxClicks: number | null = null
): Promise<LinkRecord | null> {
  return db
    .prepare(
      `INSERT INTO links (code, original_url, max_clicks)
       VALUES (?, ?, ?)
       RETURNING id, code, original_url, clicks, max_clicks, created_at`
    )
    .bind(code, originalUrl, maxClicks)
    .first<LinkRecord>();
}

/**
 * Lists all shortened links ordered by created_at DESC.
 */
export async function listLinks(db: D1Database): Promise<LinkRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, code, original_url, clicks, max_clicks, created_at
       FROM links
       ORDER BY created_at DESC, id DESC`
    )
    .all<LinkRecord>();

  return results ?? [];
}

/**
 * Fetches a single link record by its short code without modifying clicks.
 */
export async function getLinkByCode(
  db: D1Database,
  code: string
): Promise<LinkRecord | null> {
  return db
    .prepare(
      `SELECT id, code, original_url, clicks, max_clicks, created_at
       FROM links
       WHERE code = ?`
    )
    .bind(code)
    .first<LinkRecord>();
}

/**
 * Atomically increments `clicks = clicks + 1` for a given short code,
 * only if `max_clicks` is NULL or `clicks < max_clicks`.
 * Returns the updated record, or null if not found / limit reached.
 */
export async function incrementLinkClicks(
  db: D1Database,
  code: string
): Promise<LinkRecord | null> {
  return db
    .prepare(
      `UPDATE links
       SET clicks = clicks + 1
       WHERE code = ?
         AND (max_clicks IS NULL OR clicks < max_clicks)
       RETURNING id, code, original_url, clicks, max_clicks, created_at`
    )
    .bind(code)
    .first<LinkRecord>();
}
