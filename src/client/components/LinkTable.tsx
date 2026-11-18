import React, { useState } from "react";
import type { LinkRecord } from "../../types";

export interface LinkTableProps {
  links: LinkRecord[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const LinkTable: React.FC<LinkTableProps> = ({
  links,
  isLoading,
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

      <div className="table-wrapper">
        <table aria-describedby="links-heading">
          <thead>
            <tr>
              <th scope="col">Original URL</th>
              <th scope="col">Short Link</th>
              <th scope="col">Click Count</th>
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
                  No links shortened yet. Enter a URL above to create your first
                  short link.
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
                          <span className="expired-badge">Limit Reached</span>
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
