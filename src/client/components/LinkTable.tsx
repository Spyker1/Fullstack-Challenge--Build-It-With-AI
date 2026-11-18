import React, { useState } from "react";
import type {
  LinkRecord,
  LinkSortOption,
  LinkStatusFilter,
} from "../../types";

export interface LinkTableProps {
  links: LinkRecord[];
  isLoading: boolean;
  sort: LinkSortOption;
  status: LinkStatusFilter;
  search: string;
  onSortChange: (sort: LinkSortOption) => void;
  onStatusChange: (status: LinkStatusFilter) => void;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
}

const STATUS_OPTIONS: { value: LinkStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
];

export const LinkTable: React.FC<LinkTableProps> = ({
  links,
  isLoading,
  sort,
  status,
  search,
  onSortChange,
  onStatusChange,
  onSearchChange,
  onRefresh,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyShortLink = async (code: string) => {
    const fullUrl = `${window.location.origin}/${code}`;
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((prev) => (prev === code ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleToggleClicksSort = () => {
    if (sort === "clicks_desc") {
      onSortChange("clicks_asc");
    } else {
      onSortChange("clicks_desc");
    }
  };

  const clicksAriaSort: "ascending" | "descending" | "none" =
    sort === "clicks_asc"
      ? "ascending"
      : sort === "clicks_desc"
      ? "descending"
      : "none";

  const clicksSortIndicator =
    sort === "clicks_desc" ? "↓" : sort === "clicks_asc" ? "↑" : "↕";

  const hasActiveFilters =
    search.trim().length > 0 || status !== "all" || sort !== "created_desc";

  const handleResetFilters = () => {
    onSearchChange("");
    onStatusChange("all");
    onSortChange("created_desc");
  };

  return (
    <section className="card" aria-labelledby="links-heading">
      <div className="section-header">
        <h2 id="links-heading">Shortened Links</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="filter-bar" role="region" aria-label="Filter and sort links">
        <div className="search-box">
          <input
            id="search-links-input"
            type="search"
            placeholder="Search by code or URL..."
            aria-label="Search by code or URL"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onSearchChange(e.target.value)
            }
          />
        </div>

        <div className="filter-controls">
          <div
            className="status-pills"
            role="group"
            aria-label="Filter by link status"
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`status-pill ${
                  status === opt.value ? "status-pill-active" : ""
                }`}
                aria-pressed={status === opt.value}
                onClick={() => onStatusChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="sort-control">
            <label htmlFor="sort-links-select" className="sort-label">
              Sort:
            </label>
            <select
              id="sort-links-select"
              value={sort}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onSortChange(e.target.value as LinkSortOption)
              }
            >
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
              <option value="clicks_desc">Most clicks</option>
              <option value="clicks_asc">Least clicks</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table aria-describedby="links-heading">
          <thead>
            <tr>
              <th scope="col">Original URL</th>
              <th scope="col">Short Link</th>
              <th scope="col" aria-sort={clicksAriaSort}>
                <button
                  type="button"
                  className={`th-sort-btn ${
                    clicksAriaSort !== "none" ? "th-sort-active" : ""
                  }`}
                  onClick={handleToggleClicksSort}
                  title="Toggle sort between most and least clicks"
                >
                  <span>Clicks</span>
                  <span className="sort-arrow" aria-hidden="true">
                    {clicksSortIndicator}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && links.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  Loading links...
                </td>
              </tr>
            ) : links.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  {hasActiveFilters ? (
                    <div className="empty-filter-state">
                      <span>No links match your current search or filters.</span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleResetFilters}
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    "No links shortened yet. Enter a URL above to create your first short link."
                  )}
                </td>
              </tr>
            ) : (
              links.map((item) => {
                const shortUrl = `${window.location.origin}/${item.code}`;
                const isExpired =
                  item.max_clicks !== null &&
                  item.max_clicks !== undefined &&
                  item.clicks >= item.max_clicks;

                return (
                  <tr key={item.id ?? item.code}>
                    <td>
                      <a
                        className="original-url"
                        href={item.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={item.original_url}
                      >
                        {item.original_url}
                      </a>
                    </td>
                    <td>
                      <div className="short-link-cell">
                        <a
                          className="short-link"
                          href={`/${item.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => window.setTimeout(onRefresh, 400)}
                        >
                          {shortUrl}
                        </a>
                        <button
                          type="button"
                          className="btn-copy"
                          onClick={() => handleCopyShortLink(item.code)}
                          aria-label={`Copy short link for ${item.code}`}
                        >
                          {copiedCode === item.code ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="clicks-cell">
                        <span className="clicks-badge">
                          {item.max_clicks !== null && item.max_clicks !== undefined
                            ? `${item.clicks} / ${item.max_clicks}`
                            : item.clicks}
                        </span>
                        {isExpired && (
                          <span className="expired-badge">Expired</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
