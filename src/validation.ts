import type {
  CodeValidationResult,
  MaxClicksValidationResult,
  UrlValidationResult,
} from "./types";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const SHORT_CODE_LENGTH = 6;
const CUSTOM_CODE_REGEX = /^[A-Za-z0-9_-]{3,32}$/;

const RESERVED_CODES = new Set([
  "api",
  "assets",
  "public",
  "favicon.ico",
  "index.html",
  "app.js",
  "styles.css",
]);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function getEffectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

/**
 * Server-side URL validation:
 * 1. Parses using `new URL()`
 * 2. Strictly allows only `http:` and `https:` protocols
 * 3. Rejects URLs pointing to the shortener's own host to prevent redirect loops
 */
export function validateUrl(rawUrl: unknown, request: Request): UrlValidationResult {
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
      error: "Invalid URL format. Please enter a valid URL starting with http:// or https://.",
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
 * Validates an optional user-supplied custom short code.
 */
export function validateCustomCode(rawCode: unknown): CodeValidationResult {
  if (rawCode === undefined || rawCode === null) {
    return { valid: true, code: null };
  }

  if (typeof rawCode !== "string") {
    return { valid: false, error: "Custom code must be a string." };
  }

  const trimmed = rawCode.trim();
  if (trimmed.length === 0) {
    return { valid: true, code: null };
  }

  if (RESERVED_CODES.has(trimmed.toLowerCase())) {
    return {
      valid: false,
      error: `"${trimmed}" is a reserved path and cannot be used as a short code.`,
    };
  }

  if (!CUSTOM_CODE_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        "Custom code must be 3–32 characters and contain only letters, numbers, hyphens (-), or underscores (_).",
    };
  }

  return { valid: true, code: trimmed };
}

/**
 * Validates an optional `max_clicks` limit.
 */
export function validateMaxClicks(rawMaxClicks: unknown): MaxClicksValidationResult {
  if (rawMaxClicks === undefined || rawMaxClicks === null || rawMaxClicks === "") {
    return { valid: true, maxClicks: null };
  }

  const parsed =
    typeof rawMaxClicks === "number"
      ? rawMaxClicks
      : typeof rawMaxClicks === "string"
      ? Number(rawMaxClicks.trim())
      : NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000_000) {
    return {
      valid: false,
      error: "max_clicks must be a positive integer (1 or greater).",
    };
  }

  return { valid: true, maxClicks: parsed };
}

/**
 * Generates a cryptographically random 6-character alphanumeric short code.
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
