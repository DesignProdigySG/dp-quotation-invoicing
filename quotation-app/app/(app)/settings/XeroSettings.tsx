"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  listXeroTaxRates,
  listXeroAccounts,
  saveXeroConfig,
  disconnectXero,
} from "./actions";

type Connection = {
  tenant_name: string | null;
  gst_tax_type: string | null;
  gst_tax_rate: number | null;
  no_gst_tax_type: string | null;
  default_account_code: string | null;
} | null;

type TaxRateOption = { taxType: string; name: string; ratePercent: number };
type AccountOption = { code: string; name: string };

export default function XeroSettings({
  connection,
  connectedNotice,
  errorNotice,
}: {
  connection: Connection;
  connectedNotice: boolean;
  errorNotice: string | null;
}) {
  const router = useRouter();
  const isConfigured =
    !!connection?.gst_tax_type &&
    !!connection?.no_gst_tax_type &&
    !!connection?.default_account_code;

  const [reconfiguring, setReconfiguring] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [gstTaxType, setGstTaxType] = useState(connection?.gst_tax_type || "");
  const [noGstTaxType, setNoGstTaxType] = useState(connection?.no_gst_tax_type || "");
  const [accountCode, setAccountCode] = useState(connection?.default_account_code || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOptions() {
    setLoadingOptions(true);
    setError(null);
    try {
      const [taxResult, accountResult] = await Promise.all([
        listXeroTaxRates(),
        listXeroAccounts(),
      ]);
      if (taxResult.error) {
        setError(taxResult.error);
      } else if (accountResult.error) {
        setError(accountResult.error);
      } else {
        setTaxRates(taxResult.taxRates);
        setAccounts(accountResult.accounts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Xero configuration options");
    } finally {
      setLoadingOptions(false);
    }
  }

  async function startConfiguring() {
    setReconfiguring(true);
    await loadOptions();
  }

  async function handleSave() {
    const selectedRate = taxRates.find((t) => t.taxType === gstTaxType);
    if (!selectedRate) {
      setError("Choose a GST tax rate");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveXeroConfig({
        gst_tax_type: gstTaxType,
        gst_tax_rate: selectedRate.ratePercent,
        no_gst_tax_type: noGstTaxType,
        default_account_code: accountCode,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setReconfiguring(false);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Xero? Invoice push will stop working until reconnected.")) return;
    setSaving(true);
    setError(null);
    try {
      const result = await disconnectXero();
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
        <div className="notice">Xero connected — set up the tax/account mapping below.</div>
      )}
      {errorNotice && <div className="error">{errorNotice}</div>}
      {error && <div className="error">{error}</div>}

      {!connection?.tenant_name && (
        <a className="btn btn-primary" href="/api/auth/xero/start">
          Connect Xero
        </a>
      )}

      {connection?.tenant_name && !reconfiguring && isConfigured && (
        <div>
          <p>
            Connected to <strong>{connection.tenant_name}</strong>.
          </p>
          <p className="subtitle">
            GST tax type: {connection.gst_tax_type} ({connection.gst_tax_rate}%) · No-GST tax
            type: {connection.no_gst_tax_type} · Account code: {connection.default_account_code}
          </p>
          <div className="actions">
            <button className="btn" disabled={saving} onClick={startConfiguring}>
              Reconfigure
            </button>
            <button className="btn btn-danger" disabled={saving} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {connection?.tenant_name && (!isConfigured || reconfiguring) && (
        <div>
          <p>
            Connected to <strong>{connection.tenant_name}</strong>. Choose how invoices map onto
            Xero:
          </p>
          {loadingOptions && <p className="subtitle">Loading tax rates and accounts…</p>}
          {!loadingOptions && taxRates.length === 0 && accounts.length === 0 && (
            <button className="btn" onClick={loadOptions}>
              Load options
            </button>
          )}
          {!loadingOptions && (taxRates.length > 0 || accounts.length > 0) && (
            <>
              <label htmlFor="gst_tax_type">GST applicable tax rate</label>
              <select
                id="gst_tax_type"
                value={gstTaxType}
                onChange={(e) => setGstTaxType(e.target.value)}
              >
                <option value="">Select…</option>
                {taxRates.map((t) => (
                  <option key={t.taxType} value={t.taxType}>
                    {t.name} ({t.ratePercent}%)
                  </option>
                ))}
              </select>

              <label htmlFor="no_gst_tax_type">No-GST tax rate</label>
              <select
                id="no_gst_tax_type"
                value={noGstTaxType}
                onChange={(e) => setNoGstTaxType(e.target.value)}
              >
                <option value="">Select…</option>
                {taxRates.map((t) => (
                  <option key={t.taxType} value={t.taxType}>
                    {t.name} ({t.ratePercent}%)
                  </option>
                ))}
              </select>

              <label htmlFor="account_code">Default account code</label>
              <select
                id="account_code"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
              >
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>

              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  disabled={saving || !gstTaxType || !noGstTaxType || !accountCode}
                  onClick={handleSave}
                >
                  {saving ? "Saving..." : "Save configuration"}
                </button>
                {isConfigured && (
                  <button className="btn" disabled={saving} onClick={() => setReconfiguring(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
