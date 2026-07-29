"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disconnectSalesforce } from "./actions";

type Connection = {
  instance_url: string | null;
} | null;

export default function SalesforceSettings({
  connection,
  connectedNotice,
  errorNotice,
}: {
  connection: Connection;
  connectedNotice: boolean;
  errorNotice: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    if (!confirm("Disconnect Salesforce?")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disconnectSalesforce();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {connectedNotice && <div className="notice">Salesforce connected.</div>}
      {errorNotice && <div className="error">{errorNotice}</div>}
      {error && <div className="error">{error}</div>}

      {!connection?.instance_url && (
        <a className="btn btn-primary" href="/api/auth/salesforce/start">
          Connect Salesforce
        </a>
      )}

      {connection?.instance_url && (
        <div>
          <p>
            Connected to <strong>{connection.instance_url}</strong>.
          </p>
          <p className="subtitle">
            Quote push isn&apos;t built yet — this just confirms the connection works.
          </p>
          <div className="actions">
            <button className="btn btn-danger" disabled={busy} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
