"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function InfoTip({
  text,
  containerRef,
}: {
  text: React.ReactNode; // ✅ was string
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openTip = () => {
    if (typeof document === "undefined") return;

    const target = containerRef?.current ?? document.body;
    setPortalTarget(target);
    setOpen(true);
  };

  const closeTip = () => setOpen(false);

  const isBodyPortal = typeof document !== "undefined" && portalTarget === document.body;

  return (
    <>
      <button
        type="button"
        onClick={openTip}
        aria-label="Info"
        className={[
          "inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border",
          "border-white/14 bg-white/[0.035]",
          "text-[9px] font-medium leading-none text-white/65",
          "shadow-[0_3px_10px_rgba(0,0,0,0.28)]",
          "transition-colors duration-150",
          "hover:border-white/22 hover:bg-white/[0.07] hover:text-white/90",
          "focus:outline-none focus:ring-1 focus:ring-amber-300/25 focus:border-amber-300/45",
        ].join(" ")}
      >
        <span className="relative top-[-0.5px]">i</span>
      </button>

      {open && portalTarget
        ? createPortal(
            <div
              className={[
                isBodyPortal ? "fixed inset-0" : "absolute inset-0",
                "z-[60] flex justify-center p-4",
                isBodyPortal ? "items-center" : "items-start pt-8 md:pt-10",
              ].join(" ")}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={closeTip}
                className={[
                  "absolute inset-0 cursor-default rounded-[inherit]",
                  "bg-[radial-gradient(70%_60%_at_50%_50%,rgba(0,0,0,0.62),rgba(0,0,0,0.78))]",
                  "backdrop-blur-md",
                  "supports-[filter]:filter supports-[filter]:brightness-75 supports-[filter]:saturate-75",
                  "animate-[fadeIn_140ms_ease-out]",
                ].join(" ")}
              />

              <div
                role="dialog"
                aria-modal="true"
                className={[
                  "relative w-full max-w-md rounded-2xl border",
                  "border-white/28",
                  "bg-[linear-gradient(180deg,rgba(22,20,16,0.94),rgba(0,0,0,0.88))]",
                  "shadow-[0_40px_130px_rgba(0,0,0,0.92),_0_0_0_1px_rgba(255,255,255,0.16)]",
                  "overflow-hidden",
                  "animate-[popIn_160ms_cubic-bezier(0.2,0.9,0.2,1)]",
                ].join(" ")}
              >
                <div className="pointer-events-none absolute inset-0 opacity-90">
                  <div className="absolute inset-0 bg-[radial-gradient(900px_320px_at_50%_0%,rgba(255,227,160,0.14),transparent_60%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_50%_70%,rgba(212,175,55,0.10),transparent_65%)]" />
                </div>

                <div className="relative p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                      Info
                    </div>
                    <button
                      type="button"
                      onClick={closeTip}
                      className="rounded-lg border border-white/14 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:border-white/25 hover:bg-white/8 hover:text-white"
                    >
                      Close
                    </button>
                  </div>

                  <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/25 to-transparent" />
                  <div className="mt-[1px] h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                  {/* ✅ When passing ReactNode, DO NOT wrap in <p> */}
                  <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/80">
                    {text}
                  </div>
                </div>
              </div>

              <style jsx>{`
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                  }
                  to {
                    opacity: 1;
                  }
                }
                @keyframes popIn {
                  from {
                    opacity: 0;
                    transform: translateY(6px) scale(0.985);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
              `}</style>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
