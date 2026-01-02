// src/components/calculator/ResultsCard.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { MoneyRow } from "./MoneyRow";
import { InfoTip } from "@/components/ui/InfoTip";
import { BUILTIN_PRESETS, type PresetId } from "@/lib/presets"; // ✅ source of truth
import type { RoundingStep, VolumeTier } from "@/lib/calcState";

/** Gold hairline divider (same style used across cards) */
function GoldDivider() {
  return (
    <div className="my-7">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/25 to-transparent" />
      <div className="mt-[1px] h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    </div>
  );
}

type Region = "UK" | "EU" | "US";
type PlatformFeeBase = "gross" | "afterStripe";

// ✅ Tool typing is local
type SensitivityTarget = "all" | "stripe" | "fx" | "platform";

type BreakEvenResult = {
  targetNet: number;
  requiredCharge: number;
  denomOk: boolean;
};

type SensitivityResult = {
  deltaPct: number;
  target: SensitivityTarget;
  baseNet: number;
  netUp: number;
  netDown: number;
  // optional “stripe-only approximation”
  stripeNetUp?: number | null;
  stripeNetDown?: number | null;
};

function safePct(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return (n / d) * 100;
}
function isNonTrivial(n: number) {
  return Number.isFinite(n) && Math.abs(n) > 1e-9;
}
function normalizeTierName(label: string) {
  return (label || "").toLowerCase();
}
function pickPriceBand(gross: number) {
  if (!Number.isFinite(gross) || gross <= 0) return "unknown";
  if (gross < 5) return "micro";
  if (gross < 20) return "low";
  if (gross < 100) return "mid";
  if (gross < 500) return "high";
  return "enterprise";
}

type AdviceItem = {
  score: number;
  theme: string;
  title: string;
  body: string;
  badge?: string;
};

