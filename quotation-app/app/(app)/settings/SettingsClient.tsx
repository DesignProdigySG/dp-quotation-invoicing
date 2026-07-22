"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveWatchedLabel, disconnectGmail } from "./actions";
import CheckNowModal from "./CheckNowModal";

type Connection = {
  email: string;
  watched_label_id: string | null;
  watched_label_name: string | null;
  last_checked_at: string | null;
} | null;

export default function SettingsClient({
  connection,
  labels,
  labelsError,
  connectedNotice,
  errorNotice,
}: {
  connection: Connection;
  labels: { id: string; name: string }[];
  labelsError: string | null;
  connectedNotice: boolean;
  errorNotice: string | null;
}) {
  const router = useRouter();
  const [selectedLabel, setSelectedLabel] = useState(labels[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCheckModal, setShowCheckModal] = useState(false);

  async function handleSaveLabel() {
    const label = labels.find((l) => l.id === selectedLabel);
    if (!label) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveWatchedLabel(label.id, label.name);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save label");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Gmail? Inbox watching will stop.")) return;
    setSaving(true);
    setError(null);
    try {
      const result = await disconnectGmail();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {connectedNotice && (
        <div className="notice">Gmail connected — choose a label below to finish setup.</div>
      )}
      {errorNotice && <div className="error">{errorNotice}</div>}
      {error && <div className="error">{error}</div>}

      {!connection && (
        <a className="btn btn-primary" href="/api/auth/gmail/start">
          Connect Gmail
        </a>
      )}

      {connection && !connection.watched_label_id && (
        <div>
          <p>
            Connected as <strong>{connection.email}</strong>. Choose a Gmail label to watch for
            quote-request emails:
          </p>
          {labelsError && <div className="error">{labelsError}</div>}
          {labels.length > 0 ? (
            <>
              <select value={selectedLabel} onChange={(e) => setSelectedLabel(e.target.value)}>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
              <div className="actions" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" disabled={saving} onClick={handleSaveLabel}>
                  {saving ? "Saving..." : "Save label"}
                </button>
              </div>
            </>
          ) : (
            !labelsError && <p className="subtitle">No labels found in your Gmail account.</p>
          )}
        </div>
      )}

      {connection && connection.watched_label_id && (
        <div>
          <p>
            Connected as <strong>{connection.email}</strong>, watching label{" "}
            <strong>{connection.watched_label_name}</strong>.
          </p>
          <p className="subtitle">
            Last checked:{" "}
            {connection.last_checked_at
              ? new Date(connection.last_checked_at).toLocaleString()
              : "never"}
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setShowCheckModal(true)}>
              Check now
            </button>
            <button className="btn btn-danger" disabled={saving} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {showCheckModal && connection && (
        <CheckNowModal
          connectionEmail={connection.email}
          onClose={() => {
            setShowCheckModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
