// src/components/calculator/Calculator.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

import { PRICING, type Region } from "@/lib/pricing";
import { roundMoney } from "@/lib/money";
import { applyPsychPrice, roundToStep } from "@/lib/rounding";
import {
  DEFAULT_STATE,
  type CalcState,
  type RoundingStep,
  applySearchParamsToState,
  stateToSearchParams,
  type VolumeTier,
  normalizeState as normalizeStateCanonical,
} from "@/lib/calcState";

import type { PresetId } from "@/lib/presets";
import { InputsCard, type SensitivityTarget } from "./InputsCard";
import { ResultsCard } from "./ResultsCard";
import { ActionsBar } from "./ActionsBar";
import { ScenarioCompare } from "./ScenarioCompare";

// ✅ Provider plumbing
import { getProvider, DEFAULT_PROVIDER_ID } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers/types";

// ✅ UI policy (starter defaults only; NO toast/suggestions)
import { getUiPolicy } from "@/lib/calculator/uiPolicy";

type Scenario = {
  id: string;
  name: string;
  state: CalcState;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampPct(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** Money-like clamp (allows decimals, blocks NaN/Infinity) */
function clampMoneyLike(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v;
}

/**
 * Local hard normalizer (UI safety)
 * ✅ Delegates to canonical normalizeState in calcState.ts
 */
function normalizeState(next: CalcState): CalcState {
  try {
    return normalizeStateCanonical(next);
  } catch {
    // ultra defensive fallback (should never happen)
    return { ...(next as any) } as CalcState;
  }
}

function grossFromNet(params: {
  targetNet: number;
  percentStripe: number; // fraction e.g. 0.029
  fixedStripe: number;
  fxp: number; // fraction
  plat: number; // fraction
  platformFeeBase: "gross" | "afterStripe";
}) {
  const { targetNet, percentStripe: p, fixedStripe: fixed, fxp, plat, platformFeeBase } = params;

  if (!Number.isFinite(targetNet) || targetNet < 0) return NaN;

  if (platformFeeBase === "gross") {
    const denom = 1 - p - fxp - plat;
    if (!(denom > 0)) return NaN;
    return (targetNet + fixed) / denom;
  }

  const denom = 1 - p - fxp - plat + p * plat;
  if (!(denom > 0)) return NaN;

  return (targetNet + fixed * (1 - plat)) / denom;
}

/**
 * ✅ Rounding + psych helper (applies to ANY provider)
 */
function applyRoundingAndPsych(params: { gross: number; roundingStep: RoundingStep; psychPriceOn: boolean }) {
  const { gross, roundingStep, psychPriceOn } = params;

  let out = gross;
  if (!Number.isFinite(out)) return out;

  out = roundToStep(out, roundingStep);

  if (psychPriceOn) {
    out = applyPsychPrice(out, roundingStep);
  }

  return out;
}

/**
 * ✅ Stripe fee computation (with optional overrides from CalcState)
 */
function computeFeesFromGross_STRIPE(s: CalcState, gross: number) {
  const options = PRICING[s.region];
  const selected = options.find((o) => o.id === s.pricingId) ?? options[0];

  const customPct = (s as any).customProviderFeePercent as number | null;
  const customFixed = (s as any).customFixedFee as number | null;

  const pctUsed = customPct != null ? clampPct(customPct) : selected.percent;
  const fixedUsed = customFixed != null ? clampMoneyLike(customFixed) : selected.fixed;

  const p = pctUsed / 100;

  const fxEnabled = Number.isFinite(s.fxPercent) && Number(s.fxPercent) > 0;
  const fxp = fxEnabled ? Number(s.fxPercent) / 100 : 0;

  const plat = (s.platformFeePercent ?? 0) / 100;

  const providerFee = gross * p + fixedUsed;
  const fxFee = gross * fxp;
  const platformFee = s.platformFeeBase === "afterStripe" ? (gross - providerFee) * plat : gross * plat;

  const netBeforeVat = gross - providerFee - fxFee - platformFee;

  const vatPercent = Number(s.vatPercent ?? 0);
  const vatP = vatPercent / 100;

  // VAT included in gross
  const vatAmount = vatP > 0 ? gross * (vatP / (1 + vatP)) : 0;
  const netAfterVat = netBeforeVat - vatAmount;

  return {
    selected,
    providerFee,
    fxFee,
    platformFee,
    netBeforeVat,
    vatAmount,
    netAfterVat,
    p,
    fxEnabled,
    fxp,
    plat,
    pctUsed,
    fixedUsed,
  };
}

function computeForState_STRIPE(s0: CalcState) {
  const s = normalizeState(s0);

  const options = PRICING[s.region];
  const selected = options.find((o) => o.id === s.pricingId) ?? options[0];

  const customPct = (s as any).customProviderFeePercent as number | null;
  const customFixed = (s as any).customFixedFee as number | null;

  const pctUsed = customPct != null ? clampPct(customPct) : selected.percent;
  const fixedUsed = customFixed != null ? clampMoneyLike(customFixed) : selected.fixed;

  const p = pctUsed / 100;

  const fxEnabled = Number.isFinite(s.fxPercent) && Number(s.fxPercent) > 0;
  const fxp = fxEnabled ? Number(s.fxPercent) / 100 : 0;

  const plat = (s.platformFeePercent ?? 0) / 100;

  const denomEffective = s.platformFeeBase === "gross" ? 1 - p - fxp - plat : 1 - p - fxp - plat + p * plat;

  const rawGross =
    s.mode === "reverse"
      ? grossFromNet({
          targetNet: s.targetNet,
          percentStripe: p,
          fixedStripe: fixedUsed,
          fxp,
          plat,
          platformFeeBase: s.platformFeeBase,
        })
      : Number(s.amount);

  let customerCharge = rawGross;

  if (Number.isFinite(customerCharge)) {
    customerCharge = applyRoundingAndPsych({
      gross: customerCharge,
      roundingStep: s.roundingStep as RoundingStep,
      psychPriceOn: Boolean(s.psychPriceOn),
    });
  }

  const { providerFee, fxFee, platformFee, netBeforeVat, vatAmount, netAfterVat } = computeFeesFromGross_STRIPE(
    s,
    customerCharge
  );

  const totalPct = (p + fxp + plat) * 100;
  const fxDominates = fxEnabled && fxFee > providerFee && fxFee > platformFee;
  const nearLimit = denomEffective > 0 && denomEffective < 0.2;

  return {
    symbol: selected.currencySymbol,
    pricingTierLabel: selected.label,
    selected,

    gross: roundMoney(customerCharge),

    // ResultsCard expects "stripeFee" (we map provider fee here)
    stripeFee: roundMoney(providerFee),

    fxFee: roundMoney(fxFee),
    platformFee: roundMoney(platformFee),

    net: roundMoney(netBeforeVat),

    vatPercent: clampPct(Number(s.vatPercent ?? 0)),
    vatAmount: roundMoney(vatAmount),
    netAfterVat: roundMoney(netAfterVat),

    denomOk: denomEffective > 0 && Number.isFinite(rawGross),
    totalPct,
    fxDominates,
    nearLimit,

    // ✅ NEW: allow ResultsCard to display “Applied rate: X% + Y”
    providerFeePercentUsed: pctUsed,
    providerFixedFeeUsed: fixedUsed,
  };
}

/**
 * ✅ Provider compute (bridge)
 * - Keeps ResultsCard shape by mapping provider_fee -> stripeFee
 * - Reverse mode: quote(reverse) => get gross suggestion => round/psych => quote(forward) for final breakdown
 * - ✅ Custom provider label is passed through (customProviderLabel)
 * - ✅ NEW: pass through provider "rate used" so ResultsCard can show % + fixed
 */
function computeForState(s0: CalcState) {
  const s = normalizeState(s0);

  const providerId = (s.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;

  if (providerId === "stripe") {
    return computeForState_STRIPE(s);
  }

  const provider = getProvider(providerId);
  const productId = String(s.productId ?? "");
  const product = provider.products?.find((p) => p.id === productId) ?? provider.products?.[0];

  const providerLabel = provider.label;
  const productLabel = product?.label ?? "";

  const forwardCharge = applyRoundingAndPsych({
    gross: Number(s.amount),
    roundingStep: s.roundingStep as RoundingStep,
    psychPriceOn: Boolean(s.psychPriceOn),
  });

  const customProviderFeePercent = (s as any).customProviderFeePercent as number | null;
  const customFixedFee = (s as any).customFixedFee as number | null;
  const customProviderLabel = (s as any).customProviderLabel as string | undefined;

  const baseQuote = provider.quote({
    providerId,
    region: s.region,
    productId,
    mode: s.mode,
    amount: s.mode === "forward" ? forwardCharge : Number(s.amount),
    targetNet: Number(s.targetNet),
    fxPercent: Number(s.fxPercent ?? 0),
    platformFeePercent: Number(s.platformFeePercent ?? 0),
    platformFeeBase: s.platformFeeBase,
    vatPercent: Number(s.vatPercent ?? 0),

    customProviderFeePercent,
    customFixedFee,

    // ✅ Custom provider display label (for providerId === "custom")
    customProviderLabel,

    // ✅ volume passthrough (providers may ignore)
    volumeOn: Boolean((s as any).volumeOn),
    volumeTxPerMonth: Number((s as any).volumeTxPerMonth ?? 0),
    volumeRefundRatePct: Number((s as any).volumeRefundRatePct ?? 0),
    volumeTiers: ((s as any).volumeTiers ?? []) as VolumeTier[],
  } as any);

  const rawGross = Number(baseQuote.gross);

  const customerCharge =
    s.mode === "reverse"
      ? applyRoundingAndPsych({
          gross: rawGross,
          roundingStep: s.roundingStep as RoundingStep,
          psychPriceOn: Boolean(s.psychPriceOn),
        })
      : forwardCharge;

  const finalQuote =
    s.mode === "reverse" && Number.isFinite(customerCharge)
      ? provider.quote({
          providerId,
          region: s.region,
          productId,
          mode: "forward",
          amount: customerCharge,
          targetNet: Number(s.targetNet),
          fxPercent: Number(s.fxPercent ?? 0),
          platformFeePercent: Number(s.platformFeePercent ?? 0),
          platformFeeBase: s.platformFeeBase,
          vatPercent: Number(s.vatPercent ?? 0),

          customProviderFeePercent,
          customFixedFee,
          customProviderLabel,

          volumeOn: Boolean((s as any).volumeOn),
          volumeTxPerMonth: Number((s as any).volumeTxPerMonth ?? 0),
          volumeRefundRatePct: Number((s as any).volumeRefundRatePct ?? 0),
          volumeTiers: ((s as any).volumeTiers ?? []) as VolumeTier[],
        } as any)
      : baseQuote;

  const providerFee = finalQuote.fees.find((x: any) => x.key === "provider_fee")?.amount ?? 0;
  const fxFee = finalQuote.fees.find((x: any) => x.key === "fx_fee")?.amount ?? 0;
  const platformFee = finalQuote.fees.find((x: any) => x.key === "platform_fee")?.amount ?? 0;

  const denomOk =
    Boolean(finalQuote.denomOk) &&
    (s.mode === "forward" ? true : Boolean(baseQuote.denomOk)) &&
    (s.mode === "forward" ? Number.isFinite(customerCharge) : Number.isFinite(rawGross));

  // ✅ NEW: provider "rate used" from quote meta (if provided by provider)
  const metaAny = (finalQuote as any)?.meta ?? {};
  const providerFeePercentUsed =
    typeof metaAny?.providerPercent === "number" && Number.isFinite(metaAny.providerPercent)
      ? metaAny.providerPercent
      : null;

  const providerFixedFeeUsed =
    typeof metaAny?.providerFixed === "number" && Number.isFinite(metaAny.providerFixed) ? metaAny.providerFixed : null;

  return {
    symbol: finalQuote.symbol,
    pricingTierLabel: productLabel || providerLabel,
    selected: null as any,

    gross: roundMoney(customerCharge),

    stripeFee: roundMoney(providerFee),

    fxFee: roundMoney(fxFee),
    platformFee: roundMoney(platformFee),

    net: roundMoney(finalQuote.netBeforeVat),

    vatPercent: clampPct(finalQuote.vatPercent),
    vatAmount: roundMoney(finalQuote.vatAmount),
    netAfterVat: roundMoney(finalQuote.netAfterVat),

    denomOk,

    // non-stripe: keep these neutral (ResultsCard shows Stripe-specific hints)
    totalPct: 0,
    fxDominates: false,
    nearLimit: false,

    providerLabel,
    productLabel,

    // helpful for ResultsCard headers (optional)
    customProviderLabel,

    // ✅ NEW: allow ResultsCard to display “Applied rate: X% + Y”
    providerFeePercentUsed,
    providerFixedFeeUsed,
  };
}

function computeBreakEven(s0: CalcState) {
  const s = normalizeState(s0);

  if (!Boolean(s.breakEvenOn)) return null;

  const target = Number(s.breakEvenTargetNet);
  if (!Number.isFinite(target) || target < 0) return null;

  const temp: CalcState = {
    ...s,
    mode: "reverse",
    targetNet: target,
  };

  const r = computeForState(temp);

  return {
    targetNet: target,
    requiredCharge: r.gross,
    denomOk: r.denomOk,
  };
}

function computeSensitivity(s0: CalcState) {
  if (!Boolean(s0.sensitivityOn)) return null;

  const s = normalizeState(s0);
  const providerId = (s.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;

  const delta = Math.max(0, Number(s.sensitivityDeltaPct ?? 0));
  const target = (s.sensitivityTarget ?? "all") as SensitivityTarget;

  // Non-stripe (perturbation)
  if (providerId !== "stripe") {
    const base = computeForState(s);

    const gross = Number(base.gross);
    if (!Number.isFinite(gross) || gross < 0) {
      return {
        deltaPct: delta,
        target,
        baseNet: base.net,
        netUp: base.net,
        netDown: base.net,
        stripeNetUp: null,
        stripeNetDown: null,
      };
    }

    const baseProviderFee = Number(base.stripeFee) || 0;
    const baseFxPct = clampPct(Number(s.fxPercent ?? 0));
    const basePlatPct = clampPct(Number(s.platformFeePercent ?? 0));
    const baseVatPct = clampPct(Number(s.vatPercent ?? 0));

    const affectsProvider = target === "stripe" || target === "all";
    const affectsFx = target === "fx" || target === "all";
    const affectsPlatform = target === "platform" || target === "all";

    function factor(dir: "up" | "down") {
      return dir === "up" ? 1 + delta / 100 : 1 - delta / 100;
    }

    function computeNet(dir: "up" | "down") {
      const f = factor(dir);

      const providerFee = affectsProvider ? baseProviderFee * f : baseProviderFee;

      const fxPct = affectsFx ? clampPct(baseFxPct * f) : baseFxPct;
      const fxFee = gross * (fxPct / 100);

      const platPct = affectsPlatform ? clampPct(basePlatPct * f) : basePlatPct;
      const plat = platPct / 100;

      const platformBaseAmount = s.platformFeeBase === "afterStripe" ? gross - providerFee : gross;
      const platformFee = platformBaseAmount * plat;

      const netBeforeVat = gross - providerFee - fxFee - platformFee;

      const vatP = baseVatPct / 100;
      const vatAmount = vatP > 0 ? gross * (vatP / (1 + vatP)) : 0;

      return {
        netBeforeVat: roundMoney(netBeforeVat),
        netAfterVat: roundMoney(netBeforeVat - vatAmount),
      };
    }

    const up = computeNet("up");
    const down = computeNet("down");

    return {
      deltaPct: delta,
      target,
      baseNet: base.net,
      netUp: up.netBeforeVat,
      netDown: down.netBeforeVat,
      stripeNetUp: null,
      stripeNetDown: null,
    };
  }

  // Stripe sensitivity
  const base = computeForState_STRIPE(s);

  const options = PRICING[s.region];
  const selected = options.find((o) => o.id === s.pricingId) ?? options[0];

  const customerCharge0 = Number(base.gross);
  if (!Number.isFinite(customerCharge0) || customerCharge0 < 0) {
    return {
      deltaPct: delta,
      target,
      baseNet: base.net,
      netUp: base.net,
      netDown: base.net,
      stripeNetUp: null,
      stripeNetDown: null,
    };
  }

  function applyRelativePct(basePct: number, deltaPct: number, dir: "up" | "down") {
    const factor = dir === "up" ? 1 + deltaPct / 100 : 1 - deltaPct / 100;
    return clampPct(basePct * factor);
  }

  const customPct = (s as any).customProviderFeePercent as number | null;
  const baseStripePct = customPct != null ? clampPct(customPct) : Number(selected.percent) || 0;

  function computeNetWithPercents(params: { stripePercent: number; fxPercent: number; platformPercent: number }) {
    const stripeP = params.stripePercent / 100;
    const fxP = params.fxPercent / 100;
    const platP = params.platformPercent / 100;

    const customFixed = (s as any).customFixedFee as number | null;
    const fixedUsed = customFixed != null ? clampMoneyLike(customFixed) : selected.fixed;

    const stripeFee = customerCharge0 * stripeP + fixedUsed;
    const fxFee = customerCharge0 * fxP;
    const platformFee =
      s.platformFeeBase === "afterStripe" ? (customerCharge0 - stripeFee) * platP : customerCharge0 * platP;

    const netBeforeVat = customerCharge0 - stripeFee - fxFee - platformFee;
    return roundMoney(netBeforeVat);
  }

  const baseFxPct = clampPct(Number(s.fxPercent ?? 0));
  const basePlatPct = clampPct(Number(s.platformFeePercent ?? 0));

  let stripeNetUp: number | null = null;
  let stripeNetDown: number | null = null;

  if (target === "stripe" || target === "all") {
    const upStripe = applyRelativePct(baseStripePct, delta, "up");
    const downStripe = applyRelativePct(baseStripePct, delta, "down");

    stripeNetUp = computeNetWithPercents({
      stripePercent: upStripe,
      fxPercent: baseFxPct,
      platformPercent: basePlatPct,
    });
    stripeNetDown = computeNetWithPercents({
      stripePercent: downStripe,
      fxPercent: baseFxPct,
      platformPercent: basePlatPct,
    });
  }

  function netWithTarget(dir: "up" | "down") {
    const stripePct =
      target === "stripe" || target === "all" ? applyRelativePct(baseStripePct, delta, dir) : baseStripePct;
    const fxPct = target === "fx" || target === "all" ? applyRelativePct(baseFxPct, delta, dir) : baseFxPct;
    const platPct =
      target === "platform" || target === "all" ? applyRelativePct(basePlatPct, delta, dir) : basePlatPct;

    return computeNetWithPercents({
      stripePercent: stripePct,
      fxPercent: fxPct,
      platformPercent: platPct,
    });
  }

  let netUp = netWithTarget("up");
  let netDown = netWithTarget("down");

  if (target === "stripe") {
    if (Number.isFinite(stripeNetUp ?? NaN)) netUp = stripeNetUp as number;
    if (Number.isFinite(stripeNetDown ?? NaN)) netDown = stripeNetDown as number;
  }

  return {
    deltaPct: delta,
    target,
    baseNet: base.net,
    netUp,
    netDown,
    stripeNetUp,
    stripeNetDown,
  };
}

// ----------------------------------------------------------------------------
// ✅ Volume projections computation (matches ResultsCard model)
// ----------------------------------------------------------------------------
function clampNonNeg(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

function computeVolumeProjections(
  s0: CalcState,
  perTxn: { symbol: string; gross: number; stripeFee: number; platformFee: number },
  overrides: { pct: number | null; fixed: number | null }
) {
  const s = normalizeState(s0);

  const volumeOn = Boolean((s as any).volumeOn);
  const txPerMonth = clampNonNeg(Number((s as any).volumeTxPerMonth ?? 0));
  const refundRatePct = clampPct(Number((s as any).volumeRefundRatePct ?? 0));
  const tiers = (((s as any).volumeTiers ?? []) as VolumeTier[]).filter(Boolean);

  if (!volumeOn || txPerMonth <= 0 || tiers.length === 0) return null;

  // best-effort provider model
  const grossSafe = Number.isFinite(perTxn.gross) && perTxn.gross > 0 ? perTxn.gross : 0;
  const inferredPct = grossSafe > 0 ? clampPct((perTxn.stripeFee / grossSafe) * 100) : 0;

  const providerPct = overrides.pct != null ? clampPct(overrides.pct) : inferredPct;
  const providerFixed = overrides.fixed != null ? clampNonNeg(overrides.fixed) : 0;

  const platformFeePercent = clampPct(Number(s.platformFeePercent ?? 0));
  const platformFeeBase = (s.platformFeeBase ?? "gross") as "gross" | "afterStripe";

  let grossMonthly = 0;
  let providerFeesMonthly = 0;
  let fxFeesMonthly = 0;
  let platformFeesMonthly = 0;
  let netMonthly = 0;

  for (const t of tiers as any[]) {
    const sharePct = clampPct(Number(t?.sharePct ?? 0));
    const price = clampNonNeg(Number(t?.price ?? 0));
    const fxPct = clampPct(Number(t?.fxPercent ?? 0));

    const tierTx = txPerMonth * (sharePct / 100);
    const tierGross = tierTx * price;

    const providerFeePerTx = price * (providerPct / 100) + providerFixed;
    const fxFeePerTx = price * (fxPct / 100);

    const platformBasePerTx = platformFeeBase === "gross" ? price : Math.max(0, price - providerFeePerTx);
    const platformFeePerTx = platformBasePerTx * (platformFeePercent / 100);

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

  const refundLossMonthly = netMonthly * (refundRatePct / 100);
  const netAfterRefundsMonthly = netMonthly - refundLossMonthly;

  return {
    symbol: perTxn.symbol,
    txPerMonth: Math.round(txPerMonth),
    refundRatePct,
    monthlyGross: roundMoney(grossMonthly),
    monthlyProviderFee: roundMoney(providerFeesMonthly),
    monthlyFxFee: roundMoney(fxFeesMonthly),
    monthlyPlatformFee: roundMoney(platformFeesMonthly),
    monthlyNetBeforeRefunds: roundMoney(netMonthly),
    monthlyRefundLoss: roundMoney(refundLossMonthly),
    monthlyNetAfterRefunds: roundMoney(netAfterRefundsMonthly),
  };
}

// ----------------------------------------------------------------------------
// ✅ Model-change normalization helpers (Calculator-owned, no UI side-effects)
// ----------------------------------------------------------------------------
type TouchMap = Partial<
  Record<
    | "fxPercent"
    | "platformFeePercent"
    | "platformFeeBase"
    | "vatPercent"
    | "roundingStep"
    | "psychPriceOn"
    | "pricingId"
    | "mode"
    | "breakEvenOn"
    | "breakEvenTargetNet"
    | "sensitivityOn"
    | "sensitivityDeltaPct"
    | "sensitivityTarget"
    | "customProviderFeePercent"
    | "customFixedFee"
    | "customProviderLabel"
    // ✅ Volume projections
    | "volumeOn"
    | "volumeTxPerMonth"
    | "volumeRefundRatePct"
    | "volumeTiers",
    boolean
  >
>;

function isDefaultish(prev: CalcState, key: keyof TouchMap) {
  const d = normalizeState(DEFAULT_STATE);
  const p = normalizeState(prev);

  if (key === "mode") return p.mode === d.mode;

  if (key === "breakEvenOn") return Boolean(p.breakEvenOn) === Boolean(d.breakEvenOn);
  if (key === "sensitivityOn") return Boolean(p.sensitivityOn) === Boolean(d.sensitivityOn);
  if (key === "volumeOn") return Boolean((p as any).volumeOn) === Boolean((d as any).volumeOn);

  return (p as any)[key] === (d as any)[key];
}

export function Calculator() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const defaultPricingId = PRICING["UK"][0].id;

  // -----------------------------
  // ✅ PostHog helpers (dedupe noisy dev / strict-mode effects)
  // -----------------------------
  const phSeenRef = useRef<Record<string, number>>({});

  function phCapture(name: string, props?: Record<string, any>, cooldownMs = 400) {
    try {
      if (typeof window === "undefined") return;
      if (!posthog || typeof (posthog as any).capture !== "function") return;

      const key = `${name}:${JSON.stringify(props ?? {})}`;
      const now = Date.now();
      const last = phSeenRef.current[key] ?? 0;

      if (now - last < cooldownMs) return;

      phSeenRef.current[key] = now;

      // ✅ cap the map so it can't grow forever
      const keys = Object.keys(phSeenRef.current);
      if (keys.length > 300) {
        for (const k of keys.slice(0, 120)) {
          delete phSeenRef.current[k];
        }
      }

      (posthog as any).capture(name, props ?? {});
    } catch {
      // silent fail – analytics should never break UX
    }
  }

  const [activeId, setActiveId] = useState<string>("s1");
  const [scenarios, setScenarios] = useState<Scenario[]>([
    {
      id: "s1",
      name: "Scenario 1",
      state: normalizeState({
        ...DEFAULT_STATE,
        pricingId: defaultPricingId,
        vatPercent: 0,

        // overrides
        customProviderFeePercent: null as any,
        customFixedFee: null as any,

        // custom provider label
        customProviderLabel: "" as any,

        // volume defaults (aligned with ResultsCard tier model)
        volumeOn: false as any,
        volumeTxPerMonth: 1 as any,
        volumeRefundRatePct: 0 as any,
        volumeTiers: [{ id: "t1", sharePct: 100, price: 10, fxPercent: 0 }] as any,
      } as any),
    },
  ]);

  // ✅ IMPORTANT: ResultsCard expects `presetId?: PresetId` (undefined, not null)
  const [presetIdByScenario, setPresetIdByScenario] = useState<Record<string, PresetId | undefined>>({
    s1: undefined,
  });

  const [touchedByScenario, setTouchedByScenario] = useState<Record<string, TouchMap>>({
    s1: {},
  });

  // Used to prevent clearing preset when InputsCard triggers applyPreset
  const suppressPresetClearRef = useRef(false);

  // Apply URL params ONLY to Scenario 1 (run once on mount)
  useEffect(() => {
    const base0: CalcState = normalizeState({
      ...DEFAULT_STATE,
      pricingId: defaultPricingId,

      customProviderFeePercent: null as any,
      customFixedFee: null as any,
      customProviderLabel: "" as any,

      // volume defaults
      volumeOn: false as any,
      volumeTxPerMonth: 1 as any,
      volumeRefundRatePct: 0 as any,
      volumeTiers: [{ id: "t1", sharePct: 100, price: 10, fxPercent: 0 }] as any,
    } as any);

    const urlParams = new URLSearchParams(sp.toString());
    const next0 = normalizeState(applySearchParamsToState(base0, urlParams));

    const options = PRICING[next0.region];
    const tierOk = options.some((o) => o.id === next0.pricingId);
    const pricingId = tierOk ? next0.pricingId : options[0].id;

    let fxPercent = Number(next0.fxPercent) || 0;
    const fxLegacyOn = urlParams.has("fx") && (urlParams.get("fx") === "1" || urlParams.get("fx") === "true");
    if (fxLegacyOn && fxPercent <= 0) fxPercent = next0.region === "US" ? 1 : 2;

    const fixedNext: CalcState = normalizeState({
      ...next0,
      pricingId,
      fxPercent,
    });

    setScenarios((prev) => {
      const copy = [...prev];
      copy[0] = { ...copy[0], state: fixedNext };
      return copy;
    });

    setPresetIdByScenario((m) => ({ ...m, s1: undefined }));
    setTouchedByScenario((m) => ({ ...m, s1: {} }));

    // ✅ PostHog: initial load from URL (one-off)
    phCapture("calculator_loaded", {
      source: urlParams.toString() ? "url_params" : "defaults",
      region: fixedNext.region,
      provider_id: String((fixedNext.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId),
      mode: fixedNext.mode === "reverse" ? "reverse" : "forward",
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ PostHog: view (deduped)
  const viewedOnceRef = useRef(false);
  useEffect(() => {
    if (viewedOnceRef.current) return;
    viewedOnceRef.current = true;
    phCapture("calculator_viewed", { path: pathname }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ✅ Sync ACTIVE scenario -> URL (debounced) — no dependency on `active` variable
  useEffect(() => {
    const sc = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
    const sA = sc?.state;
    if (!sA) return;

    const timeout = window.setTimeout(() => {
      const normalized = normalizeState(sA);
      const next = stateToSearchParams(normalized);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [activeId, scenarios, pathname, router]);

  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];

  function markTouched(id: string, patch: Partial<CalcState>) {
    const keys = Object.keys(patch) as Array<keyof CalcState>;
    const touchKeys: (keyof TouchMap)[] = [];

    for (const k of keys) {
      if (k === "providerId" || k === "productId") continue;

      if (
        k === "fxPercent" ||
        k === "platformFeePercent" ||
        k === "platformFeeBase" ||
        k === "vatPercent" ||
        k === "roundingStep" ||
        k === "psychPriceOn" ||
        k === "pricingId" ||
        k === "mode" ||
        k === "breakEvenOn" ||
        k === "breakEvenTargetNet" ||
        k === "sensitivityOn" ||
        k === "sensitivityDeltaPct" ||
        k === "sensitivityTarget" ||
        (k as any) === "customProviderFeePercent" ||
        (k as any) === "customFixedFee" ||
        (k as any) === "customProviderLabel" ||
        // ✅ Volume projections
        (k as any) === "volumeOn" ||
        (k as any) === "volumeTxPerMonth" ||
        (k as any) === "volumeRefundRatePct" ||
        (k as any) === "volumeTiers"
      ) {
        touchKeys.push(k as any);
      }
    }

    if (!touchKeys.length) return;

    setTouchedByScenario((m) => {
      const prev = m[id] ?? {};
      const next: TouchMap = { ...prev };
      for (const tk of touchKeys) next[tk] = true;
      return { ...m, [id]: next };
    });
  }

  function updateActive(patch: Partial<CalcState>, meta?: { source?: "user" | "model" | "preset" }) {
    if (!suppressPresetClearRef.current && meta?.source !== "model" && meta?.source !== "preset") {
      setPresetIdByScenario((m) => ({ ...m, [active.id]: undefined }));
    }

    if (meta?.source !== "model") {
      markTouched(active.id, patch);
    }

    setScenarios((prev) =>
      prev.map((sc) => {
        if (sc.id !== active.id) return sc;
        const merged = normalizeState({ ...sc.state, ...patch });
        return { ...sc, state: merged };
      })
    );
  }

  function setRegionSafe(r: Region) {
    const curr = normalizeState(active.state);
    const nextOptions = PRICING[r];
    const pricingOk = nextOptions.some((o) => o.id === curr.pricingId);

    // ✅ PostHog
    phCapture("calc_region_change", {
      scenario_id: active.id,
      from: curr.region,
      to: r,
    });

    updateActive(
      {
        region: r,
        pricingId: pricingOk ? curr.pricingId : nextOptions[0].id,
      },
      { source: "user" }
    );
  }

  function applyModelChangeNormalization(params: { scenarioId: string; prev: CalcState; next: CalcState; presetId?: PresetId | undefined }) {
    const { scenarioId, prev, next, presetId } = params;

    const prevN = normalizeState(prev);
    const nextN = normalizeState(next);

    const modelChanged =
      String(prevN.providerId ?? "") !== String(nextN.providerId ?? "") ||
      String(prevN.productId ?? "") !== String(nextN.productId ?? "");

    if (!modelChanged) return { nextState: nextN };

    const providerId = (nextN.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;
    const provider = getProvider(providerId);
    const productId = String(nextN.productId ?? "");
    const product = provider.products?.find((p) => p.id === productId) ?? provider.products?.[0];

    const policy = getUiPolicy({
      providerId,
      productId,
      product,
      providerLabel: provider.label,
      productLabel: product?.label,
      mode: nextN.mode === "reverse" ? "reverse" : "forward",
      // ✅ pass state so policy can react (custom warnings / override banners / etc.)
      state: nextN,
    }) as any;

    const touch = touchedByScenario[scenarioId] ?? {};

    const canApplyStarter = !presetId;
    const starter = (policy?.starterDefaults ?? {}) as Partial<CalcState>;
    const patch: Partial<CalcState> = {};

    const nextKind = policy?.context?.kind;
    const isConnectLike = nextKind === "connect";

    if (isConnectLike) {
      if (!touch.breakEvenOn) patch.breakEvenOn = false;
      if (!touch.sensitivityOn) patch.sensitivityOn = false;

      if (!touch.sensitivityDeltaPct && isDefaultish(prevN, "sensitivityDeltaPct")) patch.sensitivityDeltaPct = 1 as any;
      if (!touch.sensitivityTarget && isDefaultish(prevN, "sensitivityTarget")) patch.sensitivityTarget = "all" as any;
    }

    if (canApplyStarter) {
      if (!touch.platformFeePercent && isDefaultish(prevN, "platformFeePercent")) {
        if (typeof starter.platformFeePercent === "number") patch.platformFeePercent = clampPct(starter.platformFeePercent);
      }

      if (!touch.platformFeeBase && isDefaultish(prevN, "platformFeeBase")) {
        if (starter.platformFeeBase === "gross" || starter.platformFeeBase === "afterStripe") patch.platformFeeBase = starter.platformFeeBase;
      }

      if (!touch.fxPercent && isDefaultish(prevN, "fxPercent")) {
        if (typeof starter.fxPercent === "number") patch.fxPercent = clampPct(starter.fxPercent);
      }

      if (!touch.mode && isDefaultish(prevN, "mode")) {
        if (starter.mode === "forward" || starter.mode === "reverse") patch.mode = starter.mode;
      }

      if (!isConnectLike) {
        if (!touch.breakEvenOn && isDefaultish(prevN, "breakEvenOn")) {
          if (typeof starter.breakEvenOn === "boolean") patch.breakEvenOn = starter.breakEvenOn;
        }

        if (!touch.breakEvenTargetNet && isDefaultish(prevN, "breakEvenTargetNet")) {
          if (typeof starter.breakEvenTargetNet === "number") patch.breakEvenTargetNet = starter.breakEvenTargetNet;
        }

        if (!touch.sensitivityOn && isDefaultish(prevN, "sensitivityOn")) {
          if (typeof starter.sensitivityOn === "boolean") patch.sensitivityOn = starter.sensitivityOn;
        }

        if (!touch.sensitivityDeltaPct && isDefaultish(prevN, "sensitivityDeltaPct")) {
          if (typeof starter.sensitivityDeltaPct === "number") patch.sensitivityDeltaPct = clampPct(starter.sensitivityDeltaPct) as any;
        }

        if (!touch.sensitivityTarget && isDefaultish(prevN, "sensitivityTarget")) {
          const v = (starter.sensitivityTarget as any) ?? null;
          if (v === "all" || v === "stripe" || v === "fx" || v === "platform") patch.sensitivityTarget = v;
        }
      }
    }

    const nextState = normalizeState({ ...nextN, ...patch });
    return { nextState };
  }

  function updateActiveModel(patch: Partial<CalcState>) {
    const prevN = normalizeState(active.state);

    // ✅ PostHog: model changes (provider/product)
    if (patch.providerId != null) {
      const nextProvider = String(patch.providerId ?? "");
      const prevProvider = String(prevN.providerId ?? DEFAULT_PROVIDER_ID);
      if (nextProvider && nextProvider !== prevProvider) {
        phCapture("calc_provider_change", {
          scenario_id: active.id,
          from: prevProvider,
          to: nextProvider,
        });
      }
    }
    if (patch.productId != null) {
      const nextProd = String(patch.productId ?? "");
      const prevProd = String(prevN.productId ?? "");
      if (nextProd !== prevProd) {
        phCapture("calc_product_change", {
          scenario_id: active.id,
          provider_id: String(patch.providerId ?? prevN.providerId ?? DEFAULT_PROVIDER_ID),
          from: prevProd,
          to: nextProd,
        });
      }
    }

    setScenarios((prev) =>
      prev.map((sc) => {
        if (sc.id !== active.id) return sc;

        const prevState = sc.state;
        const merged = normalizeState({ ...sc.state, ...patch });

        const { nextState } = applyModelChangeNormalization({
          scenarioId: sc.id,
          prev: prevState,
          next: merged,
          presetId: presetIdByScenario[sc.id],
        });

        return { ...sc, state: nextState };
      })
    );

    setPresetIdByScenario((m) => ({ ...m, [active.id]: undefined }));
  }

  function nextScenarioName(prev: Scenario[]) {
    const used = new Set(prev.map((s) => s.name));
    for (let n = 1; n <= 99; n++) {
      const candidate = `Scenario ${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `Scenario ${prev.length + 1}`;
  }

  function addScenario() {
    const id = uid();

    phCapture("calc_scenario_add", {
      from_scenario_id: activeId,
      next_count: Math.min(3, scenarios.length + 1),
    });

    setPresetIdByScenario((m) => ({
      ...m,
      [id]: m[activeId] ?? undefined,
    }));

    setTouchedByScenario((m) => ({
      ...m,
      [id]: m[activeId] ?? {},
    }));

    setScenarios((prev) => {
      if (prev.length >= 3) return prev;

      const clone = prev.find((x) => x.id === activeId)?.state ?? prev[0].state;

      return [
        ...prev,
        {
          id,
          name: nextScenarioName(prev),
          state: normalizeState({ ...clone }),
        },
      ];
    });
  }

  function removeScenario(id: string) {
    phCapture("calc_scenario_remove", {
      scenario_id: id,
      was_active: activeId === id,
      next_count: Math.max(1, scenarios.length - 1),
    });

    setScenarios((prev) => {
      if (prev.length <= 1) return prev;

      const next = prev.filter((s) => s.id !== id);

      if (activeId === id) setActiveId(next[0].id);

      return next;
    });

    setPresetIdByScenario((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });

    setTouchedByScenario((m) => {
      const copy = { ...m };
      delete copy[id];
      return copy;
    });
  }

  const computedByScenario = useMemo(() => {
    return scenarios.map((sc) => {
      const s = normalizeState(sc.state);
      const base = computeForState(s);
      const breakEven = computeBreakEven(s);
      const sensitivity = computeSensitivity(s);

      const customPct = (s as any).customProviderFeePercent as number | null;
      const customFixed = (s as any).customFixedFee as number | null;

      const volume = computeVolumeProjections(
        s,
        { symbol: base.symbol, gross: base.gross, stripeFee: base.stripeFee, platformFee: base.platformFee },
        { pct: customPct, fixed: customFixed }
      );

      return {
        scenario: sc,
        ...base,
        breakEven,
        sensitivity,
        volume,
      };
    });
  }, [scenarios]);

  const activeComputed = computedByScenario.find((c) => c.scenario.id === active.id) ?? computedByScenario[0];

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const sN = normalizeState(active.state);
    const q = stateToSearchParams(sN);
    return `${window.location.origin}${pathname}?${q.toString()}`;
  }, [active.state, pathname]);

  // ✅ NEW: per-scenario share links (Scenario 1/2/3)
  const scenarioUrls = useMemo(() => {
    if (typeof window === "undefined") return {};

    const origin = window.location.origin;
    const map: Record<string, string> = {};

    for (const sc of scenarios) {
      const sN = normalizeState(sc.state);
      const q = stateToSearchParams(sN);
      map[sc.id] = `${origin}${pathname}?${q.toString()}`;
    }

    return map;
  }, [scenarios, pathname]);

  // ✅ UPDATED: put ADVANCED TOOLS header as its own block (always after RESULTS),
  // and ensure Volume projections prints Off/On status even when not computable.
  const breakdownText = useMemo(() => {
    const c = activeComputed;
    const s = normalizeState(active.state);

    const providerId = (s.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;
    const provider = getProvider(providerId);
    const productId = String(s.productId ?? "");
    const productLabel = provider.products?.find((p) => p.id === productId)?.label ?? "";

    const customProviderLabel = (s as any).customProviderLabel as string | undefined;
    const providerDisplay =
      providerId === "custom" ? (customProviderLabel?.trim() ? customProviderLabel.trim() : "Custom") : provider.label;

    const providerFeeLabel = providerId === "stripe" ? "Stripe fee" : "Provider fee";

    const modeLine = s.mode === "reverse" ? `Mode: Reverse (target net → required charge)` : `Mode: Forward`;

    const fxEnabled = Number.isFinite(s.fxPercent) && Number(s.fxPercent) > 0;
    const vatLine = Number(s.vatPercent ?? 0) > 0 ? `VAT: ${Number(s.vatPercent).toFixed(2)}%` : `VAT: Off`;

    const customPct = (s as any).customProviderFeePercent as number | null;
    const customFixed = (s as any).customFixedFee as number | null;
    const overrideLine =
      customPct != null || customFixed != null
        ? `Fee overrides: ${customPct != null ? `${customPct.toFixed(2)}%` : "—"} + ${
            customFixed != null ? `${c.symbol}${Number(customFixed).toFixed(2)}` : "—"
          }`
        : `Fee overrides: Off`;

    const toolLines: string[] = [];

    // Break-even lines (no longer prints ADVANCED TOOLS header here)
    if (Boolean(s.breakEvenOn)) {
      if (c.breakEven && c.breakEven.denomOk) {
        toolLines.push(
          `Break-even: ON`,
          `Break-even target net: ${c.symbol}${Number(c.breakEven.targetNet).toFixed(2)}`,
          `Required charge: ${c.symbol}${Number(c.breakEven.requiredCharge).toFixed(2)}`
        );
      } else {
        toolLines.push(`Break-even: ON (invalid/unsolvable with current fees)`);
      }
    } else {
      toolLines.push(`Break-even: Off`);
    }

    // spacer between tools
    toolLines.push(`—`);

    // Fee impact lines
    if (Boolean(s.sensitivityOn)) {
      const sens = c.sensitivity;
      if (sens) {
        const affectedFee =
          sens.target === "all"
            ? "All fees"
            : sens.target === "stripe"
            ? providerId === "stripe"
              ? "Stripe fee"
              : "Provider fee"
            : sens.target === "fx"
            ? "FX fee"
            : "Platform fee";

        toolLines.push(
          `Fee impact: ON`,
          `Affected fee: ${affectedFee}`,
          `Delta: ${Number(sens.deltaPct).toFixed(2)}%`,
          `Base net (before VAT): ${c.symbol}${Number(sens.baseNet).toFixed(2)}`,
          `Net if fees increase: ${c.symbol}${Number(sens.netUp).toFixed(2)}`,
          `Net if fees decrease: ${c.symbol}${Number(sens.netDown).toFixed(2)}`
        );
      } else {
        toolLines.push(`Fee impact: ON (no result)`);
      }
    } else {
      toolLines.push(`Fee impact: Off`);
    }

    // spacer between tools
    toolLines.push(`—`);

    // Volume projections lines (show Off/On status even if not computable)
    const vol = (c as any).volume as ReturnType<typeof computeVolumeProjections> | null;

    const volumeOn = Boolean((s as any).volumeOn);
    const txPerMonth = Number((s as any).volumeTxPerMonth ?? 0);
    const tiers = (((s as any).volumeTiers ?? []) as VolumeTier[]).filter(Boolean);

    const volLines: string[] = [];

    if (!volumeOn) {
      volLines.push(`Volume projections: Off`);
    } else if (!vol) {
      const why =
        txPerMonth <= 0 ? "Tx/month must be greater than 0" : tiers.length === 0 ? "Add at least one basket tier" : "Check basket tier shares/prices";

      volLines.push(`Volume projections: On (incomplete — ${why})`);
    } else {
      volLines.push(
        `Volume projections: ON`,
        `Tx/month: ${vol.txPerMonth}`,
        `Refund rate: ${vol.refundRatePct.toFixed(2)}%`,
        `Monthly gross: ${vol.symbol}${vol.monthlyGross.toFixed(2)}`,
        `${providerFeeLabel} (monthly): ${vol.symbol}${vol.monthlyProviderFee.toFixed(2)}`,
        `FX fee (monthly): ${vol.symbol}${vol.monthlyFxFee.toFixed(2)}`,
        `Platform fee (monthly): ${vol.symbol}${vol.monthlyPlatformFee.toFixed(2)}`,
        `Net before refunds (monthly): ${vol.symbol}${vol.monthlyNetBeforeRefunds.toFixed(2)}`,
        `Refund loss (monthly): ${vol.symbol}${vol.monthlyRefundLoss.toFixed(2)}`,
        `Net after refunds (monthly): ${vol.symbol}${vol.monthlyNetAfterRefunds.toFixed(2)}`
      );
    }

    // ✅ Always render Advanced Tools block after RESULTS
    const advancedToolsBlock: string[] = [`-----------------------------------`, `ADVANCED TOOLS`, ...toolLines, ...volLines];

    return [
      `PriceIQ`,
      `See the real cost of getting paid.`,
      `-----------------------------------`,
      `INPUTS`,
      `Scenario: ${active.name}`,
      `Provider: ${providerDisplay}${productLabel ? ` / ${productLabel}` : ""}`,
      `Region: ${s.region}`,
      `Tier: ${providerId === "stripe" ? c.pricingTierLabel : "Off"}`,
      modeLine,
      `FX: ${fxEnabled ? `${s.fxPercent}%` : "Off"}`,
      `Platform fee: ${s.platformFeePercent}% (${s.platformFeeBase === "gross" ? "from gross" : "after provider"})`,
      vatLine,
      `Rounding: ${s.roundingStep}${s.psychPriceOn ? " + psych pricing" : ""}`,
      overrideLine,
      `-----------------------------------`,
      `RESULTS`,
      `Charge: ${c.symbol}${c.gross.toFixed(2)}`,
      `${providerFeeLabel}: ${c.symbol}${c.stripeFee.toFixed(2)}`,
      `FX fee: ${c.symbol}${c.fxFee.toFixed(2)}`,
      `Platform fee: ${c.symbol}${c.platformFee.toFixed(2)}`,
      `Net (before VAT): ${c.symbol}${c.net.toFixed(2)}`,
      `VAT amount: ${c.symbol}${c.vatAmount.toFixed(2)}`,
      `Net (after VAT): ${c.symbol}${c.netAfterVat.toFixed(2)}`,
      ...advancedToolsBlock,
    ].join("\n");
  }, [activeComputed, active]);

  const csvRows = useMemo(() => {
    const c = activeComputed;
    const s = normalizeState(active.state);

    const providerId = (s.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;

    // Stripe-only tier name; all others should be "Off"
    const tierValue = providerId === "stripe" ? String(c.pricingTierLabel ?? "") : "Off";

    // Provider/product display (match your breakdownText logic)
    const provider = getProvider(providerId);
    const productId = String(s.productId ?? "");
    const productLabel = provider.products?.find((p) => p.id === productId)?.label ?? "";

    const customProviderLabel = (s as any).customProviderLabel as string | undefined;
    const providerDisplay =
      providerId === "custom" ? (customProviderLabel?.trim() ? customProviderLabel.trim() : "Custom") : provider.label;

    const customPct = (s as any).customProviderFeePercent as number | null;
    const customFixed = (s as any).customFixedFee as number | null;

    const feeOverridesOn = customPct != null || customFixed != null;

    // --- Base always-present rows (use 0 / Off when not used) ---
    const rows: Array<{ label: string; value: string }> = [
      // Context
      { label: "app", value: "PriceIQ" },
      { label: "scenario", value: String(active.name ?? "") },
      { label: "provider_id", value: String(providerId) },
      { label: "provider", value: String(providerDisplay) },
      { label: "product", value: String(productLabel) },
      { label: "custom_provider_label", value: providerId === "custom" ? (customProviderLabel ?? "").trim() : "" },
      { label: "region", value: String(s.region ?? "") },
      { label: "mode", value: s.mode === "reverse" ? "reverse" : "forward" },
      { label: "tier", value: tierValue },
      { label: "currency_symbol", value: String(c.symbol ?? "") },

      // Controls / Inputs
      { label: "fx_percent", value: `${Number(s.fxPercent ?? 0).toFixed(2)}` },
      { label: "platform_fee_percent", value: `${Number(s.platformFeePercent ?? 0).toFixed(2)}` },
      { label: "platform_fee_base", value: String(s.platformFeeBase ?? "gross") },
      { label: "vat_percent", value: `${Number(s.vatPercent ?? 0).toFixed(2)}` },
      { label: "rounding_step", value: String(s.roundingStep ?? "") },
      { label: "psych_pricing_on", value: Boolean(s.psychPriceOn) ? "On" : "Off" },

      // Fee overrides (explicit On/Off + values)
      { label: "fee_overrides_on", value: feeOverridesOn ? "On" : "Off" },
      { label: "override_percent", value: customPct == null ? "0" : `${customPct.toFixed(2)}` },
      { label: "override_fixed", value: customFixed == null ? "0" : `${Number(customFixed).toFixed(2)}` },

      // Results (per transaction) — keep numeric values consistent for wide CSV
      { label: "charge", value: `${c.symbol}${c.gross.toFixed(2)}` },

      // Emit BOTH keys so ActionsBar can always fill provider_fee cleanly
      { label: "stripe_fee", value: providerId === "stripe" ? `${c.symbol}${c.stripeFee.toFixed(2)}` : `${c.symbol}0.00` },
      { label: "provider_fee", value: providerId === "stripe" ? `${c.symbol}0.00` : `${c.symbol}${c.stripeFee.toFixed(2)}` },

      { label: "fx_fee", value: `${c.symbol}${c.fxFee.toFixed(2)}` },
      { label: "platform_fee", value: `${c.symbol}${c.platformFee.toFixed(2)}` },
      { label: "net_before_vat", value: `${c.symbol}${c.net.toFixed(2)}` },
      { label: "vat_amount", value: `${c.symbol}${c.vatAmount.toFixed(2)}` },
      { label: "net_after_vat", value: `${c.symbol}${c.netAfterVat.toFixed(2)}` },
    ];

    // --- Break-even (always include fields; fill 0/Off when unused) ---
    if (Boolean(s.breakEvenOn)) {
      rows.push({ label: "break_even_on", value: "1" });

      if (c.breakEven && c.breakEven.denomOk) {
        rows.push(
          { label: "break_even_target_net", value: `${c.symbol}${Number(c.breakEven.targetNet).toFixed(2)}` },
          { label: "break_even_required_charge", value: `${c.symbol}${Number(c.breakEven.requiredCharge).toFixed(2)}` },
          { label: "break_even_solvable", value: "1" }
        );
      } else {
        rows.push(
          { label: "break_even_target_net", value: `${c.symbol}0.00` },
          { label: "break_even_required_charge", value: `${c.symbol}0.00` },
          { label: "break_even_solvable", value: "0" }
        );
      }
    } else {
      rows.push(
        { label: "break_even_on", value: "0" },
        { label: "break_even_target_net", value: `${c.symbol}0.00` },
        { label: "break_even_required_charge", value: `${c.symbol}0.00` },
        { label: "break_even_solvable", value: "0" }
      );
    }

    // --- Fee impact (always include fields; fill defaults when unused) ---
    if (Boolean(s.sensitivityOn) && c.sensitivity) {
      const sens = c.sensitivity;

      const affectedFee =
        sens.target === "all"
          ? "all"
          : sens.target === "stripe"
          ? providerId === "stripe"
            ? "stripe"
            : "provider"
          : sens.target === "fx"
          ? "fx"
          : "platform";

      rows.push(
        { label: "fee_impact_on", value: "1" },
        { label: "fee_impact_affected_fee", value: affectedFee },
        { label: "fee_impact_delta_pct", value: `${Number(sens.deltaPct).toFixed(2)}` },
        { label: "fee_impact_base_net", value: `${c.symbol}${Number(sens.baseNet).toFixed(2)}` },
        { label: "fee_impact_net_up", value: `${c.symbol}${Number(sens.netUp).toFixed(2)}` },
        { label: "fee_impact_net_down", value: `${c.symbol}${Number(sens.netDown).toFixed(2)}` }
      );
    } else {
      rows.push(
        { label: "fee_impact_on", value: "0" },
        { label: "fee_impact_affected_fee", value: "off" },
        { label: "fee_impact_delta_pct", value: "0" },
        { label: "fee_impact_base_net", value: `${c.symbol}0.00` },
        { label: "fee_impact_net_up", value: `${c.symbol}0.00` },
        { label: "fee_impact_net_down", value: `${c.symbol}0.00` }
      );
    }

    // --- Volume projections (always include inputs; include outputs if computed; else 0s) ---
    const volumeOn = Boolean((s as any).volumeOn);
    const volumeTxPerMonth = Number((s as any).volumeTxPerMonth ?? 0);
    const volumeRefundRatePct = Number((s as any).volumeRefundRatePct ?? 0);
    const volumeTiers = (((s as any).volumeTiers ?? []) as VolumeTier[]).filter(Boolean);

    rows.push(
      { label: "volume_on", value: volumeOn ? "1" : "0" },
      { label: "volume_tx_per_month", value: String(Number.isFinite(volumeTxPerMonth) ? Math.round(volumeTxPerMonth) : 0) },
      { label: "volume_refund_rate_pct", value: `${Number.isFinite(volumeRefundRatePct) ? volumeRefundRatePct.toFixed(2) : "0.00"}` },
      { label: "volume_tiers_json", value: JSON.stringify(volumeTiers ?? []) }
    );

    // Keep monthly outputs stable even when off/incomplete
    const vol = (c as any).volume as ReturnType<typeof computeVolumeProjections> | null;
    if (vol) {
      rows.push(
        { label: "volume_monthly_gross", value: `${vol.symbol}${vol.monthlyGross.toFixed(2)}` },
        { label: "volume_monthly_provider_fee", value: `${vol.symbol}${vol.monthlyProviderFee.toFixed(2)}` },
        { label: "volume_monthly_fx_fee", value: `${vol.symbol}${vol.monthlyFxFee.toFixed(2)}` },
        { label: "volume_monthly_platform_fee", value: `${vol.symbol}${vol.monthlyPlatformFee.toFixed(2)}` },
        { label: "volume_monthly_net_before_refunds", value: `${vol.symbol}${vol.monthlyNetBeforeRefunds.toFixed(2)}` },
        { label: "volume_monthly_refund_loss", value: `${vol.symbol}${vol.monthlyRefundLoss.toFixed(2)}` },
        { label: "volume_monthly_net_after_refunds", value: `${vol.symbol}${vol.monthlyNetAfterRefunds.toFixed(2)}` }
      );
    } else {
      rows.push(
        { label: "volume_monthly_gross", value: `${c.symbol}0.00` },
        { label: "volume_monthly_provider_fee", value: `${c.symbol}0.00` },
        { label: "volume_monthly_fx_fee", value: `${c.symbol}0.00` },
        { label: "volume_monthly_platform_fee", value: `${c.symbol}0.00` },
        { label: "volume_monthly_net_before_refunds", value: `${c.symbol}0.00` },
        { label: "volume_monthly_refund_loss", value: `${c.symbol}0.00` },
        { label: "volume_monthly_net_after_refunds", value: `${c.symbol}0.00` }
      );
    }

    return rows;
  }, [activeComputed, active.state, active.name]);

  const compareRows = useMemo(
    () =>
      computedByScenario.map((c) => ({
        id: c.scenario.id,
        name: c.scenario.name,
        symbol: c.symbol,
        gross: c.gross,
        stripeFee: c.stripeFee,
        fxFee: c.fxFee,
        platformFee: c.platformFee,
        net: c.net,
      })),
    [computedByScenario]
  );

  const activeStateN = normalizeState(active.state);
  const activeProviderId = (activeStateN.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;

  const providerMeta = useMemo(() => {
    const provider = getProvider(activeProviderId);
    const productId = String(activeStateN.productId ?? "");
    const product = provider.products?.find((p) => p.id === productId) ?? provider.products?.[0];

    const customProviderLabel = (activeStateN as any).customProviderLabel as string | undefined;

    const providerLabel =
      activeProviderId === "custom" ? (customProviderLabel?.trim() ? customProviderLabel.trim() : "Custom") : provider.label;

    return {
      providerLabel,
      productLabel: product?.label ?? "",
    };
  }, [activeProviderId, activeStateN.productId, (activeStateN as any).customProviderLabel]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id !== activeId) {
                  phCapture("calc_scenario_switch", {
                    from: activeId,
                    to: s.id,
                    scenario_count: scenarios.length,
                  });
                }
                setActiveId(s.id);
              }}
              className={[
                "rounded-full border px-3 py-1.5 text-xs transition",
                s.id === activeId ? "border-white/15 bg-white/10 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/8",
              ].join(" ")}
            >
              {s.name}
            </button>
          ))}

          {scenarios.length < 3 ? (
            <button
              type="button"
              onClick={addScenario}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8"
            >
              + Add scenario
            </button>
          ) : null}

          {scenarios.length > 1 ? (
            <button
              type="button"
              onClick={() => removeScenario(activeId)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8"
            >
              Remove active
            </button>
          ) : null}
        </div>

        <ActionsBar shareUrl={shareUrl} copyText={breakdownText} csvRows={csvRows} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InputsCard
          key={`inputs-${active.id}`} // ✅ CRITICAL: remount inputs when switching scenario
          activePresetId={presetIdByScenario[active.id] ?? null}
          setActivePresetId={(id) => {
            // ✅ PostHog: preset apply / clear (high signal)
            if (id !== null) {
              phCapture("calc_preset_apply", { scenario_id: active.id, preset_id: String(id) });
              suppressPresetClearRef.current = true;
              queueMicrotask(() => {
                suppressPresetClearRef.current = false;
              });
            } else {
              phCapture("calc_preset_clear", { scenario_id: active.id });
            }

            setPresetIdByScenario((m) => ({
              ...m,
              [active.id]: id ?? undefined,
            }));
          }}
          providerId={activeProviderId}
          setProviderId={(id) => updateActiveModel({ providerId: id })}
          productId={String(activeStateN.productId ?? "")}
          setProductId={(id) => updateActiveModel({ productId: id })}
          region={activeStateN.region as Region}
          setRegion={(r) => setRegionSafe(r)}
          options={PRICING[activeStateN.region]}
          pricingId={activeStateN.pricingId}
          setPricingId={(id) => {
            phCapture("calc_pricing_tier_change", {
              scenario_id: active.id,
              provider_id: String(activeProviderId),
              from: String(activeStateN.pricingId ?? ""),
              to: String(id),
            });
            updateActive({ pricingId: id }, { source: "user" });
          }}
          useReverse={activeStateN.mode === "reverse"}
          setUseReverse={(v) => {
            phCapture("calc_mode_change", {
              scenario_id: active.id,
              from: activeStateN.mode === "reverse" ? "reverse" : "forward",
              to: v ? "reverse" : "forward",
            });
            updateActive({ mode: v ? "reverse" : "forward" }, { source: "user" });
          }}
          amount={activeStateN.amount}
          setAmount={(n) => updateActive({ amount: n }, { source: "user" })}
          targetNet={activeStateN.targetNet}
          setTargetNet={(n) => updateActive({ targetNet: n }, { source: "user" })}
          fxPercent={Number(activeStateN.fxPercent ?? 0)}
          setFxPercent={(n) => updateActive({ fxPercent: n }, { source: "user" })}
          platformFeePercent={activeStateN.platformFeePercent}
          setPlatformFeePercent={(n) => updateActive({ platformFeePercent: n }, { source: "user" })}
          vatPercent={Number(activeStateN.vatPercent ?? 0)}
          setVatPercent={(n) => updateActive({ vatPercent: clampPct(n) }, { source: "user" })}
          platformFeeBase={activeStateN.platformFeeBase}
          setPlatformFeeBase={(v) => {
            phCapture("calc_platform_fee_base_change", {
              scenario_id: active.id,
              from: String(activeStateN.platformFeeBase ?? "gross"),
              to: String(v),
            });
            updateActive({ platformFeeBase: v }, { source: "user" });
          }}
          roundingStep={activeStateN.roundingStep}
          setRoundingStep={(v) => {
            phCapture("calc_rounding_change", {
              scenario_id: active.id,
              from: String(activeStateN.roundingStep ?? ""),
              to: String(v),
            });
            updateActive({ roundingStep: v }, { source: "user" });
          }}
          psychPriceOn={Boolean(activeStateN.psychPriceOn)}
          setPsychPriceOn={(v) => {
            phCapture("calc_psych_pricing_toggle", { scenario_id: active.id, on: Boolean(v) });
            updateActive({ psychPriceOn: v }, { source: "user" });
          }}
          breakEvenOn={Boolean(activeStateN.breakEvenOn)}
          setBreakEvenOn={(v) => {
            phCapture("calc_break_even_toggle", { scenario_id: active.id, on: Boolean(v) });
            updateActive({ breakEvenOn: v }, { source: "user" });
          }}
          breakEvenTargetNet={Number(activeStateN.breakEvenTargetNet ?? 0)}
          setBreakEvenTargetNet={(n) => updateActive({ breakEvenTargetNet: n }, { source: "user" })}
          sensitivityOn={Boolean(activeStateN.sensitivityOn)}
          setSensitivityOn={(v) => {
            phCapture("calc_fee_impact_toggle", { scenario_id: active.id, on: Boolean(v) });
            updateActive({ sensitivityOn: v }, { source: "user" });
          }}
          sensitivityDeltaPct={Number(activeStateN.sensitivityDeltaPct ?? 1)}
          setSensitivityDeltaPct={(n) => updateActive({ sensitivityDeltaPct: n }, { source: "user" })}
          sensitivityTarget={(activeStateN.sensitivityTarget ?? "all") as SensitivityTarget}
          setSensitivityTarget={(v) => {
            phCapture("calc_fee_impact_target_change", {
              scenario_id: active.id,
              from: String(activeStateN.sensitivityTarget ?? "all"),
              to: String(v),
            });
            updateActive({ sensitivityTarget: v }, { source: "user" });
          }}
          // ✅ NEW: custom provider display label (only meaningful when providerId === "custom")
          customProviderLabel={((activeStateN as any).customProviderLabel ?? "") as string}
          setCustomProviderLabel={(v: string) => updateActive({ customProviderLabel: String(v ?? "") } as any, { source: "user" })}
          // ✅ provider overrides (InputsCard expects number | null setters)
          customProviderFeePercent={(activeStateN as any).customProviderFeePercent ?? null}
          setCustomProviderFeePercent={(n: number | null) =>
            updateActive({ customProviderFeePercent: n == null ? null : clampPct(n) } as any, { source: "user" })
          }
          customFixedFee={(activeStateN as any).customFixedFee ?? null}
          setCustomFixedFee={(n: number | null) => updateActive({ customFixedFee: n == null ? null : clampMoneyLike(n) } as any, { source: "user" })}
          // ✅ Volume Projections (tier-driven)
          volumeOn={Boolean((activeStateN as any).volumeOn)}
          setVolumeOn={(v) => {
            phCapture("calc_volume_toggle", { scenario_id: active.id, on: Boolean(v) });
            updateActive({ volumeOn: v } as any, { source: "user" });
          }}
          volumeTxPerMonth={Number((activeStateN as any).volumeTxPerMonth ?? 0)}
          setVolumeTxPerMonth={(n: number) =>
            updateActive({ volumeTxPerMonth: Number.isFinite(Number(n)) ? Number(n) : 0 } as any, { source: "user" })
          }
          volumeRefundRatePct={Number((activeStateN as any).volumeRefundRatePct ?? 0)}
          setVolumeRefundRatePct={(n: number) => updateActive({ volumeRefundRatePct: clampPct(n) } as any, { source: "user" })}
          volumeTiers={(((activeStateN as any).volumeTiers ?? []) as unknown) as VolumeTier[]}
          setVolumeTiers={(tiers: VolumeTier[]) => updateActive({ volumeTiers: tiers } as any, { source: "user" })}
        />

        <ResultsCard
          key={`results-${active.id}`} // ✅ recommended: keep ResultsCard in lockstep
          useReverse={activeStateN.mode === "reverse"}
          symbol={activeComputed.symbol}
          gross={activeComputed.gross}
          stripeFee={activeComputed.stripeFee}
          fxFee={activeComputed.fxFee}
          platformFee={activeComputed.platformFee}
          net={activeComputed.net}
          denomOk={activeComputed.denomOk}
          totalPct={activeComputed.totalPct}
          fxDominates={activeComputed.fxDominates}
          nearLimit={activeComputed.nearLimit}
          presetId={presetIdByScenario[active.id]}
          region={activeStateN.region as Region}
          pricingTierLabel={activeComputed.pricingTierLabel}
          platformFeeBase={activeStateN.platformFeeBase}
          roundingStep={activeStateN.roundingStep}
          fxPercent={Number(activeStateN.fxPercent ?? 0)}
          platformFeePercent={activeStateN.platformFeePercent}
          vatPercent={Number(activeStateN.vatPercent ?? 0)}
          vatAmount={activeComputed.vatAmount}
          netAfterVat={activeComputed.netAfterVat}
          breakEven={activeComputed.breakEven}
          sensitivity={activeComputed.sensitivity}
          providerLabel={providerMeta.providerLabel}
          productLabel={providerMeta.productLabel}
          customProviderFeePercent={(activeStateN as any).customProviderFeePercent ?? null}
          customFixedFee={(activeStateN as any).customFixedFee ?? null}
          // ✅ NEW: show custom label in ResultsCard header if you want
          customProviderLabel={((activeStateN as any).customProviderLabel ?? "") as string}
          // ✅ NEW: provider “rate used” (for displaying “X% + Y” beside the provider fee row)
          providerFeePercentUsed={(activeComputed as any).providerFeePercentUsed ?? null}
          providerFixedFeeUsed={(activeComputed as any).providerFixedFeeUsed ?? null}
          // ✅ CRITICAL: pass volume inputs to ResultsCard (it computes projections locally)
          volumeOn={Boolean((activeStateN as any).volumeOn)}
          volumeTxPerMonth={Number((activeStateN as any).volumeTxPerMonth ?? 0)}
          volumeRefundRatePct={Number((activeStateN as any).volumeRefundRatePct ?? 0)}
          volumeTiers={(((activeStateN as any).volumeTiers ?? []) as unknown) as VolumeTier[]}
        />
      </div>

      <ScenarioCompare rows={compareRows} scenarioUrls={scenarioUrls} />
    </div>
  );
}
