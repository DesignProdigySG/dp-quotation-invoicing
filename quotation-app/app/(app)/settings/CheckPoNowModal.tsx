"use client";

import { useEffect, useState } from "react";
import {
  listUnprocessedPoCandidates,
  processSelectedPoMessages,
  type ProcessSelectedPoResult,
} from "./actions";

type Candidate = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  internalDate: string;
};

const PAGE_SIZE = 5;

export default function CheckPoNowModal({
  connectionEmail,
  onClose,
}: {
  connectionEmail: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ProcessSelectedPoResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUnprocessedPoCandidates().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      setCandidates(res.candidates);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSendToReview() {
    setSending(true);
    setError(null);
    try {
      const res = await processSelectedPoMessages([...selected]);
      if (res.errors.length > 0) setError(res.errors.join("; "));
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  const visible = candidates.slice(0, visibleCount);

  return (
    <div className="modal-overlay">
      <div className="modal-content card">
        <div className="page-header">
          <h2>Check now — {connectionEmail}</h2>
        </div>

        {error && <div className="error">{error}</div>}

        {result ? (
          <>
            <div className="notice">
              Checked {result.processed} email(s): {result.suggested} with a suggested
              invoice, {result.unmatched} unmatched
              {result.failed ? `, ${result.failed} failed` : ""} — all sent to Needs
              Review.
            </div>
            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={onClose} type="button">
                Done
              </button>
            </div>
          </>
        ) : loading ? (
          <p className="subtitle">Loading pending emails…</p>
        ) : candidates.length === 0 ? (
          <p className="empty">No unprocessed emails under the watched label.</p>
        ) : (
          <>
            <p className="subtitle">
              Select the emails to send to Needs Review. {candidates.length} pending.
            </p>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Preview</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                    </td>
                    <td>{c.subject || "(no subject)"}</td>
                    <td>{c.from}</td>
                    <td className="subtitle">{c.snippet}</td>
                    <td>
                      <a
                        href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(
                          connectionEmail
                        )}#all/${c.threadId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Gmail
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibleCount < candidates.length && (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                style={{ marginTop: 8 }}
              >
                + Load 5 more
              </button>
            )}

            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn" type="button" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleSendToReview}
                disabled={sending || selected.size === 0}
              >
                {sending ? "Sending…" : `Send to review (${selected.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
