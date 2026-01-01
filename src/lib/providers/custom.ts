// src/lib/providers/custom.ts
import { PRICING } from "@/lib/pricing";
import type { Provider, QuoteInput, QuoteResult } from "./types";

function clampPct(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function clampMoneyLike(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

function getSymbolFromRegion(region: QuoteInput["region"]) {
  const first = PRICING[region]?.[0];
  return first?.currencySymbol ?? "£";
}

type CustomRate = { percent: number; fixed: number; label: string };

// ✅ Defaults are 0 because Custom is meant to be driven by overrides.
const CUSTOM_RATES: Record<string, CustomRate> = {
  cards: { percent: 0, fixed: 0, label: "Custom Cards (override-driven)" },
  platform: { percent: 0, fixed: 0, label: "Custom Platform (override-driven)" },
};

function getCustomRate(productId?: string): CustomRate {
  const pid = String(productId ?? "cards");
  return CUSTOM_RATES[pid] ?? CUSTOM_RATES.cards;
}

function grossFromNet(params: {
  targetNet: number;
  providerPercent: number; // fraction
  providerFixed: number;
  fxp: number; // fraction
  plat: number; // fraction
  platformFeeBase: "gross" | "afterStripe";
}) {
  const { targetNet, providerPercent: p, providerFixed: fixed, fxp, plat, platformFeeBase } = params;

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

export const customProvider: Provider = {
  id: "custom",
  label: "Custom",
  products: [
    {
      id: "cards",
      label: "Cards",
      description: "Custom provider (override-driven)",
      ui: {
        kind: "cards",
        flags: {
          emphasizePlatform: false,
          emphasizeVat: false,
          emphasizeFx: false,
          emphasizeRounding: false,
          emphasizeTools: false,
        },
        note: "Custom uses your fee overrides. Defaults are 0% + 0.00 unless you override.",
      },
    },
    {
      id: "platform",
      label: "Platform",
      description: "Custom platform/marketplace (override-driven)",
      ui: {
        kind: "connect",
        flags: {
          emphasizePlatform: true,
          emphasizeVat: true,
          emphasizeFx: false,
          emphasizeRounding: false,
          emphasizeTools: true,
        },
        note: "Custom platform uses your fee overrides. Platform fee is separate (your marketplace cut).",
      },
    },
  ],

  quote(input: QuoteInput): QuoteResult {
    const symbol = getSymbolFromRegion(input.region);

    const productId = String(input.productId ?? "cards");
    const rate = getCustomRate(productId);

    const vatPercent = clampPct(input.vatPercent ?? 0);
    const vatP = vatPercent / 100;

    const fxPercent = clampPct(input.fxPercent ?? 0);
    const fxp = fxPercent / 100;

    const platformFeePercent = clampPct(input.platformFeePercent ?? 0);
    const plat = platformFeePercent / 100;

    const platformFeeBase = (input.platformFeeBase ?? "gross") as "gross" | "afterStripe";

    // ✅ Overrides drive Custom.
    const overridePct = (input as any).customProviderFeePercent as number | null | undefined;
    const overrideFixed = (input as any).customFixedFee as number | null | undefined;

    // ✅ If overrides are missing, defaults remain 0/0 (still works, but produces “no provider fee”).
    const pctUsed = overridePct != null ? clampPct(overridePct) : clampPct(rate.percent);
    const fixedUsed = overrideFixed != null ? clampMoneyLike(overrideFixed) : clampMoneyLike(rate.fixed);

    const p = pctUsed / 100;

    const rawGross =
      input.mode === "reverse"
        ? grossFromNet({
            targetNet: Number(input.targetNet ?? 0),
            providerPercent: p,
            providerFixed: fixedUsed,
            fxp,
            plat,
            platformFeeBase,
          })
        : Number(input.amount ?? 0);

    const safeGross = Number.isFinite(rawGross) && rawGross >= 0 ? rawGross : NaN;

    const providerFee = Number.isFinite(safeGross) ? safeGross * p + fixedUsed : NaN;
    const fxFee = Number.isFinite(safeGross) ? safeGross * fxp : NaN;

    const platformFee = Number.isFinite(safeGross)
      ? platformFeeBase === "afterStripe"
        ? (safeGross - providerFee) * plat
        : safeGross * plat
      : NaN;

    const netBeforeVat = Number.isFinite(safeGross) ? safeGross - providerFee - fxFee - platformFee : NaN;

    const vatAmount = Number.isFinite(safeGross) && vatP > 0 ? safeGross * (vatP / (1 + vatP)) : 0;
    const netAfterVat = Number.isFinite(netBeforeVat) ? netBeforeVat - vatAmount : NaN;

    const denomOk = Number.isFinite(safeGross) && safeGross >= 0;

    const customLabelRaw = (input as any).customProviderLabel as string | undefined;
    const customProviderLabel = typeof customLabelRaw === "string" ? customLabelRaw.trim() : "";

    return {
      symbol,
      gross: denomOk ? safeGross : NaN,
      fees: [
        { key: "provider_fee", label: "Custom provider fee", amount: Number.isFinite(providerFee) ? providerFee : 0 },
        { key: "fx_fee", label: "FX fee", amount: Number.isFinite(fxFee) ? fxFee : 0 },
        { key: "platform_fee", label: "Platform fee", amount: Number.isFinite(platformFee) ? platformFee : 0 },
      ],
      netBeforeVat: Number.isFinite(netBeforeVat) ? netBeforeVat : NaN,
      vatPercent,
      vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
      netAfterVat: Number.isFinite(netAfterVat) ? netAfterVat : NaN,
      denomOk,
      meta: {
        provider: "custom",
        productId,
        rateLabel: rate.label,

        // ✅ display (UI can read this if desired)
        customProviderLabel,

        // ✅ used
        providerPercent: pctUsed,
        providerFixed: fixedUsed,

        // defaults
        providerPercentDefault: rate.percent,
        providerFixedDefault: rate.fixed,

        fxPercent,
        platformFeePercent,
        platformFeeBase: platformFeeBase === "afterStripe" ? "after_provider_fee" : "gross",
        overridesOn: overridePct != null || overrideFixed != null,
        requiresOverrides: true,
      },
    };
  },
};
