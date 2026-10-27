"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { Locale } from "@/lib/i18n";

type Msg = {
  id: string;
  mine: boolean;
  body: string;
  flagged: boolean;
  createdAt: string;
};

/**
 * One masked thread (Section 7).
 *
 * Kept deliberately plain: bubbles, a box, a button. The only unusual element is the
 * redaction notice — when the platform alters what someone wrote, it tells them, because
 * silently changing a message is a dark pattern.
 */
export default function MessageThread({
  conversationId,
  locale,
  initial,
}: {
  conversationId: string;
  locale: Locale;
  initial: Msg[];
}) {
  const ar = locale === "ar";
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(ar ? "مش قادرين نبعت الرسالة." : "The message could not be sent.");
        return;
      }
      setMessages((m) => [
        ...m,
        { id: json.id, mine: true, body: text, flagged: !!json.wasRedacted, createdAt: new Date().toISOString() },
      ]);
      setBody("");
      if (json.wasRedacted) {
        setNotice(
          json.notice ??
            (ar
              ? "شلنا بيانات التواصل من رسالتك قبل ما توصل."
              : "Contact details were removed from your message before delivery."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-[14px] muted">
            {ar ? "ابدأ الكلام باستفسارك." : "Start with your question."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-md px-3.5 py-2.5 text-[14px] leading-relaxed ${
                m.mine ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-900"
              }`}
            >
              {m.body}
              {m.flagged && m.mine && (
                <span className="mt-1.5 flex items-center gap-1 text-[12px] text-white/70">
                  <ShieldAlert size={11} />
                  {ar ? "اتعدّلت قبل التسليم" : "edited before delivery"}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {notice && (
        <p className="mx-4 mb-2 border-s-2 border-danger-600 ps-2.5 text-[12px] leading-relaxed text-danger-700">
          {notice}
        </p>
      )}

      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={ar ? "اكتب رسالتك…" : "Write a message…"}
            className="textarea min-h-[44px] flex-1 resize-none py-2.5"
          />
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={send}
            aria-label={ar ? "ابعت" : "Send"}
            className="btn btn-primary h-[44px] px-4"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="rtl:-scale-x-100" />}
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed muted">
          {ar
            ? "أرقام التليفون والإيميلات بتتشال أوتوماتيك. التواصل بيفضل جوه المنصة لحد ما المعاينة تتأكد."
            : "Phone numbers and emails are stripped automatically. Contact stays on the platform until a viewing is confirmed."}
        </p>
      </div>
    </div>
  );
}
