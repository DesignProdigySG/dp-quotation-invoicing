"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePoWatchedLabel } from "./actions";
import CheckPoNowModal from "./CheckPoNowModal";

type Connection = {
  email: string;
  po_watched_label_id: string | null;
  po_watched_label_name: string | null;
  po_last_checked_at: string | null;
};

export default function PoSettingsClient({
  connection,
  labels,
  labelsError,
}: {
  connection: Connection;
  labels: { id: string; name: string }[];
  labelsError: string | null;
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
      const result = await savePoWatchedLabel(label.id, label.name);
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

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
      <h3>Purchase order matching</h3>
      <p className="subtitle">
        Watch a separate label for client PO emails, matched against your existing invoices.
      </p>
      {error && <div className="error">{error}</div>}

      {!connection.po_watched_label_id && (
        <div>
          <p>Choose a Gmail label to watch for purchase-order emails:</p>
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

      {connection.po_watched_label_id && (
        <div>
          <p>
            Watching label <strong>{connection.po_watched_label_name}</strong>.
          </p>
          <p className="subtitle">
            Last checked:{" "}
            {connection.po_last_checked_at
              ? new Date(connection.po_last_checked_at).toLocaleString()
              : "never"}
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setShowCheckModal(true)}>
              Check now
            </button>
          </div>
        </div>
      )}

      {showCheckModal && (
        <CheckPoNowModal
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
