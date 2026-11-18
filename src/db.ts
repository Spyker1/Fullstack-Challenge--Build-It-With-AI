import type { LinkRecord, LinkSortOption, ListLinksFilter } from "./types";

const ORDER_BY_ALLOWLIST: Record<LinkSortOption, string> = {
  created_desc: "created_at DESC, id DESC",
  created_asc: "created_at ASC, id ASC",
  clicks_desc: "clicks DESC, created_at DESC, id DESC",
  clicks_asc: "clicks ASC, created_at DESC, id DESC",
};

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
 * Lists shortened links with optional status filtering, search query, and allowlisted ORDER BY sorting.
 */
export async function listLinks(
  db: D1Database,
  filter: ListLinksFilter = {}
): Promise<LinkRecord[]> {
  const whereClauses: string[] = [];
  const bindParams: unknown[] = [];

  if (filter.status === "active") {
    whereClauses.push("(max_clicks IS NULL OR clicks < max_clicks)");
  } else if (filter.status === "expired") {
    whereClauses.push("(max_clicks IS NOT NULL AND clicks >= max_clicks)");
  }

  const trimmedSearch = filter.search?.trim();
  if (trimmedSearch) {
    whereClauses.push("(code LIKE ? OR original_url LIKE ?)");
    const likePattern = `%${trimmedSearch}%`;
    bindParams.push(likePattern, likePattern);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sortKey: LinkSortOption =
    filter.sort && filter.sort in ORDER_BY_ALLOWLIST
      ? filter.sort
      : "created_desc";
  const orderBySql = ORDER_BY_ALLOWLIST[sortKey];

  const query = `
    SELECT id, code, original_url, clicks, max_clicks, created_at
    FROM links
    ${whereSql}
    ORDER BY ${orderBySql}
  `;

  const statement = db.prepare(query);
  const boundStatement =
    bindParams.length > 0 ? statement.bind(...bindParams) : statement;
  const { results } = await boundStatement.all<LinkRecord>();

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
