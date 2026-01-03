"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, ArrowRight, TrendingUp, Layers3 } from "lucide-react";

export function AboutCta() {
  const [open, setOpen] = useState(false);

  // ✅ NEW: hide trigger on mobile portrait once user scrolls a bit
  const [showTrigger, setShowTrigger] = useState(true);

  // Lock scroll when open
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <>
      {/* ✅ Trigger (fades away on mobile portrait scroll) */}
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
              top-4 left-4 md:top-auto md:left-auto
              z-40
              flex items-center gap-2
              rounded-full border border-white/20
              bg-white/5 px-3 py-2 md:px-4
              text-xs font-medium text-white/80
              shadow-lg backdrop-blur-md
              transition-all duration-200
              hover:bg-white/10 hover:scale-[1.03]
              focus:outline-none focus:ring-2 focus:ring-amber-400/30
            "
            aria-label="About PriceIQ"
          >
            <Lightbulb className="h-4 w-4 text-amber-300/90" />
            <span className="hidden md:inline">Who we are</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* ✅ ULTRA Backdrop (stronger blur/shadow effect) */}
            <motion.div
              className="fixed inset-0 z-[90]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
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
              initial={{ y: 18, opacity: 0, scale: 0.99 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0, scale: 0.99 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="
                fixed bottom-0 left-0 right-0 z-[100]
                md:inset-0 md:m-auto md:h-fit
                md:max-w-[720px]
                rounded-t-3xl md:rounded-3xl
                border border-white/15
                bg-black/85 backdrop-blur-2xl
                shadow-[0_60px_220px_rgba(0,0,0,0.95)]
                overflow-hidden
              "
              role="dialog"
              aria-modal="true"
              aria-label="About PriceIQ"
            >
              {/* Subtle premium glow */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.16),transparent_60%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />

              <div className="relative p-5 md:p-7">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1">
                      <Lightbulb className="h-4 w-4 text-amber-300/90" />
                      <span className="flex items-baseline text-[11px] font-medium text-amber-200/90">
                        About PriceIQ
                        <span
                          aria-hidden
                          className="ml-[2px] h-[4px] w-[4px] translate-y-[1.5px] rounded-[1px] bg-amber-400"
                        />
                      </span>
                    </div>

                    <h2 className="mt-3 text-[20px] md:text-2xl font-semibold tracking-tight">
                      See the real cost of getting paid.
                    </h2>

                    <p className="mt-1 text-[13px] md:text-sm text-white/65 max-w-[60ch]">
PriceIQ shows what you really keep from every pricing scenario.                    </p>
                  </div>
                </div>

                {/* Value cards */}
                <div className="mt-4 md:mt-5">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniCard
                      icon={<Layers3 className="h-4 w-4 text-amber-300/90" />}
                      title="Decision-modelling"
                      body="Understand the impact of every choice - Fast."
                    />

                    <MiniCard
                      icon={<TrendingUp className="h-4 w-4 text-amber-300/90" />}
                      title="Outcome transparency"
                      body="See exactly where your money goes — and why. "
                    />
                  </div>
                </div>

                {/* Compact “What you get” */}
                <div className="mt-4 md:mt-5 rounded-3xl border border-white/12 bg-white/5 p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white/90">
                        What you get
                      </h3>
                      <p className="mt-1 text-[12px] text-white/60">
                        A clear view of costs, revenue and profitability.
                      </p>
                    </div>

                    <div className="hidden md:flex items-center gap-2 text-[11px] text-white/55">
                      Built for Businesses<span className="text-white/25">•</span>{" "}
                      Agencies <span className="text-white/25">•</span>{" "}
                      Teams
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2.5">
                    <Bullet>Shape your pricing strategy, evaluate the impact.</Bullet>
                    <Bullet>
                      Compare scenarios, download results: no account needed, no lock-in.
                    </Bullet>
                  </div>
                </div>

                {/* ✅ UPDATED: Professional CTA Row */}
                <div className="mt-6 md:mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5 md:pt-6">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40">
                      Follow us
                    </span>
                    <a
                      href="https://x.com/PriceIq25489"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        group relative flex items-center justify-center 
                        h-9 w-9 rounded-full 
                        bg-gradient-to-b from-white/[0.08] to-transparent
                        border border-white/[0.12] 
                        text-white/70 shadow-inner
                        transition-all duration-300 ease-out
                        hover:border-white/30 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]
                      "
                      aria-label="Follow PriceIQ on X"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 fill-current transition-transform duration-500 group-hover:rotate-[360deg]"
                        aria-hidden="true"
                      >
                        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                      </svg>
                      <span className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-white/[0.03]" />
                    </a>
                  </div>

                  <button
                    onClick={() => setOpen(false)}
                    className="
                      group relative inline-flex items-center gap-2.5
                      rounded-full bg-white px-5 py-2.5
                      text-[13px] font-semibold text-black
                      transition-all duration-300
                      hover:bg-amber-400 hover:scale-[1.02] active:scale-[0.98]
                    "
                  >
                    <span>Explore PriceIQ</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
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

function MiniCard(props: { icon: React.ReactNode; title: string; body: string }) {
  const { icon, title, body } = props;

  return (
    <div
      className="
        rounded-3xl border border-white/12
        bg-white/5 p-3.5 md:p-4
        shadow-[0_18px_60px_rgba(0,0,0,0.40)]
      "
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
          {icon}
        </div>
        <div className="text-sm font-semibold text-white/90">{title}</div>
      </div>
      <p className="mt-1.5 text-[12px] text-white/65 leading-relaxed">{body}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-amber-400/80 shrink-0" />
      <p className="text-[13px] md:text-sm text-white/75 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
