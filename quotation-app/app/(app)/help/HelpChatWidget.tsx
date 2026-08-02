"use client";

import { useState } from "react";
import { askHelp } from "./actions";
import type { HelpChatMessage } from "@/lib/help-chat/askHelpChat";

export default function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<HelpChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question) return;
    setError(null);
    setBusy(true);
    const nextMessages: HelpChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    try {
      const result = await askHelp(nextMessages);
      if (result.error) {
        setError(result.error);
      } else if (result.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.reply! }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <button className="btn btn-primary help-chat-trigger" onClick={() => setOpen(true)}>
        Help
      </button>

      {open && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div className="page-header">
              <h2>How can I help?</h2>
              <button className="btn btn-sm" type="button" onClick={close}>
                Close
              </button>
            </div>

            <div className="help-chat-messages">
              {messages.length === 0 && (
                <div className="help-chat-empty">
                  Ask me anything about using this app — clients, quotes, invoices, the Gmail/Slack
                  automation, whatever you're stuck on.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`help-chat-bubble help-chat-bubble-${m.role}`}>
                  {m.content}
                </div>
              ))}
              {busy && <div className="help-chat-bubble help-chat-bubble-assistant">Thinking…</div>}
            </div>

            {error && <div className="error">{error}</div>}

            <div className="row" style={{ marginTop: 8 }}>
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question... (Enter to send, Shift+Enter for a new line)"
                disabled={busy}
                style={{ flex: 1 }}
              />
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" type="button" onClick={close} disabled={busy}>
                Close
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleSend}
                disabled={busy || !input.trim()}
              >
                {busy ? "Asking..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
