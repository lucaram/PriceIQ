export function MoneyRow(props: {
  label: React.ReactNode; // ✅ allow JSX, not just string
  symbol: string;
  value: number;
  big?: boolean;
  kind?: "normal" | "fee" | "charge" | "net";
}) {

  const { label, symbol, value, big, kind = "normal" } = props;

  const isFee = kind === "fee";
  const isCharge = kind === "charge";
  const isNet = kind === "net";

  return (
    <div className="flex items-start justify-between gap-4">

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
  {isFee ? <span>–</span> : null}
  {label}
</span>

      </div>

      <div
        className={[
          "shrink-0 tabular-nums",
          big ? "text-[22px] font-extrabold" : "text-[14px] font-semibold",
          isFee && "text-red-100",
          isCharge && "text-amber-100",
          isNet && "text-emerald-200",
          !isFee && !isCharge && !isNet && "text-white",
        ].join(" ")}
      >
        {symbol}
        {Number.isFinite(value) ? value.toFixed(2) : "—"}
      </div>
    </div>
  );
}
