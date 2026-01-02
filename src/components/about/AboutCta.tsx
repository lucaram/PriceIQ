"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, ArrowRight, TrendingUp, Layers3 } from "lucide-react";

export function AboutCta() {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      {/* Trigger */}
      <button
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
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

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
                bg-black/80 backdrop-blur-xl
                shadow-[0_45px_140px_rgba(0,0,0,0.85)]
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
                      <span className="text-[11px] font-medium text-amber-200/90">
                        About PriceIQ
                      </span>
                    </div>

                    <h2 className="mt-3 text-[20px] md:text-2xl font-semibold tracking-tight">
                      Clarity for pricing decisions.
                    </h2>

                    <p className="mt-1 text-[13px] md:text-sm text-white/65 max-w-[60ch]">
                      Know your real take-home before you sell.
                    </p>
                  </div>

                  <button
                    onClick={() => setOpen(false)}
                    className="
                      shrink-0
                      rounded-full border border-white/15
                      bg-white/5 p-2
                      text-white/70
                      transition hover:bg-white/10 hover:text-white/85
                      focus:outline-none focus:ring-2 focus:ring-amber-400/30
                    "
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Value cards (2 total on mobile + desktop) */}
                <div className="mt-4 md:mt-5">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniCard
                      icon={<Layers3 className="h-4 w-4 text-amber-300/90" />}
                      title="Decision-ready"
                      body="Turn assumptions into clean scenarios you can act on — fast."
                    />

                    <MiniCard
                      icon={<TrendingUp className="h-4 w-4 text-amber-300/90" />}
                      title="Outcome transparency"
                      body="Every area is acurately explained so economics are clear. "
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
                        A clear analysis of costs, revenues and profitability.
                      </p>
                    </div>

                    <div className="hidden md:flex items-center gap-2 text-[11px] text-white/55">
                      For sellers & operators <span className="text-white/25">•</span>{" "}
                      pricing teams <span className="text-white/25">•</span>{" "}
                      creators
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2.5">
                    <Bullet>
                      Model how{" "}
                      <span className="text-white/90">
                        pricing & fees 
                      </span>{" "}
                      shape what you keep.
                    </Bullet>
                    <Bullet>
                      Compare scenarios to choose the best{" "}
                      <span className="text-white/90">cost model.</span>
                    </Bullet>
                  </div>
                </div>

                {/* CTA row */}
                <div className="mt-4 md:mt-5 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-white/55 leading-snug">
                    Tip: model your{" "}
                    <span className="text-white/80">Decisions</span>, then review the{" "}
                    <span className="text-white/80">Outcome</span>.
                  </div>

                  <button
                    onClick={() => setOpen(false)}
                    className="
                      inline-flex items-center gap-2
                      rounded-full border border-amber-400/25
                      bg-amber-400/10 px-4 py-2
                      text-xs font-medium text-amber-200
                      transition hover:bg-amber-400/20
                      focus:outline-none focus:ring-2 focus:ring-amber-400/30
                    "
                  >
                    Explore
                    <ArrowRight className="h-4 w-4 text-amber-200/90" />
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
