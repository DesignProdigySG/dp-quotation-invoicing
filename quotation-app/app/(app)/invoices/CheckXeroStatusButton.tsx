"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInvoicesAgainstXero } from "./actions";

export default function CheckXeroStatusButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await checkInvoicesAgainstXero();
      if (result.error) {
        setError(result.error);
      }
      const parts: string[] = [];
      if (result.updatedToPaid) parts.push(`${result.updatedToPaid} marked Paid`);
      if (result.updatedToSent) parts.push(`${result.updatedToSent} marked Sent`);
      setSummary(`Checked ${result.checked} — ${parts.length ? parts.join(", ") : "no changes"}.`);
      if (!result.error) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn" disabled={busy} onClick={run}>
        {busy ? "Checking…" : "Check Xero status"}
      </button>
      {error && <div className="error">{error}</div>}
      {summary && <p className="subtitle">{summary}</p>}
    </div>
  );
}
