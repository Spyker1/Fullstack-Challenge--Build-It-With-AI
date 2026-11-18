import React, { useCallback, useEffect, useState } from "react";
import type {
  LinkRecord,
  LinkSortOption,
  LinkStatusFilter,
} from "../types";
import { ErrorAlert } from "./components/ErrorAlert";
import { LinkForm } from "./components/LinkForm";
import { LinkTable } from "./components/LinkTable";

export const App: React.FC = () => {
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<LinkSortOption>("created_desc");
  const [status, setStatus] = useState<LinkStatusFilter>("all");
  const [search, setSearch] = useState<string>("");

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("status", status);
      if (search.trim().length > 0) {
        params.set("search", search.trim());
      }

      const response = await fetch(`/api/links?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("Failed to load links from server.");
      }
      const data = (await response.json()) as LinkRecord[];
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("Unable to load shortened links right now.");
    } finally {
      setIsLoading(false);
    }
  }, [sort, status, search]);

  useEffect(() => {
    void fetchLinks();
    const handleFocus = () => {
      void fetchLinks();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchLinks]);

  const handleLinkCreated = (_newLink: LinkRecord) => {
    void fetchLinks();
  };

  return (
    <div className="container">
      <header>
        <h1>URL Shortener</h1>
        <p>Fast local link shortener powered by Cloudflare Workers &amp; D1.</p>
      </header>

      <main>
        <LinkForm
          onLinkCreated={handleLinkCreated}
          onLinkVisited={() => void fetchLinks()}
        />

        <ErrorAlert
          message={loadError}
          onDismiss={() => setLoadError(null)}
        />

        <LinkTable
          links={links}
          isLoading={isLoading}
          sort={sort}
          status={status}
          search={search}
          onSortChange={setSort}
          onStatusChange={setStatus}
          onSearchChange={setSearch}
          onRefresh={() => void fetchLinks()}
        />
      </main>
    </div>
  );
};
