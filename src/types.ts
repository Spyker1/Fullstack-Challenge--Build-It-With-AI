export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
}

export interface LinkRecord {
  id: number;
  code: string;
  original_url: string;
  clicks: number;
  max_clicks: number | null;
  created_at: string;
}

export type LinkSortOption =
  | "created_desc"
  | "created_asc"
  | "clicks_desc"
  | "clicks_asc";

export type LinkStatusFilter = "all" | "active" | "expired";

export interface ListLinksFilter {
  sort?: LinkSortOption;
  status?: LinkStatusFilter;
  search?: string;
}

export interface CreateLinkRequest {
  url?: unknown;
  customCode?: unknown;
  custom_code?: unknown;
  code?: unknown;
  maxClicks?: unknown;
  max_clicks?: unknown;
}

export type UrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; error: string };

export type CodeValidationResult =
  | { valid: true; code: string | null }
  | { valid: false; error: string };

export type MaxClicksValidationResult =
  | { valid: true; maxClicks: number | null }
  | { valid: false; error: string };
