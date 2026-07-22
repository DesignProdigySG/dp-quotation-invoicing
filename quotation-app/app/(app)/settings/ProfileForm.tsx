"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "./actions";

export default function ProfileForm({
  initial,
}: {
  initial: { full_name: string | null; title: string | null } | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: initial?.full_name || "",
    title: initial?.title || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    </div>
  );
}
