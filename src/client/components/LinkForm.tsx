import React, { useState } from "react";
import type { LinkRecord } from "../../types";
import { ErrorAlert } from "./ErrorAlert";

export interface LinkFormProps {
  onLinkCreated: (newLink: LinkRecord) => void;
  onLinkVisited: () => void;
}

export const LinkForm: React.FC<LinkFormProps> = ({
  onLinkCreated,
  onLinkVisited,
}) => {
  const [url, setUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [maxClicks, setMaxClicks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<LinkRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setCreatedLink(null);
    setCopied(false);
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = { url };
      if (customCode.trim().length > 0) {
        payload.customCode = customCode.trim();
      }
      if (maxClicks.trim().length > 0) {
        payload.maxClicks = Number(maxClicks.trim());
      }

      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as Partial<LinkRecord> & {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "Invalid URL. Please check your input and try again.");
        return;
      }

      const created = data as LinkRecord;
      setUrl("");
      setCustomCode("");
      setMaxClicks("");
      setCreatedLink(created);
      onLinkCreated(created);
    } catch {
      setError("Network error while creating short link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortUrl = createdLink
    ? `${window.location.origin}/${createdLink.code}`
    : "";

  const handleCopy = async () => {
    if (!shortUrl || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write may fail in non-secure contexts
    }
  };

  return (
    <section className="card" aria-labelledby="shorten-heading">
      <form onSubmit={handleSubmit} noValidate>
        <div className="field-group">
          <label id="shorten-heading" htmlFor="url-input">
            Long URL to shorten
          </label>
          <div className="input-row">
            <input
              id="url-input"
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/some/very/long/path"
              autoComplete="off"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              disabled={isSubmitting}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Shortening..." : "Shorten URL"}
            </button>
          </div>
        </div>

        <div className="optional-row">
          <div className="optional-field">
            <label htmlFor="custom-code-input">
              Custom Code <span className="optional-tag">(optional)</span>
            </label>
            <input
              id="custom-code-input"
              name="customCode"
              type="text"
              placeholder="e.g. my-link"
              autoComplete="off"
              value={customCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCustomCode(e.target.value)
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="optional-field">
            <label htmlFor="max-clicks-input">
              Max Clicks <span className="optional-tag">(optional)</span>
            </label>
            <input
              id="max-clicks-input"
              name="maxClicks"
              type="number"
              min={1}
              step={1}
              placeholder="Unlimited"
              value={maxClicks}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setMaxClicks(e.target.value)
              }
              disabled={isSubmitting}
            />
          </div>
        </div>
      </form>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {createdLink && (
        <div className="alert alert-success" role="status" aria-live="polite">
          <span>
            Created short link:{" "}
            <a
              href={`/${createdLink.code}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => window.setTimeout(onLinkVisited, 400)}
            >
              {shortUrl}
            </a>
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </section>
  );
};
