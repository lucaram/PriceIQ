// src/components/calculator/MoneyRow.tsx
"use client";

import type React from "react";

export function MoneyRow(props: {
  label: React.ReactNode; // allow JSX
  symbol: string;
  value: number;
  big?: boolean;
  kind?: "normal" | "fee" | "charge" | "net";

  rate?: React.ReactNode;
  showRate?: boolean;
}) {
  const { label, symbol, value, big, kind = "normal", rate, showRate } = props;

  const isFee = kind === "fee";
  const isCharge = kind === "charge";
  const isNet = kind === "net";

  const hasRate = showRate ?? rate != null;

  // ✅ Format amounts consistently (1,000.00)
  const formattedAmount = Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

  // ✅ Detect if label already visually starts with a dash
  const labelStartsWithDash =
    typeof label === "string" && label.trim().startsWith("–");

  return (
    <div
      className={[
        "grid items-start gap-4",
        hasRate
          ? "grid-cols-[minmax(0,1fr)_88px_auto]"
          : "grid-cols-[minmax(0,1fr)_auto]",
      ].join(" ")}
    >
      {/* Description */}
      <div
        className={[
          "min-w-0 truncate",
          big ? "text-[14px] font-semibold" : "text-[13px] font-semibold",
          isFee && "text-red-200/85",
          isCharge && "text-amber-100/85",
          isNet && "text-emerald-200/90",
          !isFee && !isCharge && !isNet && "text-white/75",
        ].join(" ")}
        title={typeof label === "string" ? label : undefined}
      >
        <span className="inline-flex items-baseline gap-1">
          {/* ✅ Only add dash if not already present */}
          {isFee && !labelStartsWithDash ? <span>–</span> : null}
          {label}
        </span>
      </div>

      {/* Rate (optional) */}
      {hasRate ? (
        <div
          className={[
            "shrink-0 text-right tabular-nums",
            big ? "text-[14px] font-semibold" : "text-[13px] font-semibold",
            "text-white/70",
          ].join(" ")}
        >
          {rate ?? "—"}
        </div>
      ) : null}

      {/* Amount */}
      <div
        className={[
          "shrink-0 text-right tabular-nums",
          big ? "text-[22px] font-extrabold" : "text-[14px] font-semibold",
          isFee && "text-red-100",
          isCharge && "text-amber-100",
          isNet && "text-emerald-200",
          !isFee && !isCharge && !isNet && "text-white",
        ].join(" ")}
      >
        {Number.isFinite(value) ? `${symbol}${formattedAmount}` : "—"}
      </div>
    </div>
  );
}
