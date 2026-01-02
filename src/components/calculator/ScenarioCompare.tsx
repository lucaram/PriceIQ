"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

export type ScenarioRow = {
  /** ✅ Must be unique + stable (use scenario.id from Calculator) */
  id: string;
  name: string;
  symbol: string;
  gross: number;
  stripeFee: number;
  fxFee: number;
  platformFee: number;
  net: number;
};

function fmt(symbol: string, n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${symbol}${n.toFixed(2)}`;
}

type CopiedId = string | null;

// -----------------------------
// ✅ PostHog helper (safe + low noise)
// -----------------------------
function safeCapture(event: string, props?: Record<string, any>) {
  try {
    if (typeof window === "undefined") return;
    if (!posthog || typeof (posthog as any).capture !== "function") return;
    (posthog as any).capture(event, props ?? {});
  } catch {
    // no-op
  }
}

export function ScenarioCompare(props: {
  rows: ScenarioRow[];
  /** ✅ scenario.id -> full share URL for THAT scenario */
  scenarioUrls?: Record<string, string>;
}) {
  const { rows, scenarioUrls } = props;

  // ✅ Hooks MUST be unconditional
  const [copiedId, setCopiedId] = useState<CopiedId>(null);
  const timerRef = useRef<number | null>(null);

  // ✅ PostHog: fire once per mount when comparison becomes visible
  const viewedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashCopied(id: string) {
    setCopiedId(id);
    clearTimer();
    timerRef.current = window.setTimeout(() => setCopiedId(null), 1200);
  }

  async function copyText(payload: string, id: string) {
    const text = String(payload ?? "");
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      flashCopied(id);
      return;
    } catch {
      // fallback below
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (ok) flashCopied(id);
    } catch {
      // silent fail
    }
  }

  const base = rows[0];

  // ✅ PostHog: comparison viewed (visible state only)
  useEffect(() => {
    if (viewedRef.current) return;
    if (rows.length <= 1 || !base) return;

    viewedRef.current = true;

    const scenarioCount = rows.length;
    const hasShareUrls = Boolean(scenarioUrls && Object.keys(scenarioUrls).length > 0);

    safeCapture("compare_viewed", {
      app: "PriceIQ",
      scenario_count: scenarioCount,
      has_share_urls: hasShareUrls,
    });
  }, [rows.length, base, scenarioUrls]);

  if (rows.length <= 1 || !base) return null;

  const metrics: Array<{
    label: string;
    get: (r: ScenarioRow) => string;
    isNet?: boolean;
  }> = [
    { label: "Charge", get: (r) => fmt(r.symbol, r.gross) },
    { label: "Stripe fee", get: (r) => fmt(r.symbol, r.stripeFee) },
    { label: "FX fee", get: (r) => fmt(r.symbol, r.fxFee) },
    { label: "Platform fee", get: (r) => fmt(r.symbol, r.platformFee) },
    { label: "Net you keep", get: (r) => fmt(r.symbol, r.net), isNet: true },
  ];

  // ✅ Compact mobile card view (no huge table width)
  const MobileView = (
    <section className="surface mt-4 rounded-3xl p-4 md:hidden">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white/90">Scenario comparison</h3>
        <p className="mt-1 text-[11px] leading-snug text-white/60">
          Compact view. Deltas are vs <span className="text-white/80">Scenario 1</span>.
        </p>
      </div>

      <div className="space-y-2.5">
        {rows.map((r, idx) => {
          const url = scenarioUrls?.[r.id] ?? "";
          const canCopy = Boolean(url);

          const deltaNet =
            idx === 0
              ? null
              : Number.isFinite(r.net) && Number.isFinite(base.net)
              ? r.net - base.net
              : null;

          return (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold text-white/90">{r.name}</div>
                    {idx === 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                        Base
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 text-[11px] text-white/55">
                    {idx === 0 ? "Reference scenario" : "Compared to Scenario 1"}
                  </div>
                </div>

                {canCopy ? (
                  <button
                    type="button"
                    onClick={async () => {
                      safeCapture("compare_copy_link", {
                        app: "PriceIQ",
                        scenario_id: r.id,
                        scenario_name: r.name,
                        scenario_index: idx + 1,
                        scenario_count: rows.length,
                        has_url: Boolean(url),
                      });

                      await copyText(url, r.id);
                    }}
                    className={[
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] leading-none transition",
                      copiedId === r.id
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                    ].join(" ")}
                    title="Copy share link for this scenario"
                  >
                    {copiedId === r.id ? "✓ Copied" : "Copy link"}
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {metrics.map((m) => {
                  const isNet = Boolean(m.isNet);
                  const v = m.get(r);

                  const showDelta = isNet && idx !== 0 && deltaNet !== null;
                  const deltaText =
                    showDelta && deltaNet !== null
                      ? `(${deltaNet >= 0 ? "+" : ""}${fmt(r.symbol, deltaNet)})`
                      : null;

                  return (
                    <div key={`${r.id}:${m.label}`} className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-white/45">{m.label}</div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <div className="truncate text-sm font-medium text-white/85">{v}</div>
                        {deltaText ? (
                          <div className={["text-[11px]", deltaNet! >= 0 ? "text-emerald-300" : "text-rose-300"].join(" ")}>
                            {deltaText}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  // ✅ Desktop table view (unchanged)
  const DesktopView = (
    <section className="surface mt-6 hidden rounded-3xl p-6 md:block md:p-7">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white/90">Scenario comparison</h3>
        <p className="mt-1 text-xs text-white/60">Compare up to 3 pricing setups. Deltas are vs Scenario 1.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-xs text-white/55">
              <th className="px-3 py-2 text-left">Metric</th>

              {rows.map((r, idx) => {
                const url = scenarioUrls?.[r.id] ?? "";
                const canCopy = Boolean(url);

                return (
                  <th key={r.id} className="px-3 py-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/80">{r.name}</span>

                      {canCopy ? (
                        <button
                          type="button"
                          onClick={async () => {
                            safeCapture("compare_copy_link", {
                              app: "PriceIQ",
                              scenario_id: r.id,
                              scenario_name: r.name,
                              scenario_index: idx + 1,
                              scenario_count: rows.length,
                              has_url: Boolean(url),
                            });

                            await copyText(url, r.id);
                          }}
                          className={[
                            "rounded-full border px-2.5 py-1 text-[11px] transition",
                            copiedId === r.id
                              ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                          ].join(" ")}
                          title="Copy share link for this scenario"
                        >
                          {copiedId === r.id ? "✓ Copied" : "Copy link"}
                        </button>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {[
              ["Charge", (r: ScenarioRow) => fmt(r.symbol, r.gross)],
              ["Stripe fee", (r: ScenarioRow) => fmt(r.symbol, r.stripeFee)],
              ["FX fee", (r: ScenarioRow) => fmt(r.symbol, r.fxFee)],
              ["Platform fee", (r: ScenarioRow) => fmt(r.symbol, r.platformFee)],
              ["Net you keep", (r: ScenarioRow) => fmt(r.symbol, r.net)],
            ].map(([label, getter]) => (
              <tr key={label as string} className="rounded-2xl bg-white/5">
                <td className="px-3 py-3 font-medium text-white/80">{label as string}</td>

                {rows.map((r, idx) => {
                  const v = getter as (x: ScenarioRow) => string;

                  const isNet = label === "Net you keep";
                  const delta =
                    idx === 0 || !isNet
                      ? null
                      : Number.isFinite(r.net) && Number.isFinite(base.net)
                      ? r.net - base.net
                      : null;

                  return (
                    <td key={`${r.id}:${label}`} className="px-3 py-3 text-white/80">
                      <div className="flex items-center gap-2">
                        <span>{v(r)}</span>

                        {delta !== null ? (
                          <span className={["text-xs", delta >= 0 ? "text-emerald-300" : "text-rose-300"].join(" ")}>
                            ({delta >= 0 ? "+" : ""}
                            {fmt(r.symbol, delta)})
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      {MobileView}
      {DesktopView}
    </>
  );
}
