"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";

type CopiedKind = null | "link" | "breakdown" | "csv" | "xls";
type CsvKV = Array<{ label: string; value: string }>;

function csvEscape(v: string) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function kvToMap(rows: CsvKV) {
  const m: Record<string, string> = {};
  for (const r of rows ?? []) {
    const k = String(r?.label ?? "").trim();
    if (!k) continue;
    m[k] = String(r?.value ?? "");
  }
  return m;
}

function nowLocalStamp() {
  // "2025-12-31_13-05-09"
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

function isTruthyOn(v: string) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

// -----------------------------
// Excel XML helpers (.xls)
// -----------------------------
function xmlEscape(v: string) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * ✅ Vertical (top-to-bottom) CSV export:
 * - 2 columns: label,value
 * - Stable, professional ordering
 * - Missing fields are filled with 0 / Off / "" / []
 * - Includes exported_at + share_url
 */
function buildVerticalCsv(rows: CsvKV, shareUrl: string) {
  const m = kvToMap(rows);

  const get = (k: string, fallback = "") => (m[k] != null && m[k] !== "" ? m[k] : fallback);
  const getZero = (k: string) => get(k, "0");
  const getOff = (k: string) => get(k, "Off");
  const getJsonArray = (k: string) => {
    const v = (m[k] ?? "").trim();
    return v ? v : "[]";
  };

  // Unify provider fee (calculator emits BOTH keys but we’re defensive)
  const stripeFee = get("stripe_fee", "");
  const providerFee = get("provider_fee", "");
  const unifiedProviderFee = stripeFee && stripeFee !== "0" ? stripeFee : providerFee || "0";

  // Fee overrides: if either value exists OR flag says on
  const overridePct = get("override_percent", "");
  const overrideFixed = get("override_fixed", "");
  const feeOverridesOn = isTruthyOn(get("fee_overrides_on", "")) || Boolean(overridePct || overrideFixed);

  // Volume tiers json
  const volumeTiersJson = getJsonArray("volume_tiers_json");

  const ordered: Array<{ label: string; value: string }> = [
    // Meta
    { label: "meta.exported_at_local", value: nowLocalStamp() },

    // Context
    { label: "context.app", value: get("app", "PriceIQ") },
    { label: "context.scenario", value: get("scenario", "") },
    { label: "context.provider_id", value: get("provider_id", "") },
    { label: "context.provider", value: get("provider", "") },
    { label: "context.product", value: get("product", "") },
    { label: "context.custom_provider_label", value: get("custom_provider_label", "") },
    { label: "context.region", value: get("region", "") },
    { label: "context.mode", value: get("mode", "") },
    { label: "context.tier", value: getOff("tier") },
    { label: "context.currency_symbol", value: get("currency_symbol", "") },

    // Inputs / controls
    { label: "inputs.fx_percent", value: getZero("fx_percent") },
    { label: "inputs.platform_fee_percent", value: getZero("platform_fee_percent") },
    { label: "inputs.platform_fee_base", value: get("platform_fee_base", "gross") },
    { label: "inputs.vat_percent", value: getZero("vat_percent") },
    { label: "inputs.rounding_step", value: get("rounding_step", "") },
    { label: "inputs.psych_pricing_on", value: isTruthyOn(get("psych_pricing_on", "")) ? "On" : "Off" },

    // Fee overrides
    { label: "overrides.fee_overrides_on", value: feeOverridesOn ? "On" : "Off" },
    { label: "overrides.override_percent", value: overridePct ? overridePct : "0" },
    { label: "overrides.override_fixed", value: overrideFixed ? overrideFixed : "0" },

    // Results (per transaction)
    { label: "results.charge", value: getZero("charge") },
    { label: "results.stripe_fee", value: get("stripe_fee", "0") },
    { label: "results.provider_fee", value: get("provider_fee", "0") },
    { label: "results.provider_fee_unified", value: unifiedProviderFee || "0" },
    { label: "results.fx_fee", value: getZero("fx_fee") },
    { label: "results.platform_fee", value: getZero("platform_fee") },
    { label: "results.net_before_vat", value: getZero("net_before_vat") },
    { label: "results.vat_amount", value: getZero("vat_amount") },
    { label: "results.net_after_vat", value: getZero("net_after_vat") },

    // Advanced tools: Break-even
    { label: "advanced.break_even_section", value: isTruthyOn(get("break_even_on", "")) ? "On" : "Off" },
    { label: "advanced.break_even_target_net", value: getZero("break_even_target_net") },
    { label: "advanced.break_even_required_charge", value: getZero("break_even_required_charge") },
    { label: "advanced.break_even_solvable", value: isTruthyOn(get("break_even_solvable", "")) ? "1" : "0" },

    // Advanced tools: Fee impact
    { label: "advanced.fee_impact_section", value: isTruthyOn(get("fee_impact_on", "")) ? "On" : "Off" },
    { label: "advanced.fee_impact_affected_fee", value: get("fee_impact_affected_fee", "off") },
    { label: "advanced.fee_impact_delta_pct", value: getZero("fee_impact_delta_pct") },
    { label: "advanced.fee_impact_base_net", value: getZero("fee_impact_base_net") },
    { label: "advanced.fee_impact_net_up", value: getZero("fee_impact_net_up") },
    { label: "advanced.fee_impact_net_down", value: getZero("fee_impact_net_down") },

    // Advanced tools: Volume projections
    { label: "advanced.volume_section", value: isTruthyOn(get("volume_on", "")) ? "On" : "Off" },
    { label: "advanced.volume_tx_per_month", value: getZero("volume_tx_per_month") },
    { label: "advanced.volume_refund_rate_pct", value: getZero("volume_refund_rate_pct") },
    { label: "advanced.volume_tiers_json", value: volumeTiersJson },

    // Monthly outputs
    { label: "advanced.volume_monthly_gross", value: getZero("volume_monthly_gross") },
    { label: "advanced.volume_monthly_provider_fee", value: getZero("volume_monthly_provider_fee") },
    { label: "advanced.volume_monthly_fx_fee", value: getZero("volume_monthly_fx_fee") },
    { label: "advanced.volume_monthly_platform_fee", value: getZero("volume_monthly_platform_fee") },
    { label: "advanced.volume_monthly_net_before_refunds", value: getZero("volume_monthly_net_before_refunds") },
    { label: "advanced.volume_monthly_refund_loss", value: getZero("volume_monthly_refund_loss") },
    { label: "advanced.volume_monthly_net_after_refunds", value: getZero("volume_monthly_net_after_refunds") },
  ];

  const seenRaw = new Set<string>([
    "app",
    "scenario",
    "provider_id",
    "provider",
    "product",
    "custom_provider_label",
    "region",
    "mode",
    "tier",
    "currency_symbol",
    "fx_percent",
    "platform_fee_percent",
    "platform_fee_base",
    "vat_percent",
    "rounding_step",
    "psych_pricing_on",
    "fee_overrides_on",
    "override_percent",
    "override_fixed",
    "charge",
    "stripe_fee",
    "provider_fee",
    "fx_fee",
    "platform_fee",
    "net_before_vat",
    "vat_amount",
    "net_after_vat",
    "break_even_on",
    "break_even_target_net",
    "break_even_required_charge",
    "break_even_solvable",
    "fee_impact_on",
    "fee_impact_affected_fee",
    "fee_impact_delta_pct",
    "fee_impact_base_net",
    "fee_impact_net_up",
    "fee_impact_net_down",
    "volume_on",
    "volume_tx_per_month",
    "volume_refund_rate_pct",
    "volume_tiers_json",
    "volume_monthly_gross",
    "volume_monthly_provider_fee",
    "volume_monthly_fx_fee",
    "volume_monthly_platform_fee",
    "volume_monthly_net_before_refunds",
    "volume_monthly_refund_loss",
    "volume_monthly_net_after_refunds",
  ]);

  const extras: Array<{ label: string; value: string }> = [];
  for (const [k, v] of Object.entries(m)) {
    if (seenRaw.has(k)) continue;
    extras.push({ label: `extra.${k}`, value: String(v ?? "") });
  }

  const lines = [
    "label,value",
    ...ordered.map((r) => `${csvEscape(r.label)},${csvEscape(r.value)}`),
    ...extras.map((r) => `${csvEscape(r.label)},${csvEscape(r.value)}`),
  ];

  return "\uFEFF" + lines.join("\r\n");
}

function buildVerticalXls(rows: CsvKV, shareUrl: string) {
  const csv = buildVerticalCsv(rows, shareUrl);
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(1);

  const pairs: CsvKV = dataLines.map((ln) => {
    const idx = ln.indexOf(",");
    if (idx === -1) return { label: ln, value: "" };
    const label = ln.slice(0, idx);
    const value = ln.slice(idx + 1);

    const unq = (s: string) => {
      const t = String(s ?? "");
      if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
      return t;
    };

    return { label: unq(label), value: unq(value) };
  });

  const stamp = nowLocalStamp();
  const worksheetName = "PriceIQ Breakdown";

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="sHeader">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:Bold="1"/>
      <Interior ss:Color="#EDEDED" ss:Pattern="Solid"/>
    </Style>

    <Style ss:ID="sLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:Bold="1"/>
    </Style>

    <Style ss:ID="sValueRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="sMeta">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:Italic="1"/>
    </Style>
  </Styles>

  <Worksheet ss:Name="${xmlEscape(worksheetName)}">
    <Table>
      <Column ss:AutoFitWidth="1" ss:Width="260"/>
      <Column ss:AutoFitWidth="1" ss:Width="420"/>

      <Row>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">label</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">value</Data></Cell>
      </Row>

      <Row>
        <Cell ss:StyleID="sMeta"><Data ss:Type="String">meta.exported_at_local</Data></Cell>
        <Cell ss:StyleID="sValueRight"><Data ss:Type="String">${xmlEscape(stamp)}</Data></Cell>
      </Row>

      ${pairs
        .filter((p) => String(p.label ?? "").trim() !== "meta.exported_at_local")
        .map((p) => {
          const label = xmlEscape(String(p.label ?? ""));
          const value = xmlEscape(String(p.value ?? ""));

          return `<Row>
        <Cell ss:StyleID="sLabel"><Data ss:Type="String">${label}</Data></Cell>
        <Cell ss:StyleID="sValueRight"><Data ss:Type="String">${value}</Data></Cell>
      </Row>`;
        })
        .join("\n")}
    </Table>
  </Worksheet>
</Workbook>`;
}

// -----------------------------
// ✅ PostHog helpers (low noise)
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

function buildCoreProps(csvRows: CsvKV) {
  const m = kvToMap(csvRows);

  const providerId = String(m["provider_id"] ?? "");
  const provider = String(m["provider"] ?? "");
  const product = String(m["product"] ?? "");
  const region = String(m["region"] ?? "");
  const mode = String(m["mode"] ?? "");
  const scenario = String(m["scenario"] ?? "");
  const tier = String(m["tier"] ?? "");
  const currency = String(m["currency_symbol"] ?? "");

  const fxPercent = Number(m["fx_percent"] ?? 0) || 0;
  const platformFeePercent = Number(m["platform_fee_percent"] ?? 0) || 0;
  const vatPercent = Number(m["vat_percent"] ?? 0) || 0;

  const feeOverridesOn =
    isTruthyOn(String(m["fee_overrides_on"] ?? "")) || !!(m["override_percent"] || m["override_fixed"]);
  const breakEvenOn = isTruthyOn(String(m["break_even_on"] ?? ""));
  const sensitivityOn = isTruthyOn(String(m["fee_impact_on"] ?? ""));
  const volumeOn = isTruthyOn(String(m["volume_on"] ?? ""));

  const volumeTxPerMonth = Number(m["volume_tx_per_month"] ?? 0) || 0;
  const volumeRefundRatePct = Number(m["volume_refund_rate_pct"] ?? 0) || 0;

  let volumeTiersCount: number | null = null;
  try {
    const arr = JSON.parse(String(m["volume_tiers_json"] ?? "[]"));
    volumeTiersCount = Array.isArray(arr) ? arr.length : null;
  } catch {
    volumeTiersCount = null;
  }

  return {
    app: String(m["app"] ?? "PriceIQ"),
    scenario,
    providerId,
    provider,
    product,
    region,
    mode,
    tier,
    currency,

    fxPercent,
    platformFeePercent,
    vatPercent,

    feeOverridesOn,
    breakEvenOn,
    sensitivityOn,
    volumeOn,

    volumeTxPerMonth,
    volumeRefundRatePct,
    volumeTiersCount,
  };
}

const EVENTS = {
  SHARE_COPY_LINK: "calc_share_copy_link",
  SHARE_COPY_BREAKDOWN: "calc_share_copy_breakdown",
  EXPORT_CSV: "calc_export_csv",
  EXPORT_EXCEL: "calc_export_excel",
} as const;

export function ActionsBar(props: { shareUrl: string; copyText: string; csvRows: CsvKV }) {
  const { shareUrl, copyText, csvRows } = props;

  const [copied, setCopied] = useState<CopiedKind>(null);
  const copiedTimerRef = useRef<number | null>(null);

  function clearCopiedTimer() {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }

  function flashCopied(kind: Exclude<CopiedKind, null>) {
    setCopied(kind);
    clearCopiedTimer();
    copiedTimerRef.current = window.setTimeout(() => setCopied(null), 1200);
  }

  useEffect(() => {
    return () => clearCopiedTimer();
  }, []);

  const coreProps = useMemo(() => buildCoreProps(csvRows), [csvRows]);

  async function copyToClipboard(text: string, kind: "link" | "breakdown") {
    const payload = String(text ?? "");
    const event = kind === "link" ? EVENTS.SHARE_COPY_LINK : EVENTS.SHARE_COPY_BREAKDOWN;

    safeCapture(event, {
      ...coreProps,
      stage: "attempt",
      method: "clipboard_api",
      text_len: payload.length,
    });

    try {
      await navigator.clipboard.writeText(payload);
      flashCopied(kind);

      safeCapture(event, {
        ...coreProps,
        stage: "success",
        method: "clipboard_api",
        success: true,
        text_len: payload.length,
      });

      return;
    } catch {}

    safeCapture(event, {
      ...coreProps,
      stage: "attempt",
      method: "execCommand",
      text_len: payload.length,
    });

    try {
      const ta = document.createElement("textarea");
      ta.value = payload;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (ok) {
        flashCopied(kind);
        safeCapture(event, {
          ...coreProps,
          stage: "success",
          method: "execCommand",
          success: true,
          text_len: payload.length,
        });
      } else {
        safeCapture(event, {
          ...coreProps,
          stage: "error",
          method: "execCommand",
          success: false,
          text_len: payload.length,
        });
      }
    } catch {
      safeCapture(event, {
        ...coreProps,
        stage: "error",
        method: "fallback_failed",
        success: false,
        text_len: payload.length,
      });
    }
  }

  const csvWithBom = useMemo(() => buildVerticalCsv(csvRows, shareUrl), [csvRows, shareUrl]);
  const xlsXml = useMemo(() => buildVerticalXls(csvRows, shareUrl), [csvRows, shareUrl]);

  function downloadCsv() {
    safeCapture(EVENTS.EXPORT_CSV, {
      ...coreProps,
      stage: "attempt",
      bytes: csvWithBom.length,
      format: "csv",
    });

    try {
      const stamp = nowLocalStamp();
      const filename = `PriceIQBreakdown_${stamp}.csv`;

      const blob = new Blob([csvWithBom], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
      flashCopied("csv");

      safeCapture(EVENTS.EXPORT_CSV, {
        ...coreProps,
        stage: "success",
        success: true,
        bytes: csvWithBom.length,
        format: "csv",
      });
    } catch {
      safeCapture(EVENTS.EXPORT_CSV, {
        ...coreProps,
        stage: "error",
        success: false,
        bytes: csvWithBom.length,
        format: "csv",
      });
    }
  }

  function downloadXls() {
    safeCapture(EVENTS.EXPORT_EXCEL, {
      ...coreProps,
      stage: "attempt",
      bytes: xlsXml.length,
      format: "xls",
    });

    try {
      const stamp = nowLocalStamp();
      const filename = `PriceIQBreakdown_${stamp}.xls`;

      const blob = new Blob([xlsXml], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
      flashCopied("xls");

      safeCapture(EVENTS.EXPORT_EXCEL, {
        ...coreProps,
        stage: "success",
        success: true,
        bytes: xlsXml.length,
        format: "xls",
      });
    } catch {
      safeCapture(EVENTS.EXPORT_EXCEL, {
        ...coreProps,
        stage: "error",
        success: false,
        bytes: xlsXml.length,
        format: "xls",
      });
    }
  }

  const baseBtnDesktop = "rounded-full border px-3 py-1.5 text-xs transition";
  const baseBtnMobile = "rounded-full border px-3 py-1 text-[11px] leading-none transition";

  const normalBtn = "border-white/10 bg-white/5 text-white/80 hover:bg-white/10";
  const successBtn =
    "border-emerald-400/40 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]";

  const btnClass = (kind: CopiedKind) =>
    [
      "md:" + baseBtnDesktop,
      baseBtnMobile,
      copied === kind ? successBtn : normalBtn,
      "whitespace-nowrap",
    ].join(" ");

  return (
    <div
      className={[
        "md:flex md:flex-wrap md:items-center md:gap-2",
        "flex items-center gap-2 overflow-x-auto md:overflow-visible",
        "flex-nowrap md:flex-wrap",
        "[-webkit-overflow-scrolling:touch]",
        "pb-0.5",
      ].join(" ")}
    >
      <button type="button" onClick={() => copyToClipboard(shareUrl, "link")} className={btnClass("link")}>
        <span className="md:inline hidden">{copied === "link" ? "✓ Copied" : "Copy link to reuse"}</span>
        {/* ✅ mobile label updated */}
        <span className="md:hidden inline">{copied === "link" ? "✓ Copied" : "Copy link"}</span>
      </button>

      <button
        type="button"
        onClick={() => copyToClipboard(copyText, "breakdown")}
        className={btnClass("breakdown")}
      >
        <span className="md:inline hidden">{copied === "breakdown" ? "✓ Breakdown copied" : "Copy breakdown"}</span>
        {/* ✅ mobile label updated */}
        <span className="md:hidden inline">{copied === "breakdown" ? "✓ Copied" : "Copy breakdown"}</span>
      </button>

      <button type="button" onClick={downloadCsv} className={btnClass("csv")}>
        <span className="md:inline hidden">{copied === "csv" ? "✓ Downloaded" : "Download CSV"}</span>
        <span className="md:hidden inline">{copied === "csv" ? "✓ CSV" : "CSV"}</span>
      </button>

      <button type="button" onClick={downloadXls} className={btnClass("xls")}>
        <span className="md:inline hidden">{copied === "xls" ? "✓ Downloaded" : "Download Excel"}</span>
        <span className="md:hidden inline">{copied === "xls" ? "✓ Excel" : "Excel"}</span>
      </button>
    </div>
  );
}