function ThemeBadge({ text }: { text: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-[0.20em]",
        "border-white/12 bg-white/5 text-white/60",
        "shadow-[0_8px_18px_rgba(0,0,0,0.45)]",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

function labelSensitivityTarget(t: SensitivityTarget, providerFeeLabel: string) {
  if (t === "all") return "All fees";
  if (t === "stripe") return `${providerFeeLabel} %`; // (kept key name for backward compatibility)
  if (t === "fx") return "FX %";
  return "Platform %";
}

/**
 * Optional UI hint:
 * if the selected fee is currently 0%, then a ±% drift won't move net.
 * We infer FX "off/zero" from fxPercent.
 */
function shouldShowZeroDriftHint(
  target: SensitivityTarget,
  fxPercent: number,
  platformFeePercent: number,
  providerFeeAmount: number
) {
  const fxIsZero = !Number.isFinite(fxPercent) || Math.abs(fxPercent) < 1e-9;
  const platformIsZero = !Number.isFinite(platformFeePercent) || Math.abs(platformFeePercent) < 1e-9;
  const providerIsZero = !Number.isFinite(providerFeeAmount) || Math.abs(providerFeeAmount) < 1e-9;

  if (target === "fx") return fxIsZero;
  if (target === "platform") return platformIsZero;
  if (target === "stripe") return providerIsZero;
  if (target === "all") return fxIsZero && platformIsZero && providerIsZero;
  return false;
}

function clampPct(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
function clampNonNeg(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

// ----------------------------
// ✅ Preset helpers (updated)
// ----------------------------
function getPresetMeta(presetId?: PresetId) {
  if (!presetId) return null;
  const p = (BUILTIN_PRESETS as any[]).find((x) => x?.id === presetId);
  if (!p) return null;
  return p as any;
}
function presetDisplayName(presetId?: PresetId) {
  const p = getPresetMeta(presetId);
  return (p?.name as string | undefined) ?? (presetId ? String(presetId) : "");
}

// ----------------------------
// ✅ Model-aware copy helpers
// ----------------------------
type ModelKind = "connect" | "cards" | "unknown";

/**
 * Future-proof:
 * - Doesn’t hardcode specific preset IDs
 * - Uses preset metadata when available (kind/tags/name/description)
 * - Falls back to provider/product label heuristics
 */
function inferModelKind(params: { presetId?: PresetId; providerLabel?: string; productLabel?: string }): ModelKind {
  const { presetId, providerLabel = "", productLabel = "" } = params;
  const preset = getPresetMeta(presetId);

  const kind = String(preset?.kind ?? preset?.context?.kind ?? "").toLowerCase();
  if (kind.includes("connect") || kind.includes("market") || kind.includes("platform")) return "connect";
  if (kind.includes("cards") || kind.includes("card") || kind.includes("ecom")) return "cards";

  const tags = Array.isArray(preset?.tags) ? (preset.tags as any[]).map((t) => String(t).toLowerCase()) : [];
  if (tags.some((t) => t.includes("connect") || t.includes("marketplace") || t.includes("platform"))) return "connect";
  if (tags.some((t) => t.includes("cards") || t.includes("card") || t.includes("ecommerce"))) return "cards";

  const nameDesc = `${preset?.name ?? ""} ${preset?.description ?? ""}`.toLowerCase();
  if (nameDesc.includes("connect") || nameDesc.includes("marketplace") || nameDesc.includes("platform")) return "connect";
  if (nameDesc.includes("cards") || nameDesc.includes("card") || nameDesc.includes("ecommerce")) return "cards";

  const s = `${providerLabel} ${productLabel}`.toLowerCase();

  if (
    s.includes("connect") ||
    s.includes("marketplace") ||
    s.includes("platform") ||
    s.includes("payout") ||
    s.includes("split") ||
    s.includes("routing") ||
    s.includes("managed") ||
    s.includes("sub-merchant")
  ) {
    return "connect";
  }

  if (
    s.includes("card") ||
    s.includes("cards") ||
    s.includes("ecommerce") ||
    s.includes("e-commerce") ||
    s.includes("payments") ||
    s.includes("acquiring") ||
    s.includes("processing")
  ) {
    return "cards";
  }

  return "unknown";
}

function modelHeadline(kind: ModelKind) {
  if (kind === "connect") return "Marketplace economics";
  if (kind === "cards") return "Simple ecommerce";
  return "Marketplace economics";
}

function modelHintBody(kind: ModelKind) {
  if (kind === "connect") {
    return "You’re modelling a marketplace/Connect-style flow. Your platform fee is your cut — sanity-check how it’s applied (from gross vs after provider fees) because it changes the economics.";
  }
  if (kind === "cards") {
    return "You’re modelling a straightforward “customer pays → you receive” flow. Keep FX at 0 unless conversion really happens, then focus on tier accuracy and pricing hygiene.";
  }
  return "You’re modelling a marketplace/Connect-style flow. Your platform fee is your cut — sanity-check how it’s applied (from gross vs after provider fees) because it changes the economics.";
}

function platformFeeBaseCopy(kind: ModelKind, base: PlatformFeeBase) {
  const baseName = base === "gross" ? "from gross" : "after provider fee";
  if (kind === "connect") {
    return base === "gross"
      ? `Marketplace note: platform fee ${baseName} tends to compound with provider fees. If your “take-rate” looks too much, consider charging after provider fees for a fairer marketplace split.`
      : `Marketplace note: platform fee ${baseName} usually matches “take-rate after payment costs” thinking. It reduces compounding and keeps your platform cut aligned with net economics.`;
  }
  if (kind === "cards") {
    return base === "gross"
      ? `Direct-sale note: platform fee ${baseName} is simplest and predictable. If you’re using a platform fee to model “your cut”, keep it here for clarity.`
      : `Direct-sale note: platform fee ${baseName} can be useful if you want the platform cut to ignore provider fees. It often reads as “platform cut after payment costs”.`;
  }
  return base === "gross"
    ? "Platform fee is applied from the customer price (gross). Simple and predictable."
    : "Platform fee is applied after the provider fee. Often feels fairer and reduces compounding.";
}

// ----------------------------
// ✅ Provider label helpers
// ----------------------------
function providerBrandFromLabel(label?: string) {
  const s = String(label ?? "").toLowerCase();
  if (s.includes("paypal")) return "PayPal";
  if (s.includes("adyen")) return "Adyen";
  if (s.includes("braintree")) return "Braintree";
  if (s.includes("square")) return "Square";
  if (s.includes("checkout") || s.includes("checkoutcom") || s.includes("checkout")) return "Checkout";
  if (s.includes("worldpay")) return "Worldpay";
  if (s.includes("stripe")) return "Stripe";
  return label?.trim() ? label.trim() : "Provider";
}

function isStripeProvider(providerLabel?: string) {
  return providerBrandFromLabel(providerLabel) === "Stripe";
}

function providerFeeLabel(providerLabel?: string, _productLabel?: string) {
  const brand = providerBrandFromLabel(providerLabel);
  return `${brand} fee`;
}

function providerSensitivityLabel(providerLabel?: string) {
  return providerBrandFromLabel(providerLabel || "Provider");
}

// ----------------------------------------------------------------------------
// ✅ Volume projections (computed locally in ResultsCard)
// ----------------------------------------------------------------------------
type VolumeProjection = {
  on: boolean;
  txPerMonth: number;
  refundRatePct: number;

  // derived stats (monthly)
  grossMonthly: number;
  providerFeesMonthly: number;
  fxFeesMonthly: number;
  platformFeesMonthly: number;
  netMonthly: number;

  // VAT (monthly) — extracted from gross when VAT is enabled (VAT-inclusive assumption)
  vatPct: number;
  vatMonthly: number;
  grossExVatMonthly: number;

  // refund impact (simple expected-value model)
  refundLossMonthly: number;
  netAfterRefundsMonthly: number;

  // optional post-tax view
  netAfterVatMonthly: number;
  netAfterRefundsAfterVatMonthly: number;

  // blended context
  blendedTicket: number;
  blendedFxPct: number;
  tiersCount: number;
};

function computeVolumeProjection(params: {
  symbol: string; // not used in calc, but helpful if you later extend
  platformFeePercent: number;
  platformFeeBase: PlatformFeeBase;

  // provider fee model inputs (best-effort)
  providerPct: number; // percent component
  providerFixed: number; // fixed component

  // VAT inputs (assume customer price includes VAT if enabled)
  vatPercent: number;

  // inputs
  volumeOn: boolean;
  volumeTxPerMonth: number;
  volumeRefundRatePct: number;
  volumeTiers: VolumeTier[];
}): VolumeProjection {
  const {
    platformFeePercent,
    platformFeeBase,
    providerPct,
    providerFixed,
    vatPercent,
    volumeOn,
    volumeTxPerMonth,
    volumeRefundRatePct,
    volumeTiers,
  } = params;

  const on = Boolean(volumeOn);
  const txPerMonth = clampNonNeg(Number(volumeTxPerMonth ?? 0));
  const refundRatePct = clampPct(Number(volumeRefundRatePct ?? 0));
  const vatPct = clampPct(Number(vatPercent ?? 0));

  const tiers0 = Array.isArray(volumeTiers) ? volumeTiers.filter(Boolean) : [];
  const activeTiers = tiers0.filter((t) => clampPct(Number((t as any)?.sharePct ?? 0)) > 0);

  const tiers =
    activeTiers.length > 0
      ? activeTiers
      : ([{ id: "t1", sharePct: 100, price: 0, fxPercent: 0 }] as VolumeTier[]);

  const tiersCount = tiers.length;

  // blended ticket + blended fx (weighted)
  const totalShare = tiers.reduce((a, t) => a + clampPct(Number((t as any)?.sharePct ?? 0)), 0) || 0.000001;
  const blendedTicket = tiers.reduce((a, t) => {
    const w = clampPct(Number((t as any)?.sharePct ?? 0)) / totalShare;
    return a + w * clampNonNeg(Number((t as any)?.price ?? 0));
  }, 0);
  const blendedFxPct = tiers.reduce((a, t) => {
    const w = clampPct(Number((t as any)?.sharePct ?? 0)) / totalShare;
    return a + w * clampPct(Number((t as any)?.fxPercent ?? 0));
  }, 0);

  let grossMonthly = 0;
  let providerFeesMonthly = 0;
  let fxFeesMonthly = 0;
  let platformFeesMonthly = 0;
  let netMonthly = 0;

  for (const t of tiers) {
    const sharePct = clampPct(Number((t as any)?.sharePct ?? 0));
    const price = clampNonNeg(Number((t as any)?.price ?? (t as any)?.avgTicket ?? 0));
    const fxPct = clampPct(Number((t as any)?.fxPercent ?? 0));

    const tierTx = txPerMonth * (sharePct / 100);
    const tierGross = tierTx * price;

    // per-tx fee model (simple but consistent with base controls)
    const providerFeePerTx = price * (clampPct(providerPct) / 100) + clampNonNeg(providerFixed);
    const fxFeePerTx = price * (fxPct / 100);

    const platformBasePerTx = platformFeeBase === "gross" ? price : Math.max(0, price - providerFeePerTx);
    const platformFeePerTx = platformBasePerTx * (clampPct(platformFeePercent) / 100);

    const tierProvider = tierTx * providerFeePerTx;
    const tierFx = tierTx * fxFeePerTx;
    const tierPlatform = tierTx * platformFeePerTx;

    const tierNet = tierGross - tierProvider - tierFx - tierPlatform;

    grossMonthly += tierGross;
    providerFeesMonthly += tierProvider;
    fxFeesMonthly += tierFx;
    platformFeesMonthly += tierPlatform;
    netMonthly += tierNet;
  }

  // Refund model (simple expected-value):
  // - assume refunded transactions reverse the net contribution (incl. fees),
  // - so expected loss ≈ refundRate * netMonthly
  const refundLossMonthly = netMonthly * (refundRatePct / 100);
  const netAfterRefundsMonthly = netMonthly - refundLossMonthly;

  // VAT model:
  // - We assume customer price INCLUDES VAT (VAT is embedded within gross):
  //   vat = gross * vatPct / (100 + vatPct)
  const vatMonthly = vatPct > 0 && grossMonthly > 0 ? (grossMonthly * vatPct) / (100 + vatPct) : 0;

  const grossExVatMonthly = Math.max(0, grossMonthly - vatMonthly);

  // Post-tax view (VAT is not a “fee” — subtract it at the end for clarity)
  const netAfterVatMonthly = netMonthly - vatMonthly;
  const netAfterRefundsAfterVatMonthly = netAfterRefundsMonthly - vatMonthly;

  return {
    on,
    txPerMonth,
    refundRatePct,
    grossMonthly,
    providerFeesMonthly,
    fxFeesMonthly,
    platformFeesMonthly,
    netMonthly,
    vatPct,
    vatMonthly,
    grossExVatMonthly,
    refundLossMonthly,
    netAfterRefundsMonthly,
    netAfterVatMonthly,
    netAfterRefundsAfterVatMonthly,
    blendedTicket,
    blendedFxPct,
    tiersCount,
  };
}

export function ResultsCard(props: {
  useReverse: boolean;

  symbol: string;
  gross: number;

  // NOTE: still named stripeFee for backwards compatibility with Calculator,
  // but we render it as provider fee based on providerLabel/customProviderLabel.
  stripeFee: number;
  fxFee: number;
  platformFee: number;

  net: number;
  denomOk: boolean;

  totalPct: number;
  fxDominates: boolean;
  nearLimit: boolean;

  presetId?: PresetId;
  region?: Region;
  pricingTierLabel?: string;
  platformFeeBase?: PlatformFeeBase;
  roundingStep?: RoundingStep | number;
  fxPercent?: number;
  platformFeePercent?: number;

  providerLabel?: string;
  productLabel?: string;

  // ✅ NEW: custom label passed from Calculator (fixes your TS error)
  customProviderLabel?: string;

  marginTargetPct?: number;
  marginOn?: boolean;

  vatPercent?: number;
  vatAmount?: number;
  netAfterVat?: number;

  breakEven?: BreakEvenResult | null;
  sensitivity?: SensitivityResult | null;

  // ✅ NEW: override signals (display-only)
  customProviderFeePercent?: number | null;
  customFixedFee?: number | null;

  // ✅ NEW: volume projections inputs (display + compute)
  volumeOn?: boolean;
  volumeTxPerMonth?: number;
  volumeRefundRatePct?: number;
  volumeTiers?: VolumeTier[];
}) {
  const {
    useReverse,
    symbol,
    gross,
    stripeFee,
    fxFee,
    platformFee,
    net,
    denomOk,
    totalPct,
    fxDominates,
    nearLimit,

    presetId,
    region = "UK",
    pricingTierLabel = "",
    platformFeeBase = "gross",
    roundingStep = 0.01,
    fxPercent = 0,
    platformFeePercent = 0,

    providerLabel = "",
    productLabel = "",

    // ✅ fix: accept customProviderLabel from Calculator
    customProviderLabel = "",

    marginTargetPct = 0,
    marginOn = false,

    vatPercent = 0,
    vatAmount = 0,
    netAfterVat = net,

    breakEven = null,
    sensitivity = null,

    customProviderFeePercent = null,
    customFixedFee = null,

    // ✅ volume
    volumeOn = false,
    volumeTxPerMonth = 0,
    volumeRefundRatePct = 0,
    volumeTiers = [],
  } = props;

  // ✅ effective provider label (custom overrides providerLabel if present)
  const effectiveProviderLabel = useMemo(() => {
    const c = String(customProviderLabel ?? "").trim();
    if (c) return c;
    const p = String(providerLabel ?? "").trim();
    return p;
  }, [customProviderLabel, providerLabel]);

  const modelKind = useMemo(
    () => inferModelKind({ presetId, providerLabel: effectiveProviderLabel, productLabel }),
    [presetId, effectiveProviderLabel, productLabel]
  );

  const providerFeeRowLabel = useMemo(
    () => providerFeeLabel(effectiveProviderLabel, productLabel),
    [effectiveProviderLabel, productLabel]
  );

  const providerPctLabel = useMemo(
    () => providerSensitivityLabel(effectiveProviderLabel),
    [effectiveProviderLabel]
  );

  const cardRef = useRef<HTMLElement | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const vatOn = useMemo(() => clampPct(Number(vatPercent ?? 0)) > 0, [vatPercent]);

  const subtitle = useMemo(() => {
    if (useReverse && marginOn)
      return "This shows the customer price required to achieve your target outcome with your chosen provider, accounting for all applied fees.";

    if (useReverse)
      return "This shows the customer price required to reach your target net outcome after fees with your chosen provider.";

    return "Understand analysis, cost dynamics and profitability.";
  }, [useReverse, marginOn]);

  const hasTools = Boolean(breakEven) || Boolean(sensitivity) || Boolean(volumeOn);

  const feeTotal = useMemo(() => {
    const s = Number.isFinite(stripeFee) ? stripeFee : 0;
    const f = Number.isFinite(fxFee) ? fxFee : 0;
    const p = Number.isFinite(platformFee) ? platformFee : 0;
    return s + f + p;
  }, [stripeFee, fxFee, platformFee]);

  const showZeroDriftHint = useMemo(() => {
    if (!sensitivity) return false;
    return shouldShowZeroDriftHint(sensitivity.target, fxPercent, platformFeePercent, stripeFee);
  }, [sensitivity, fxPercent, platformFeePercent, stripeFee]);

  const totalDeductions = useMemo(() => {
    const s = Number.isFinite(stripeFee) ? stripeFee : 0;
    const f = Number.isFinite(fxFee) ? fxFee : 0;
    const p = Number.isFinite(platformFee) ? platformFee : 0;
    return s + f + p;
  }, [stripeFee, fxFee, platformFee]);

  const marginSummary = useMemo(() => {
    const grossSafe = Number.isFinite(gross) ? gross : 0;
    const netSafe = Number.isFinite(net) ? net : 0;

    const actual = clampPct(safePct(netSafe, grossSafe));
    const target = clampPct(marginTargetPct);

    const delta = actual - target;
    const ok = grossSafe > 0 && denomOk && target > 0 && delta >= -1e-6;

    const badge =
      !denomOk ? "Invalid" : grossSafe <= 0 ? "—" : target <= 0 ? "No goal" : ok ? "On target" : "Below target";

    return { actual, target, delta, ok, badge, grossSafe };
  }, [gross, net, marginTargetPct, denomOk]);

  const showMarginBlock = useMemo(() => {
    if (!denomOk) return false;
    if (!Number.isFinite(gross) || gross <= 0) return false;
    return clampPct(marginTargetPct) > 0 || (useReverse && marginOn);
  }, [denomOk, gross, marginTargetPct, useReverse, marginOn]);

  const requiredPriceLabel = useMemo(() => {
    if (!useReverse) return "Customer price";
    return marginOn ? "Required customer price (from margin goal)" : "Required customer price (from target net)";
  }, [useReverse, marginOn]);

  const vatBlock = useMemo(() => {
    const vP = clampPct(Number(vatPercent ?? 0));
    const vAmt = Number.isFinite(vatAmount) ? vatAmount : 0;
    const nAfter = Number.isFinite(netAfterVat) ? netAfterVat : Number.isFinite(net) ? net : 0;
    return { vP, vAmt, nAfter };
  }, [vatPercent, vatAmount, netAfterVat, net]);

  const modelContextHint = useMemo(() => {
    const hasSignal = Boolean(presetId) || Boolean(effectiveProviderLabel) || Boolean(productLabel);
    if (!hasSignal) return null;
    return { title: modelHeadline(modelKind), body: modelHintBody(modelKind) };
  }, [modelKind, presetId, effectiveProviderLabel, productLabel]);

  // ✅ NEW: override status (display-only)
  const overrides = useMemo(() => {
    const pct = customProviderFeePercent == null ? null : clampPct(Number(customProviderFeePercent));
    const fixed =
      customFixedFee == null ? null : Number.isFinite(Number(customFixedFee)) ? Number(customFixedFee) : null;

    const pctOn = pct != null && pct > 0;
    const fixedOn = fixed != null && Math.abs(fixed) > 1e-9;

    const any = pctOn || fixedOn;

    return { any, pct, fixed, pctOn, fixedOn };
  }, [customProviderFeePercent, customFixedFee]);

  // ✅ NEW: volume projections (computed)
  const volume = useMemo(() => {
    // Provider fee model (best effort):
    // - If override % exists, use it.
    // - Else infer percent from current scenario: stripeFee/gross (ignores fixed fee).
    const grossSafe = Number.isFinite(gross) && gross > 0 ? gross : 0;
    const inferredProviderPct = grossSafe > 0 ? clampPct((stripeFee / grossSafe) * 100) : 0;

    const providerPct = overrides.pct != null ? clampPct(overrides.pct) : inferredProviderPct;
    const providerFixed = overrides.fixed != null ? clampNonNeg(overrides.fixed) : 0;

    return computeVolumeProjection({
      symbol,
      platformFeePercent: clampPct(Number(platformFeePercent ?? 0)),
      platformFeeBase,
      providerPct,
      providerFixed,
      vatPercent: clampPct(Number(vatPercent ?? 0)),
      volumeOn: Boolean(volumeOn),
      volumeTxPerMonth: Number(volumeTxPerMonth ?? 0),
      volumeRefundRatePct: Number(volumeRefundRatePct ?? 0),
      volumeTiers: (volumeTiers ?? []) as VolumeTier[],
    });
  }, [
    symbol,
    gross,
    stripeFee,
    platformFeePercent,
    platformFeeBase,
    vatPercent,
    volumeOn,
    volumeTxPerMonth,
    volumeRefundRatePct,
    volumeTiers,
    overrides.pct,
    overrides.fixed,
  ]);

  const showVolume = useMemo(() => {
    if (!volume.on) return false;
    if (!Number.isFinite(volume.txPerMonth) || volume.txPerMonth <= 0) return false;
    return true;
  }, [volume.on, volume.txPerMonth]);

  const adviceItems = useMemo<AdviceItem[]>(() => {
    const items: AdviceItem[] = [];

    const grossSafe = Number.isFinite(gross) ? gross : 0;
    const netSafe = Number.isFinite(net) ? net : 0;

    const priceBand = pickPriceBand(grossSafe);
    const tierName = normalizeTierName(pricingTierLabel);

    const providerShare = safePct(stripeFee, feeTotal);
    const fxShare = safePct(fxFee, feeTotal);
    const platformShare = safePct(platformFee, feeTotal);

    const netMargin = safePct(netSafe, grossSafe);
    const totalPctSafe = Number.isFinite(totalPct) ? totalPct : safePct(feeTotal, grossSafe);

    const dominant =
      feeTotal > 0
        ? providerShare >= fxShare && providerShare >= platformShare
          ? "provider"
          : fxShare >= providerShare && fxShare >= platformShare
          ? "fx"
          : "platform"
        : "none";

    if (!denomOk) {
      items.push({
        score: 1000,
        theme: "risk",
        title: "Invalid configuration",
        badge: "Fix first",
        body:
          "Combined percentage fees exceed 100%, so the maths can’t produce a meaningful result. Reduce FX fee % and/or Platform fee % until the total is below 100%.",
      });
    }

    if (modelContextHint && denomOk) {
      items.push({
        score: 130,
        theme: "economics",
        title: modelContextHint.title,
        badge: "Context",
        body: modelContextHint.body,
      });
    }

    // ✅ overrides context
    if (overrides.any) {
      const parts: string[] = [];
      if (overrides.pctOn && overrides.pct != null) parts.push(`${overrides.pct.toFixed(2)}%`);
      if (overrides.fixedOn && overrides.fixed != null) parts.push(`${symbol}${overrides.fixed.toFixed(2)}`);

      items.push({
        score: 125,
        theme: "overrides",
        badge: "Overrides",
        title: "Provider fee overrides are active",
        body: `You’ve overridden the provider pricing (${parts.join(
          " + "
        )}). This scenario will no longer match public rate cards unless those overrides reflect your real contract.`,
      });
    }

    if (presetId) {
      const name = presetDisplayName(presetId);
      items.push({
        score: 120,
        theme: "preset",
        title: `Preset: ${name}`,
        body: "This scenario starts from a preset bundle. Review the breakdown below to see the dominant deduction, then tune that setting first.",
      });
    } else {
      items.push({
        score: 30,
        theme: "preset",
        title: "Manual setup",
        body: "You’re modelling a custom scenario — use the deductions below to spot the main driver, then tune that setting first.",
      });
    }

    if (useReverse) {
      items.push({
        score: 80,
        theme: "mode",
        title: marginOn ? "Mode: Reverse (Goal mode ON)" : "Mode: Reverse",
        badge: marginOn ? "Goal mode" : undefined,
        body: marginOn
          ? "You’re solving for a customer price that hits your net margin goal. The biggest levers are Platform fee % and FX %."
          : "To reduce the required customer price, the highest impact settings are usually Platform fee % and FX fee % — adjust those before rounding.",
      });
    } else {
      items.push({
        score: 70,
        theme: "mode",
        title: "Mode: Forward",
        body: `Pick a customer price, then focus on the dominant deduction (${providerPctLabel} vs FX vs Platform) to improve margin.`,
      });
    }

    if (clampPct(Number(vatPercent ?? 0)) > 0) {
      items.push({
        score: 75,
        theme: "vat",
        badge: "Tax",
        title: `VAT is enabled (${clampPct(Number(vatPercent ?? 0)).toFixed(0)}%)`,
        body: "VAT is shown separately from fees. Your main net figure is before VAT; use “Net after VAT” if you want the post-tax view.",
      });
    }

    const target = clampPct(marginTargetPct);
    const actual = clampPct(netMargin);
    if (denomOk && grossSafe > 0 && target > 0) {
      if (actual + 1e-6 >= target) {
        items.push({
          score: 120,
          theme: "marginGoal",
          badge: "On target",
          title: `Margin goal met (${actual.toFixed(0)}% ≥ ${target.toFixed(0)}%)`,
          body: "You’re meeting the goal at this price. If you change FX/platform, re-check the goal before committing.",
        });
      } else {
        items.push({
          score: 140,
          theme: "marginGoal",
          badge: "Below target",
          title: `Margin below goal (${actual.toFixed(0)}% < ${target.toFixed(0)}%)`,
          body:
            "To reach your goal: reduce the dominant fee (often FX/platform) or raise the customer price. Rounding tweaks are usually a smaller lever.",
        });
      }
    }

    if (region === "UK") {
      items.push({
        score: 35,
        theme: "region",
        title: "Region: UK",
        body: "If most customers are local, keep FX at 0% and only add it when conversion truly happens.",
      });
    } else if (region === "EU") {
      items.push({
        score: 35,
        theme: "region",
        title: "Region: EU",
        body: "Watch mixed-currency traffic — FX creep often comes from card origin vs settlement currency differences.",
      });
    } else if (region === "US") {
      items.push({
        score: 35,
        theme: "region",
        title: "Region: US",
        body: "For high volume, tiny fee changes compound — validate the model that matches your dominant card mix.",
      });
    }

    // Stripe tier advice only if provider is Stripe AND overrides not active
    if (isStripeProvider(effectiveProviderLabel) && !overrides.any) {
      if (tierName.includes("international") || tierName.includes("cross") || tierName.includes("non")) {
        items.push({
          score: 55,
          theme: "tier",
          title: "Pricing tier: International-heavy",
          body: "Consider separate international pricing (or local currency pricing) so domestic customers don’t subsidise cross-border costs.",
        });
      } else if (tierName.includes("standard") || tierName.includes("domestic") || tierName.includes("uk")) {
        items.push({
          score: 45,
          theme: "tier",
          title: "Pricing tier: Domestic/standard",
          body: `Good for stable margins — if your real ${providerPctLabel} fees are higher, switch tier until the model matches reality.`,
        });
      } else if (pricingTierLabel.trim()) {
        items.push({
          score: 40,
          theme: "tier",
          title: "Pricing tier",
          body: "Ensure this matches your real customer mix — the wrong tier is a common source of quiet mispricing.",
        });
      }
    }

    if (priceBand === "micro") {
      items.push({
        score: 80,
        theme: "price",
        title: "Price level: Micro",
        body: "Fixed costs bite hardest — consider bundling, a minimum basket size, or pricing changes to avoid tiny-ticket margin collapse.",
      });
    } else if (priceBand === "low") {
      items.push({
        score: 55,
        theme: "price",
        title: "Price level: Low",
        body: "Rounding moves net meaningfully — choose a rounding step that fits how customers compare prices.",
      });
    } else if (priceBand === "enterprise") {
      items.push({
        score: 55,
        theme: "price",
        title: "Price level: High-ticket",
        body: "Prioritise fee stability — validate FX assumptions carefully because small % shifts become material.",
      });
    }

    if (!isNonTrivial(fxPercent)) {
      items.push({
        score: 40,
        theme: "fx",
        title: "FX fee %: 0%",
        body: "Ideal when you settle in the same currency — keep at 0 unless conversion really happens.",
      });
    } else if (fxPercent > 0 && fxPercent <= 1) {
      items.push({
        score: 45,
        theme: "fx",
        title: "FX fee %: Low",
        body: "Feels like occasional conversion — consider multi-currency pricing if international traffic grows.",
      });
    } else if (fxPercent > 1 && fxPercent <= 2.5) {
      items.push({
        score: 55,
        theme: "fx",
        title: "FX fee %: Moderate",
        body: "If FX is frequent, reduce exposure via settlement currency alignment or local currency pricing.",
      });
    } else if (fxPercent > 2.5) {
      items.push({
        score: 70,
        theme: "fx",
        title: "FX fee %: High",
        body: "Can dominate margin — try reducing conversion before raising price.",
      });
    }

    if (!isNonTrivial(platformFeePercent)) {
      items.push({
        score: 35,
        theme: "platform",
        title: "Platform fee %: 0%",
        body: "Great for direct sales — if you add a marketplace cut later, test sensitivity at +2%, +5%, +10%.",
      });
    } else if (platformFeePercent > 0 && platformFeePercent <= 3) {
      items.push({
        score: 45,
        theme: "platform",
        title: "Platform fee %: Light",
        body: "Usually sustainable — focus on preventing FX creep and keeping the model realistic.",
      });
    } else if (platformFeePercent > 3 && platformFeePercent <= 10) {
      items.push({
        score: 55,
        theme: "platform",
        title: "Platform fee %: Material",
        body: "Ensure your value prop supports it — consider tiered fees or volume incentives to protect conversion.",
      });
    } else if (platformFeePercent > 10) {
      items.push({
        score: 70,
        theme: "platform",
        title: "Platform fee %: Heavy",
        body: "Risks pushing total fees toward break-even — test whether the goal is still realistic at this fee level.",
      });
    }

    items.push({
      score: 60,
      theme: "basis",
      title: platformFeeBase === "gross" ? "Fee basis: From gross" : "Fee basis: After provider fee",
      body: platformFeeBaseCopy(modelKind, platformFeeBase),
    });

    const step = Number(roundingStep);
    if (step === 0.01) {
      items.push({
        score: 40,
        theme: "rounding",
        title: "Rounding: 0.01",
        body: "Most precise — great for invoices/B2B. For consumer pricing, try 0.05/0.10 for cleaner price points.",
      });
    } else if (step === 0.05) {
      items.push({
        score: 40,
        theme: "rounding",
        title: "Rounding: 0.05",
        body: "Nice balance — smoother price points without drifting too far from your target net.",
      });
    } else if (step === 0.1) {
      items.push({
        score: 40,
        theme: "rounding",
        title: "Rounding: 0.10",
        body: "Strong psychological pricing — but can move net on low prices. Re-check net after rounding for micro transactions.",
      });
    } else {
      items.push({
        score: 30,
        theme: "rounding",
        title: "Rounding",
        body: "Use smaller steps for accuracy and larger steps for “price feel”.",
      });
    }

    if (denomOk && feeTotal > 0) {
      if (dominant === "fx" && fxFee > 0) {
        items.push({
          score: 95,
          theme: "dominance",
          badge: "Highest impact",
          title: `Dominant deduction: FX (~${fxShare.toFixed(0)}% of fees)`,
          body: "If conversion is frequent, the fastest win is reducing FX exposure (settlement alignment or local pricing).",
        });
      } else if (dominant === "platform" && platformFee > 0) {
        items.push({
          score: 90,
          theme: "dominance",
          badge: "Highest impact",
          title: `Dominant deduction: Platform (~${platformShare.toFixed(0)}% of fees)`,
          body: "Consider tiered platform fees or a lower % on high-ticket items to protect conversion.",
        });
      } else if (dominant === "provider" && stripeFee > 0) {
        items.push({
          score: 85,
          theme: "dominance",
          badge: "Highest impact",
          title: `Dominant deduction: ${providerPctLabel} (~${providerShare.toFixed(0)}% of fees)`,
          body: isStripeProvider(effectiveProviderLabel)
            ? "Validate the pricing tier — matching your real customer mix is usually the cleanest correction."
            : "Validate the provider model assumptions — matching your real blend (cards, regions, settlement) is usually the cleanest correction.",
        });
      }
    }

    if (denomOk && totalPctSafe >= 90) {
      items.push({
        score: 200,
        theme: "risk2",
        badge: "High risk",
        title: "Break-even zone",
        body: "Combined fees are so high that small changes can wipe out net. Reduce FX/platform or increase price immediately.",
      });
    } else if (denomOk && nearLimit) {
      items.push({
        score: 110,
        theme: "sensitivity",
        badge: "Sensitive",
        title: "High-fee impact",
        body: "Treat this like a pricing knife-edge. Test a ±1% change on FX or platform to see the net swing.",
      });
    }

    if (denomOk && fxDominates) {
      items.push({
        score: 160,
        theme: "dominance2",
        badge: "Highest impact",
        title: "FX is dominating",
        body: "Your FX cost is the biggest driver. If you can prevent currency conversion in your flow, net improves fastest.",
      });
    }

    const sorted = items.filter((x) => x.title.trim() && x.body.trim()).sort((a, b) => b.score - a.score);

    const chosen: AdviceItem[] = [];
    const usedThemes = new Set<string>();
    for (const it of sorted) {
      if (usedThemes.has(it.theme)) continue;
      chosen.push(it);
      usedThemes.add(it.theme);
      if (chosen.length >= 5) break;
    }

    if (chosen.length === 0) {
      chosen.push({
        score: 1,
        theme: "default",
        title: "Tip",
        body: useReverse
          ? marginOn
            ? "With Goal mode on, tweak platform/FX first — they usually move the required customer price the most."
            : "In Reverse mode, adjust platform/FX first — they usually move the required customer price the most."
          : "In Forward mode, compare deductions to find the biggest driver, then tune that setting first.",
      });
    }

    return chosen;
  }, [
    denomOk,
    totalPct,
    nearLimit,
    fxDominates,
    useReverse,
    marginOn,
    presetId,
    region,
    pricingTierLabel,
    platformFeeBase,
    roundingStep,
    fxPercent,
    platformFeePercent,
    marginTargetPct,
    gross,
    stripeFee,
    fxFee,
    platformFee,
    net,
    feeTotal,
    vatPercent,
    effectiveProviderLabel,
    productLabel,
    modelKind,
    modelContextHint,
    providerPctLabel,
    overrides.any,
    overrides.pct,
    overrides.fixed,
    overrides.pctOn,
    overrides.fixedOn,
    symbol,
  ]);

  // ----------------------------------------------------------------------------
  // ✅ Volume panel (rendered under Advanced tools > Fee impact)
  // ----------------------------------------------------------------------------
  const VolumePanel = () => {
    if (!showVolume) return null;

    const showOverridesWarning = overrides.any; // we only reliably model fixed fee when override provided
    const showVat = volume.vatPct > 0 && volume.vatMonthly > 0;

    return (
      <div className="w-full rounded-2xl border border-white/14 bg-black/18 p-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
            Volume projections
          </div>

          <InfoTip
            containerRef={cardRef}
            text={
              <>
                <strong>Volume projections</strong> estimate your <em>expected monthly outcome</em> based on your
                transaction mix and pricing assumptions.
                {"\n\n"}
                <strong>How values are calculated:</strong>
                {"\n"}• <strong>Transactions / month</strong> — total number of payments processed in a month.
                {"\n"}• <strong>Blended ticket</strong> — weighted average transaction value across all tiers (price ×
                share %). Please note: calculations are already done per-tier, not on the blended ticket; the blended
                ticket is only a display/summary value, not the basis of the maths.
                {"\n"}• <strong>Blended FX</strong> — weighted average FX rate across tiers (FX % × share %). Please note:
                calculations are already done per-tier, not on the blended FX; the blended FX is only a display/summary
                value, not the basis of the maths.
                {"\n"}• <strong>Monthly gross</strong> — total customer spend before any deductions.
                {"\n"}• <strong>Provider fee</strong> — calculated using your provider model (percentage + fixed fee if
                overridden).
                {"\n"}• <strong>FX fee</strong> — applied per transaction using each tier’s FX %.
                {"\n"}• <strong>Platform fee</strong> — applied according to your selected fee basis (gross or after
                provider fee).
                {"\n"}• <strong>Monthly net (before refunds)</strong> — amount you retain after all fees.
                {"\n"}• <strong>Refund loss</strong> — expected reduction based on refund rate (net × refund %).
                {"\n"}• <strong>Monthly net (after refunds)</strong> — expected retained revenue after refunds.
                {"\n"}• <strong>VAT</strong> — if enabled, VAT is extracted from the customer price (VAT-inclusive
                assumption) and shown separately.
                {"\n"}• <strong>Monthly net (after VAT)</strong> — revenue after VAT deduction.
                {"\n\n"}
                <strong>Important notes:</strong>
                {"\n"}• VAT is <em>not</em> treated as a fee — it is shown separately for tax reporting clarity.
                {"\n"}• Provider fixed fees are only included if overrides are enabled.
                {"\n"}• All values are expected averages, not exact settlements.
                {"\n\n"}Tip: For contract-accurate modelling, enable provider overrides and match your real pricing terms.
              </>
            }
          />
        </div>

        <div className="mt-2 text-[12px] text-white/65">
          {Math.round(volume.txPerMonth).toLocaleString()} tx / month •{" "}
          <span className="text-white/60">
            {volume.tiersCount} tier{volume.tiersCount === 1 ? "" : "s"} • Blended ticket{" "}
          </span>
          <span className="font-semibold text-white/85">
            {symbol}
            {volume.blendedTicket.toFixed(2)}
          </span>
          <span className="text-white/60"> • Blended FX </span>
          <span className="font-semibold text-white/85">{volume.blendedFxPct.toFixed(2)}%</span>
          {volume.vatPct > 0 ? (
            <>
              <span className="text-white/60"> • VAT </span>
              <span className="font-semibold text-white/85">{volume.vatPct.toFixed(0)}%</span>
            </>
          ) : null}
        </div>

        {showOverridesWarning ? (
          <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-[11px] text-white/70">
            <span className="font-semibold text-amber-200/85">Note:</span> provider overrides are active, so fixed-fee
            projection is included. If overrides are off, fixed fees may be under-estimated.
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <MoneyRow label="Monthly gross" symbol={symbol} value={volume.grossMonthly} kind="charge" />

          {showVat ? (
            <>
              <MoneyRow label="– VAT (monthly)" symbol={symbol} value={volume.vatMonthly} kind="fee" />
              <MoneyRow label="Monthly gross (ex VAT)" symbol={symbol} value={volume.grossExVatMonthly} kind="charge" />
            </>
          ) : null}

          <MoneyRow label={`${providerFeeRowLabel} (monthly)`} symbol={symbol} value={volume.providerFeesMonthly} kind="fee" />
          <MoneyRow label="FX (monthly)" symbol={symbol} value={volume.fxFeesMonthly} kind="fee" />
          <MoneyRow label="Platform (monthly)" symbol={symbol} value={volume.platformFeesMonthly} kind="fee" />

          <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />

          <MoneyRow label="Monthly net (before refunds)" symbol={symbol} value={volume.netMonthly} kind="net" big />

          {volume.refundRatePct > 0 ? (
            <>
              <MoneyRow
                label={`Expected refund loss (${volume.refundRatePct.toFixed(2)}%)`}
                symbol={symbol}
                value={volume.refundLossMonthly}
                kind="fee"
              />
              <MoneyRow
                label="Monthly net (after refunds)"
                symbol={symbol}
                value={volume.netAfterRefundsMonthly}
                kind="net"
                big
              />
            </>
          ) : (
            <div className="mt-1 text-[11px] text-white/55">Refund rate: Off</div>
          )}

          {showVat ? (
            <>
              <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />

              <MoneyRow label="Monthly net (after VAT)" symbol={symbol} value={volume.netAfterVatMonthly} kind="net" big />

              {volume.refundRatePct > 0 ? (
                <MoneyRow
                  label="Monthly net (after refunds & VAT)"
                  symbol={symbol}
                  value={volume.netAfterRefundsAfterVatMonthly}
                  kind="net"
                  big
                />
              ) : null}

              <div className="mt-1 text-[11px] text-white/55">VAT is shown separately (VAT-inclusive assumption).</div>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section
      ref={(el) => {
        cardRef.current = el;
      }}
      className={[
        "relative overflow-hidden rounded-3xl p-6 md:p-7",
        "border-[3px] border-white/55",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.18),_0_30px_110px_rgba(0,0,0,0.78)]",
        "bg-gradient-to-b from-[rgba(22,20,16,0.82)] to-[rgba(0,0,0,0.70)]",
      ].join(" ")}
    >
      {/* EVEN gold distribution across the entire card */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_900px_at_50%_45%,rgba(255,227,160,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_50%_60%,rgba(212,175,55,0.09),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_220px_at_14%_0%,rgba(255,227,160,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,227,160,0.06),transparent_45%,rgba(212,175,55,0.06))]" />
      </div>

      {/* Header */}
      <div className="relative mb-10 flex justify-center text-center">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/35 bg-amber-400/15 text-sm font-extrabold text-amber-200 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
              2
            </div>
            <h2 className="text-lg font-bold text-white">Outcome</h2>
          </div>

          <p className="mt-2 max-w-md text-sm text-white/60">{subtitle}</p>
        </div>
      </div>

      {/* ADVICE */}
      <div
        className={[
          "relative rounded-3xl border border-white/18 bg-black/28 p-5",
          "shadow-[0_18px_60px_rgba(0,0,0,0.65)]",
        ].join(" ")}
      >
        <div className="relative flex justify-center pb-5 pt-2">
          <div className="pointer-events-none rounded-full border border-white/16 bg-black/60 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
            Analysis
          </div>
        </div>

        <ul className="space-y-2.5">
          {adviceItems.map((a, idx) => (
            <li key={`${a.theme}-${idx}`} className="flex gap-3">
              <div className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[13px] font-semibold text-white/90">{a.title}</div>
                  {a.badge ? <ThemeBadge text={a.badge} /> : null}
                </div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-white/70">{a.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* INVALID CONFIG PATH */}
      {!denomOk ? (
        <>
          {hasTools ? (
            <>
              <GoldDivider />
              <div
                className={[
                  "relative rounded-3xl border border-white/18 bg-black/22 p-5",
                  "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
                ].join(" ")}
              >
                <div className="relative flex justify-center pb-5 pt-2">
                  <div className="pointer-events-none rounded-full border border-white/16 bg-black/60 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
                    Advanced tools
                  </div>
                </div>

                <div className="space-y-4">
                  {breakEven ? (
                    <div className="w-full rounded-2xl border border-white/14 bg-black/18 p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                          Break-even
                        </div>
                      </div>

                      <div className="mt-2 text-[12px] text-white/65">
                        Target net:{" "}
                        <span className="font-semibold text-white/85">
                          {symbol}
                          {breakEven.targetNet.toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-3">
                        <MoneyRow
                          label="Required customer price"
                          symbol={symbol}
                          value={breakEven.requiredCharge}
                          big
                          kind="charge"
                        />
                      </div>

                      {!breakEven.denomOk ? (
                        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-white/70">
                          This configuration is not solvable (total percentage fees are 100%+).
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {sensitivity ? (
                    <div className="w-full rounded-2xl border border-white/14 bg-black/18 p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                          Fee impact
                        </div>
                      </div>

                      <div className="mt-2 text-[12px] text-white/65">
                        {labelSensitivityTarget(sensitivity.target, providerPctLabel)} ±{sensitivity.deltaPct}%
                      </div>

                      {showZeroDriftHint ? (
                        <div className="mt-2 text-[11px] text-white/55">No change: the selected fee is currently set to 0%.</div>
                      ) : null}

                      <div className="mt-3 space-y-2">
                        <MoneyRow label="Base net" symbol={symbol} value={sensitivity.baseNet} kind="net" />
                        <MoneyRow label="Net if fees ↑" symbol={symbol} value={sensitivity.netUp} kind="fee" />
                        <MoneyRow label="Net if fees ↓" symbol={symbol} value={sensitivity.netDown} kind="fee" />
                      </div>
                    </div>
                  ) : null}

                  {showVolume ? <VolumePanel /> : null}
                </div>
              </div>
            </>
          ) : null}

          <GoldDivider />
          <div className="relative rounded-2xl border border-red-500/35 bg-red-500/12 p-4 text-sm text-white shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
            Your percentages add up to 100%+ (Provider + FX + platform). Reduce FX/platform fee.
          </div>
        </>
      ) : (
        /* VALID CONFIG PATH */
        <div className="relative space-y-6">
          <GoldDivider />

          <div
            className={[
              "rounded-3xl border border-white/18 bg-black/22 p-5",
              "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
            ].join(" ")}
          >
            <div className="relative flex justify-center pb-5 pt-2">
              <div className="pointer-events-none rounded-full border border-white/16 bg-black/60 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
                Breakdown
              </div>
            </div>

            {/* Gross */}
            <div className="rounded-3xl border border-amber-300/18 bg-white/5 p-5">
              <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                Gross amount
              </div>

              <MoneyRow label={requiredPriceLabel} symbol={symbol} value={gross} big kind="charge" />

              <div className="mt-2 text-center text-[11px] text-white/55">What the customer pays.</div>
            </div>

            <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />

            {/* Fees */}
            <div className="rounded-3xl border border-white/14 bg-black/18 p-5">
              <div className="mb-3 flex items-center justify-center gap-2">
                <div className="text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                  Fees
                </div>

                {overrides.any ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                    Overrides active
                    <InfoTip
                      containerRef={cardRef}
                      text={
                        <>
                          You’ve enabled manual provider pricing overrides.
                          {"\n\n"}
                          {overrides.pctOn && overrides.pct != null ? (
                            <>
                              • Provider % override: <strong>{overrides.pct.toFixed(2)}%</strong>
                              {"\n"}
                            </>
                          ) : null}
                          {overrides.fixedOn && overrides.fixed != null ? (
                            <>
                              • Fixed fee override:{" "}
                              <strong>
                                {symbol}
                                {overrides.fixed.toFixed(2)}
                              </strong>
                              {"\n"}
                            </>
                          ) : null}
                          {"\n"}
                          These overrides replace the provider’s default fee assumptions. If reverse mode is used, the
                          calculator works backwards so the resulting fee aligns as closely as possible with your override.
                        </>
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <MoneyRow label={providerFeeRowLabel} symbol={symbol} value={stripeFee} kind="fee" />
                <MoneyRow label="FX" symbol={symbol} value={fxFee} kind="fee" />
                <MoneyRow label="Platform" symbol={symbol} value={platformFee} kind="fee" />
              </div>

              <div
                className={[
                  "mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/5 px-4 py-3",
                  "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
                ].join(" ")}
              >
                <MoneyRow label="Total fees" symbol={symbol} value={totalDeductions} kind="fee" big />
                <div className="mt-0.5 text-[11px] tracking-wide text-rose-200/70">Fees subtracted from gross amount.</div>
              </div>
            </div>

            <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />

            {/* Net */}
            <div className="relative overflow-hidden rounded-3xl border border-emerald-300/18 bg-white/6 p-5 ring-1 ring-white/10">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(700px_160px_at_50%_0%,rgba(110,231,183,0.10),transparent_55%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(110,231,183,0.06),transparent_55%)]" />
              </div>

              <div className="relative">
                <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                  Net amount
                </div>

                <MoneyRow label="You receive" symbol={symbol} value={net} big kind="net" />

                <div className="mt-2 text-center text-[11px] text-white/55">Amount you receive after fee deductions (before taxes).</div>

                {/* VAT */}
                {vatOn ? (
                  <div className="mt-4 rounded-2xl border border-white/12 bg-black/18 px-4 py-3">
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">VAT</div>

                      <InfoTip
                        containerRef={cardRef}
                        text={
                          <>
                            VAT is shown <strong>separately</strong> from platform and payment fees.
                            {"\n\n"}
                            The <strong>Net amount you receive (before VAT)</strong> value represents what you keep after all
                            fees ({providerPctLabel}, FX, platform), but <em>before</em> VAT is applied.
                            {"\n\n"}
                            The <strong>Net after VAT</strong> value shows what remains once VAT is deducted from the gross
                            customer payment.
                          </>
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <MoneyRow
                        label={`VAT amount (${vatBlock.vP.toFixed(2)}%)`}
                        symbol={symbol}
                        value={vatBlock.vAmt}
                        kind="charge"
                      />
                      <MoneyRow label="Net after VAT" symbol={symbol} value={vatBlock.nAfter} kind="net" big />
                    </div>

                    <div className="mt-2 text-center text-[11px] text-white/55">Post-tax view (VAT is not treated as a “fee” above).</div>
                  </div>
                ) : (
                  <div className="mt-4 text-center text-[11px] text-white/45">VAT: Off</div>
                )}
              </div>
            </div>

            {/* Margin goal */}
            {showMarginBlock ? (
              <div className="mt-4 rounded-3xl border border-white/14 bg-black/18 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                      Net margin vs goal
                    </div>
                    <div className="mt-1 text-[12px] text-white/65">
                      Actual <span className="font-semibold text-white/85">{marginSummary.actual.toFixed(1)}%</span>{" "}
                      {marginSummary.target > 0 ? (
                        <>
                          • Goal <span className="font-semibold text-white/85">{marginSummary.target.toFixed(1)}%</span>
                        </>
                      ) : (
                        <span className="text-white/45">• Set a goal in Inputs</span>
                      )}
                      {useReverse ? (
                        <>
                          {" "}
                          •{" "}
                          <span className="text-white/55">
                            Goal mode <span className="font-semibold text-white/75">{marginOn ? "On" : "Off"}</span>
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span
                    className={[
                      "shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                      marginSummary.badge === "On target"
                        ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-200/80"
                        : marginSummary.badge === "Below target"
                        ? "border-amber-300/25 bg-amber-400/10 text-amber-200/80"
                        : "border-white/12 bg-white/5 text-white/55",
                    ].join(" ")}
                  >
                    {marginSummary.badge}
                  </span>
                </div>

                {marginSummary.target > 0 && marginSummary.grossSafe > 0 ? (
                  <div className="mt-2 text-[11px] text-white/50">
                    Gap:{" "}
                    <span className="font-semibold text-white/70">
                      {marginSummary.delta >= 0 ? "+" : ""}
                      {marginSummary.delta.toFixed(1)}%
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <GoldDivider />

          {/* Tools directly above “How this estimate works” */}
          {hasTools ? (
            <div
              className={[
                "relative rounded-3xl border border-white/18 bg-black/22 p-5",
                "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
              ].join(" ")}
            >
              <div className="relative flex justify-center pb-5 pt-2">
                <div className="pointer-events-none rounded-full border border-white/16 bg-black/60 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
                  Advanced tools
                </div>
              </div>

              <div className="space-y-4">
                {breakEven ? (
                  <div className="w-full rounded-2xl border border-white/14 bg-black/18 p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                        Break-even
                      </div>
                    </div>

                    <div className="mt-2 text-[12px] text-white/65">
                      Target net:{" "}
                      <span className="font-semibold text-white/85">
                        {symbol}
                        {breakEven.targetNet.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-3">
                      <MoneyRow label="Required customer price" symbol={symbol} value={breakEven.requiredCharge} big kind="charge" />
                    </div>

                    {!breakEven.denomOk ? (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-white/70">
                        This configuration is not solvable (total percentage fees are 100%+).
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {sensitivity ? (
                  <div className="w-full rounded-2xl border border-white/14 bg-black/18 p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]" />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                        Fee impact
                      </div>
                    </div>

                    <div className="mt-2 text-[12px] text-white/65">
                      {labelSensitivityTarget(sensitivity.target, providerPctLabel)} ±{sensitivity.deltaPct}%
                    </div>

                    {showZeroDriftHint ? (
                      <div className="mt-2 text-[11px] text-white/55">No change: the selected fee is currently set to 0%.</div>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      <MoneyRow label="Base net" symbol={symbol} value={sensitivity.baseNet} kind="net" />
                      <MoneyRow label="Net if fees ↑" symbol={symbol} value={sensitivity.netUp} kind="fee" />
                      <MoneyRow label="Net if fees ↓" symbol={symbol} value={sensitivity.netDown} kind="fee" />
                    </div>
                  </div>
                ) : null}

                {showVolume ? <VolumePanel /> : null}
              </div>
            </div>
          ) : null}

          {/* Assumptions */}
          <div
            className={[
              "rounded-3xl border border-white/18 bg-black/18 p-5",
              "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
            ].join(" ")}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAssumptionsOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setAssumptionsOpen((v) => !v);
                }
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">How PriceIQ estimates are applied.</div>
                  <div className="mt-1 text-xs text-white/55">Assumptions, inclusions, exclusions.</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/14 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:bg-white/8 hover:text-white">
                {assumptionsOpen ? "Hide" : "Show"}
              </div>
            </div>

            {assumptionsOpen ? (
              <>
                <GoldDivider />

                <div className="space-y-4 text-xs leading-relaxed text-white/70">
                  <div>
                    <span className="font-semibold text-white/85">Indicative pricing, non-contractual estimates:</span>{" "}
                    all figures shown are illustrative only. Actual provider fees depend on your individual contract,
                    region, transaction volume, risk profile and commercial terms, more info can be found in the provider
                    links below.
                  </div>

                  {overrides.any ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-[12px] text-white/70">
                      <span className="font-semibold text-amber-200/85">Overrides active:</span> you’ve manually
                      overridden provider fees for this scenario
                      {overrides.pctOn && overrides.pct != null ? ` (${overrides.pct.toFixed(2)}%` : " ("}
                      {overrides.fixedOn && overrides.fixed != null
                        ? `${overrides.pctOn ? " + " : ""}${symbol}${overrides.fixed.toFixed(2)}`
                        : ""}
                      {")"}. This is meant to reflect your real negotiated pricing; it will not match public rate cards.
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-white/12 bg-black/20">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-white/60">
                          <th className="px-3 py-2 font-semibold">Provider</th>
                          <th className="px-3 py-2 font-semibold">Reference pricing source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        <tr>
                          <td className="px-3 py-2 font-medium text-white/80">Stripe</td>
                          <td className="px-3 py-2">
                            <a
                              href="https://stripe.com/pricing"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-300"
                            >
                              Stripe.com/pricing
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-medium text-white/80">PayPal</td>
                          <td className="px-3 py-2">
                            <a
                              href="https://www.paypal.com/uk/business/paypal-business-fees"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-300"
                            >
                              PayPal.com/business-fees
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-medium text-white/80">Adyen</td>
                          <td className="px-3 py-2">
                            <a
                              href="https://docs.adyen.com/platforms/online-payments/transaction-fees"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-300"
                            >
                              Adyen transaction fee model
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-medium text-white/80">Checkout</td>
                          <td className="px-3 py-2">
                            <a
                              href="https://www.checkout.com/pricing"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-300"
                            >
                              Checkout.com/pricing
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">Purpose:</span> This tool provides directional insight
                    into fee structure and margin sensitivity: it does not provide financial advice, it is not a billing
                    engine nor it provides contractual quotes.
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">Included:</span> provider fees and fee override, currency region, FX, rounding,
                    platform fees, tax (VAT) & advance tools calculations.
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">Excluded:</span> disputes, chargebacks, payout
                    delays and any external banking or settlement fees.
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">VAT:</span> displayed separately. Net values represent
                    earnings before VAT; “Net after VAT” shows the post-tax outcome. Volume projections extract VAT from
                    gross assuming VAT-inclusive pricing.
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">FX handling:</span> applied only when currency
                    conversion occurs during processing.
                  </div>

                  <div>
                    <span className="font-semibold text-white/85">Platform fee calculation:</span>{" "}
                    {platformFeeBaseCopy(modelKind, platformFeeBase)}
                  </div>

<div>
  <span className="font-semibold text-white/85">Advanced tools</span> are optional analytical tools built on top of the calculated net values.
  They help you explore break-even points, fee impact, and volume scenarios, but they do not change the underlying pricing or fees.
</div>
                  
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
