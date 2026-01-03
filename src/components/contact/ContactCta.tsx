"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail } from "lucide-react";

type Status = "idle" | "sending" | "sent" | "error";

const LIMITS = {
  nameMin: 2,
  nameMax: 50,
  emailMax: 50,
  companyMax: 50,
  messageMin: 10,
  messageMax: 200,
};

// Practical/production-grade email validation (no spaces, common provider rules)
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

type Form = {
  name: string;
  email: string;
  company: string;
  message: string;
};

type Touched = Partial<Record<keyof Form, boolean>>;

function clampLen(s: string, max: number) {
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeEmailForUi(s: string) {
  // Subtle UX: auto-lowercase + strip ALL whitespace as user types/pastes
  return s.toLowerCase().replace(/\s/g, "");
}

function normalizeEmailForSubmit(s: string) {
  // keep consistent for submit/validate
  return s.trim().toLowerCase().replace(/\s/g, "");
}

function validate(form: Form) {
  const errors: Partial<Record<keyof Form, string>> = {};

  const name = form.name.trim();
  const email = normalizeEmailForSubmit(form.email);
  const company = form.company.trim();
  const message = form.message.trim();

  // Name
  if (name.length < LIMITS.nameMin)
    errors.name = `Name must be at least ${LIMITS.nameMin} characters.`;
  else if (name.length > LIMITS.nameMax)
    errors.name = `Name must be at most ${LIMITS.nameMax} characters.`;
  else if (!/^[\p{L}\p{M} .'’-]+$/u.test(name))
    errors.name = "Name contains invalid characters.";

  // Email
  if (email.length === 0) errors.email = "Email is required.";
  else if (email.length > LIMITS.emailMax)
    errors.email = `Email must be at most ${LIMITS.emailMax} characters.`;
  else if (/\s/.test(email)) errors.email = "Email cannot contain spaces.";
  else if (!EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address (e.g. name@domain.com).";

  // Company (optional)
  if (company.length > 0) {
    if (company.length > LIMITS.companyMax)
      errors.company = `Company must be at most ${LIMITS.companyMax} characters.`;
    else if (!/^[\p{L}\p{M}0-9 &.,'’()\-]+$/u.test(company))
      errors.company = "Company contains invalid characters.";
  }

  // Message
  if (message.length < LIMITS.messageMin)
    errors.message = `Message must be at least ${LIMITS.messageMin} characters.`;
  else if (message.length > LIMITS.messageMax)
    errors.message = `Message must be at most ${LIMITS.messageMax} characters.`;

  return { errors, normalized: { name, email, company, message } };
}

export function ContactCta() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState("");
  const [touched, setTouched] = useState<Touched>({});
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  // ✅ NEW: hide trigger on mobile portrait once user scrolls a bit
  const [showTrigger, setShowTrigger] = useState(true);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAndReset();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ NEW: scroll + media query logic (mobile portrait only)
  useEffect(() => {
    if (open) return; // when modal open, ignore scroll logic
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 767px) and (orientation: portrait)");

    const update = () => {
      // Only apply on mobile portrait — otherwise always show
      if (!mq.matches) {
        setShowTrigger(true);
        return;
      }
      // Fade away after a small scroll
      setShowTrigger(window.scrollY < 40);
    };

    update();

    window.addEventListener("scroll", update, { passive: true });
    mq.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("scroll", update);
      mq.removeEventListener?.("change", update);
    };
  }, [open]);

  const { errors } = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const canSend = useMemo(
    () => !hasErrors && status !== "sending",
    [hasErrors, status]
  );

  function closeAndReset() {
    setOpen(false);
    setStatus("idle");
    setErr("");
    setTouched({});
    setForm({ name: "", email: "", company: "", message: "" });
  }

  async function submit() {
    setErr("");

    // mark all as touched so errors show if invalid
    setTouched({ name: true, email: true, company: true, message: true });

    const check = validate(form);
    if (Object.keys(check.errors).length) return;

    setStatus("sending");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...check.normalized,
          page: window.location.href,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to send message.");

      setStatus("sent");

      setTimeout(() => {
        closeAndReset();
      }, 1400);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
      setStatus("error");
    }
  }

  // helpers to show field errors only when touched
  const show = (k: keyof Form) => Boolean(touched[k] && errors[k]);

  return (
    <>
      {/* ✅ CONTACT CTA (fades away on mobile portrait scroll) */}
      <AnimatePresence>
        {showTrigger && (
          <motion.button
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(true)}
            className="
              fixed md:static
              top-4 right-4 md:top-auto md:right-auto
              z-40
              flex items-center gap-2
              rounded-full
              border border-white/20
              bg-white/5
              px-3 py-2 md:px-4 md:py-2
              text-xs font-medium text-white/80
              shadow-lg backdrop-blur-md
              transition-all duration-200
              hover:bg-white/10 hover:scale-[1.03]
              focus:outline-none focus:ring-2 focus:ring-amber-400/30
            "
            aria-label="Contact"
          >
            <Mail className="h-4 w-4 text-amber-300/90" />
            <span className="hidden md:inline">Business inquiry</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* ✅ ULTRA Backdrop (same as AboutCta) */}
            <motion.div
              className="fixed inset-0 z-[90]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAndReset}
              aria-hidden="true"
            >
              {/* Layer 1 — insane blur */}
              <div
                className="
                  absolute inset-0
                  bg-black/40
                  backdrop-blur-[48px]
                  backdrop-saturate-[180%]
                  backdrop-brightness-[55%]
                "
              />

              {/* Layer 2 — contrast kill */}
              <div className="absolute inset-0 bg-black/45" />

              {/* Layer 3 — vignette */}
              <div
                className="
                  absolute inset-0
                  bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.85)_100%)]
                "
              />
            </motion.div>

            {/* Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="
                fixed bottom-0 left-0 right-0 z-[100]
                md:inset-0 md:m-auto md:h-fit
                md:max-w-[560px]
                rounded-t-3xl md:rounded-3xl
                border border-white/15
                bg-black/85 backdrop-blur-2xl
                p-5 md:p-6
                shadow-[0_60px_220px_rgba(0,0,0,0.95)]
              "
              role="dialog"
              aria-modal="true"
              aria-label="Contact form"
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className="
                        inline-flex items-center gap-2
                        rounded-full
                        border border-amber-400/30
                        bg-black/60
                        px-3 py-1
                        text-sm font-medium
                        text-amber-300
                        shadow-[0_0_0_1px_rgba(251,191,36,0.25)]
                        backdrop-blur
                      "
                    >
                      <Mail className="h-4 w-4 text-amber-300" />
                      Business Inquiry
                    </div>
                  </div>
                </div>

                <button
                  onClick={closeAndReset}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10 transition"
                >
                  Close
                </button>
              </div>

              {/* Form */}
              <div className="grid gap-4">
                <Field
                  label="Name"
                  value={form.name}
                  onChange={(v) =>
                    setForm((s) => ({
                      ...s,
                      name: clampLen(v, LIMITS.nameMax),
                    }))
                  }
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="Your name"
                  error={show("name") ? errors.name : ""}
                  hint={`${Math.min(form.name.length, LIMITS.nameMax)}/${LIMITS.nameMax}`}
                />

                <Field
                  label="Email"
                  value={form.email}
                  onChange={(v) =>
                    setForm((s) => ({
                      ...s,
                      // ✅ auto-lowercase + strip spaces as you type/paste
                      email: clampLen(normalizeEmailForUi(v), LIMITS.emailMax),
                    }))
                  }
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="you@company.com"
                  inputMode="email"
                  error={show("email") ? errors.email : ""}
                  hint={`${Math.min(form.email.length, LIMITS.emailMax)}/${LIMITS.emailMax}`}
                />

                <Field
                  label="Company (optional)"
                  value={form.company}
                  onChange={(v) =>
                    setForm((s) => ({
                      ...s,
                      company: clampLen(v, LIMITS.companyMax),
                    }))
                  }
                  onBlur={() => setTouched((t) => ({ ...t, company: true }))}
                  placeholder="Company name"
                  error={show("company") ? errors.company : ""}
                  hint={`${Math.min(form.company.length, LIMITS.companyMax)}/${LIMITS.companyMax}`}
                />

                <div>
                  <div className="mb-2 text-xs text-white-200/90 flex items-center justify-between">
                    <span>Message</span>
                    <span className="text-xs text-white/70">
                      {Math.min(form.message.length, LIMITS.messageMax)}/
                      {LIMITS.messageMax}
                    </span>
                  </div>

                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        message: clampLen(e.target.value, LIMITS.messageMax),
                      }))
                    }
                    onBlur={() => setTouched((t) => ({ ...t, message: true }))}
                    placeholder="Tell us your inquiry …"
                    className={[
                      "w-full rounded-2xl bg-white/5 border px-4 py-3 text-sm text-white placeholder-white/40",
                      "focus:outline-none focus:ring-2 focus:ring-amber-400/30",
                      show("message")
                        ? "border-red-400/40 focus:ring-red-400/25"
                        : "border-white/15",
                    ].join(" ")}
                  />

                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-xs text-white/70">
                      Minimum {LIMITS.messageMin} characters
                    </div>
                    {show("message") ? (
                      <div className="text-[11px] text-red-200">
                        {errors.message}
                      </div>
                    ) : null}
                  </div>
                </div>

                {status === "error" && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {err}
                  </div>
                )}

                {status === "sent" && (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    ✓ Message sent — I’ll be in touch.
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeAndReset}
                    className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/70 hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>

                  <button
                    disabled={!canSend}
                    onClick={submit}
                    className={[
                      "rounded-full border px-4 py-2 text-xs transition",
                      "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    ].join(" ")}
                  >
                    {status === "sending" ? "Sending…" : "Send message"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  error?: string;
  hint?: string;
}) {
  const { label, value, onChange, onBlur, placeholder, inputMode, error, hint } =
    props;
  const hasError = Boolean(error);

  return (
    <div>
      <div className="mb-2 text-xs text-white-200/90 flex items-center justify-between">
        <span>{label}</span>
        {hint ? <span className="text-xs text-white/70">{hint}</span> : null}
      </div>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        className={[
          "w-full rounded-2xl border bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40",
          "focus:outline-none focus:ring-2",
          hasError
            ? "border-red-400/40 focus:ring-red-400/25"
            : "border-white/15 focus:ring-amber-400/30",
        ].join(" ")}
        aria-invalid={hasError ? true : undefined}
      />

      {hasError ? (
        <div className="mt-1 text-[11px] text-red-200">{error}</div>
      ) : null}
    </div>
  );
}
