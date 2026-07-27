"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback } from "./actions";

const MAX_IMAGES = 6;

type PreviewImage = {
  file: File;
  url: string;
};

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setMessage("");
    setImages([]);
    setError(null);
    setDone(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const newFiles = Array.from(fileList);
    setImages((prev) => {
      const combined = [...prev, ...newFiles.map((file) => ({ file, url: URL.createObjectURL(file) }))];
      if (combined.length > MAX_IMAGES) {
        combined.slice(MAX_IMAGES).forEach((img) => URL.revokeObjectURL(img.url));
        return combined.slice(0, MAX_IMAGES);
      }
      return combined;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!message.trim()) {
      setError("Please enter a message");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("message", message);
      formData.set("page_path", pathname || "");
      images.forEach((img) => formData.append("images", img.file));

      const result = await submitFeedback(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary feedback-trigger" onClick={() => setOpen(true)}>
        Feedback
      </button>

      {open && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div className="page-header">
              <h2>Send feedback</h2>
            </div>

            {done ? (
              <>
                <div className="notice">Thanks — your feedback has been sent.</div>
                <div className="actions" style={{ marginTop: 18 }}>
                  <button className="btn btn-primary" type="button" onClick={close}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                {error && <div className="error">{error}</div>}

                <label>What's up?</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe an issue or idea..."
                />

                <label>Screenshots (optional, up to {MAX_IMAGES})</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  disabled={images.length >= MAX_IMAGES}
                />

                {images.length > 0 && (
                  <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
                    {images.map((img, i) => (
                      <div key={img.url} style={{ position: "relative" }}>
                        <img
                          src={img.url}
                          alt=""
                          style={{
                            width: 72,
                            height: 72,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          style={{ position: "absolute", top: -8, right: -8, padding: "0 6px" }}
                          onClick={() => removeImage(i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="actions" style={{ marginTop: 18 }}>
                  <button className="btn" type="button" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleSubmit}
                    disabled={busy}
                  >
                    {busy ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
