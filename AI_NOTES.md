# AI Collaboration & Engineering Notes (`AI_NOTES.md`)

## 1. AI Tools Used & Workflow

- **Antigravity IDE Agent**: Used inside the workspace for rapid D1 schema setup, Cloudflare Worker endpoint scaffolding, modular TypeScript refactoring, and React component generation.
- **Gemini 4 Argon**: Used as an architectural sounding board to plan milestone commits, evaluate Cloudflare D1 vs. KV tradeoffs, design the custom feature set (`customCode`, `max_clicks` expiration, and server-backed filtering/sorting), and structure edge-case test scenarios without generating application code directly.

My workflow followed an iterative **"vertical slice first, then modularize and expand"** approach:
1. Establish local Cloudflare Worker + D1 SQLite persistence and verify migrations.
2. Build and test the core requirements (`POST /api/links`, `GET /api/links`, `GET /:code` with atomic click increment, and strict URL validation).
3. Refactor the initial prototype into clean domain modules and a React + TypeScript frontend.
4. Layer on high-value user features (custom codes, `max_clicks` expiration with `410 Gone`, search/status filtering, and click-count sorting).

---

## 2. Context & Most Important Prompts Provided

- **Upfront Architectural Constraint Prompt**:
  > *"We are building a URL shortener running locally on Cloudflare Workers (TypeScript) using Cloudflare D1 (SQLite) for persistence. Strict constraint: Do NOT include any LLM or AI API calls in the application code... Create a helper that validates URLs using `new URL()`, strictly only allowing `http:` and `https:` protocols, and rejecting URLs that point to the shortener's own host to prevent redirect loops."*
  - **Why this mattered**: Giving explicit persistence and security constraints upfront prevented over-engineered external dependencies and ensured atomic SQLite operations instead of eventually consistent KV counters.

- **Modular Refactoring & React Migration Prompt**:
  > *"Stop any background test runner process. Right now everything is crammed into a single 768-line `src/index.ts` file and the IDE shows 42 TypeScript problems. Let's refactor this into a clean, modular architecture (`src/types.ts`, `src/db.ts`, `src/validation.ts`, `src/routes.ts`, `src/index.ts`) with a proper React frontend (`LinkForm.tsx`, `LinkTable.tsx`, `ErrorAlert.tsx`) served via Cloudflare Workers static `[assets]` in `wrangler.toml`... Do NOT run `wrangler dev` as a blocking command in the terminal."*
  - **Why this mattered**: Steered the codebase from a single-file script into a maintainable production structure while fixing IDE TypeScript diagnostics and preventing terminal hangs.

- **Analytics Filtering & Safe SQL Sorting Prompt**:
  > *"Enhance our custom feature set by adding Link Filtering, Search, and Sorting (by most/least clicks, newest/oldest, and status) across the D1 backend and React UI... Use safe allowlisted SQL `ORDER BY` clauses in `src/db.ts` (never raw string interpolation to prevent SQL injection)."*
  - **Why this mattered**: Explicitly specifying allowlisted `ORDER BY` mapping ensured the AI did not interpolate query parameters directly into SQL strings.

---

## 3. What I Reviewed, Caught, and Corrected (AI Mistakes & My Judgment)

### 1. Blocking Dev Server Hang
- **What happened**: After implementing the initial endpoints, the AI agent spawned `wrangler dev` inside a background command task to run end-to-end tests. Because `wrangler dev` runs indefinitely as a watch server and spawns child processes on Windows, the command task stayed open waiting for process termination.
- **How I corrected it**: I diagnosed the hung background task, canceled the runner process, and explicitly constrained subsequent prompts to never run `wrangler dev` as a blocking agent command—using `tsc --noEmit` and `npm run build` for automated agent checks while running `npx wrangler dev` directly in my own terminal.

### 2. Monolithic Code & TypeScript Configuration Drift
- **What happened**: In the first implementation pass, the agent placed all 768 lines of code—D1 SQL queries, URL validation, route dispatching, and inline HTML/CSS/JS templates—into a single `src/index.ts` file. At the same time, the IDE Problems tab surfaced 42 TypeScript diagnostics due to environment type resolution issues.
- **How I corrected it**: I directed a full structural refactor into single-responsibility backend modules (`types.ts`, `db.ts`, `validation.ts`, `routes.ts`, `index.ts`) and a modular React frontend in `src/client/`, and updated `tsconfig.json` to properly configure `@cloudflare/workers-types` alongside `@types/react` and `@types/react-dom` with 0 TypeScript errors.

### 3. Browser Native Validation Masking Server Validation
- **What happened**: Standard HTML `<input type="url" required>` blocks form submission in the browser using native tooltips whenever a user enters a malformed URL or non-HTTP scheme, which prevents the request from reaching `POST /api/links` and hides server-side validation errors during UI testing.
- **How I corrected it**: Ensured the form uses `noValidate` so all submissions go through the server's `validateUrl` pipeline and render server-returned `400 Bad Request` / `409 Conflict` errors consistently in the React `ErrorAlert` component.

---

## 4. How I Validated the AI Output

- **Code & SQL Security Review**: Inspected every query in `src/db.ts` to verify that user inputs (`code`, `original_url`, `max_clicks`, `search`) are bound via parameterized `.bind(...)` calls and that dynamic `ORDER BY` clauses are selected strictly from the `ORDER_BY_ALLOWLIST` constant map.
- **Atomic Concurrency Check**: Verified that click tracking uses a single atomic `UPDATE links SET clicks = clicks + 1 WHERE code = ? AND (max_clicks IS NULL OR clicks < max_clicks) RETURNING *` query rather than a separate `SELECT` followed by `UPDATE`, preventing race conditions when `max_clicks` is enforced.
- **Static & Runtime Verification**:
  - Ran `npm run typecheck` (`tsc --noEmit`) and `npm run build` to confirm zero TypeScript or bundler errors.
  - Tested persistence across `npx wrangler dev` restarts and verified HTTP `201`, `302`, `400`, `404`, `409`, and `410` responses via both the React UI and raw `curl` requests.
