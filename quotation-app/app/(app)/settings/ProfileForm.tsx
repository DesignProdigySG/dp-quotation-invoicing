"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile, uploadSignature, removeSignature } from "./actions";

export default function ProfileForm({
  initial,
  signatureUrl,
}: {
  initial: { full_name: string | null; title: string | null } | null;
  signatureUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    full_name: initial?.full_name || "",
    title: initial?.title || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveProfile(form);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignatureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSignature(true);
    setSignatureError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadSignature(formData);
      if (result.error) {
        setSignatureError(result.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setSignatureError(err instanceof Error ? err.message : "Could not upload signature");
    } finally {
      setUploadingSignature(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveSignature() {
    if (!confirm("Remove your signature image?")) return;
    setUploadingSignature(true);
    setSignatureError(null);
    try {
      const result = await removeSignature();
      if (result.error) {
        setSignatureError(result.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setSignatureError(err instanceof Error ? err.message : "Could not remove signature");
    } finally {
      setUploadingSignature(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {saved && <div className="notice">Profile saved.</div>}

      <div className="row">
        <div>
          <label htmlFor="full_name">Full name</label>
          <input
            id="full_name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            placeholder="e.g. Account Manager"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
      </div>
      <p className="subtitle">
        Shown as a &quot;Prepared by&quot; line on quotation and invoice PDFs.
      </p>

      <div className="actions">
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>

      <label style={{ marginTop: 20 }}>Signature</label>
      {signatureError && <div className="error">{signatureError}</div>}
      {signatureUrl && (
        <img
          src={signatureUrl}
          alt="Your signature"
          style={{ maxWidth: 220, maxHeight: 90, display: "block", marginBottom: 10 }}
        />
      )}
      <div className="actions">
        <button
          className="btn"
          disabled={uploadingSignature}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingSignature
            ? "Uploading..."
            : signatureUrl
              ? "Replace signature"
              : "Upload signature"}
        </button>
        {signatureUrl && (
          <button
            className="btn btn-danger"
            disabled={uploadingSignature}
            onClick={handleRemoveSignature}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleSignatureChange}
        style={{ display: "none" }}
      />
      <p className="subtitle" style={{ marginTop: 6 }}>
        PNG or JPG, under 2MB. Embedded above your name on quotation and invoice PDFs.
      </p>
    </div>
  );
}
