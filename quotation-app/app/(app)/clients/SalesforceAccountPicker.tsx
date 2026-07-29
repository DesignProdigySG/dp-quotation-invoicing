"use client";

import { useEffect, useState } from "react";
import { searchSalesforceAccounts, getSalesforceAccountName } from "./actions";

export default function SalesforceAccountPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const [nameLookupError, setNameLookupError] = useState(false);
  const [searching, setSearching] = useState(!value);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setMatchedName(null);
      setNameLookupError(false);
      return;
    }
    getSalesforceAccountName(value).then((result) => {
      if (cancelled) return;
      if (result.name) {
        setMatchedName(result.name);
        setNameLookupError(false);
      } else {
        setNameLookupError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!searching) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    const timeout = setTimeout(async () => {
      const result = await searchSalesforceAccounts(query);
      setLoading(false);
      if (result.error) {
        setError(result.error);
      } else {
        setResults(result.accounts);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, searching]);

  function selectAccount(account: { id: string; name: string }) {
    onChange(account.id);
    setMatchedName(account.name);
    setNameLookupError(false);
    setSearching(false);
    setQuery("");
    setResults([]);
  }

  function clearMatch() {
    onChange(null);
    setMatchedName(null);
    setNameLookupError(false);
    setSearching(true);
  }

  return (
    <div>
      <label>Salesforce Account</label>
      {value && !searching ? (
        <div>
          <p className="subtitle">
            Matched to Salesforce: {nameLookupError ? `ID ${value}` : matchedName || "loading..."}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSearching(true)}
            >
              Change match
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={clearMatch}>
              Clear match
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            value={query}
            placeholder="Search Salesforce Accounts by name..."
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <p className="subtitle">Searching...</p>}
          {error && <div className="error">{error}</div>}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <p className="subtitle">No matching Accounts found.</p>
          )}
          {results.length > 0 && (
            <ul>
              {results.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => selectAccount(account)}
                  >
                    {account.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {value && (
            <button type="button" className="btn btn-sm" onClick={() => setSearching(false)}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
