// src/lib/providers/checkoutcom.ts
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
  return v;
}

function getSymbolFromRegion(region: QuoteInput["region"]) {
  const first = PRICING[region]?.[0];
  return first?.currencySymbol ?? "£";
}

/**
 * Checkout.com fee model (CONFIGURABLE DEFAULTS)
 * ------------------------------------------------------------
 * Starter modelling defaults so Checkout.com path produces non-zero fees
 * in forward + reverse mode.
 *
 * Replace with your real Checkout.com plan numbers later.
 *
 * percent is % of gross, fixed is absolute in settlement currency.
 */
type CkoRate = { percent: number; fixed: number; label: string };

const CHECKOUTCOM_RATES: Record<QuoteInput["region"], Record<string /* productId */, CkoRate>> = {
  UK: {
    cards: { percent: 1.7, fixed: 0.2, label: "Checkout.com Cards (model)" },
    marketplace: { percent: 2.0, fixed: 0.25, label: "Checkout.com Marketplace (model)" },
  },
  EU: {
    cards: { percent: 1.8, fixed: 0.25, label: "Checkout.com Cards (model)" },
    marketplace: { percent: 2.1, fixed: 0.3, label: "Checkout.com Marketplace (model)" },
  },
  US: {
    cards: { percent: 2.4, fixed: 0.3, label: "Checkout.com Cards (model)" },
    marketplace: { percent: 2.7, fixed: 0.35, label: "Checkout.com Marketplace (model)" },
  },
};

function getCkoRate(region: QuoteInput["region"], productId?: string): CkoRate {
  const pid = String(productId ?? "cards");
  const byRegion = CHECKOUTCOM_RATES[region] ?? CHECKOUTCOM_RATES.UK;
  return byRegion[pid] ?? byRegion.cards;
}

/**
 * Reverse solve for gross (customer charge) given target net (before VAT)
 *
 * platformFeeBase:
 * - "gross" => platformFee = gross * plat
 * - "afterStripe" => treat as "after provider fee" for Checkout.com:
 *      platformFee = (gross - providerFee) * plat
 *
 * providerFee = gross*p + fixed
 * fxFee       = gross*fxp
 */
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

export const checkoutComProvider: Provider = {
  id: "checkoutcom",
  label: "Checkout.com",
  products: [
    {
      id: "cards",
      label: "Cards",
      description: "Checkout.com card processing (model)",
      ui: {
        kind: "cards",
        flags: {
          emphasizePlatform: false,
          emphasizeVat: false,
          emphasizeFx: false,
          emphasizeRounding: false,
          emphasizeTools: false,
        },
      },
    },
    {
      id: "marketplace",
      label: "Marketplace",
      description: "Checkout.com marketplace/platforms (model)",
      ui: {
        kind: "connect",
        flags: {
          emphasizePlatform: true,
          emphasizeVat: true,
          emphasizeFx: false,
          emphasizeRounding: false,
          emphasizeTools: true,
        },
      },
    },
  ],

  quote(input: QuoteInput): QuoteResult {
    const symbol = getSymbolFromRegion(input.region);

    const productId = String(input.productId ?? "cards");
    const rate = getCkoRate(input.region, productId);

    const vatPercent = clampPct(input.vatPercent ?? 0);
    const vatP = vatPercent / 100;

    const fxPercent = clampPct(input.fxPercent ?? 0);
    const fxp = fxPercent / 100;

    const platformFeePercent = clampPct(input.platformFeePercent ?? 0);
    const plat = platformFeePercent / 100;

    const platformFeeBase = (input.platformFeeBase ?? "gross") as "gross" | "afterStripe";

    // ✅ Overrides (number|null)
    const overridePct = (input as any).customProviderFeePercent as number | null | undefined;
    const overrideFixed = (input as any).customFixedFee as number | null | undefined;

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

    return {
      symbol,
      gross: denomOk ? safeGross : NaN,
      fees: [
        {
          key: "provider_fee",
          label: "Checkout.com fee",
          amount: Number.isFinite(providerFee) ? providerFee : 0,
        },
        { key: "fx_fee", label: "FX fee", amount: Number.isFinite(fxFee) ? fxFee : 0 },
        { key: "platform_fee", label: "Platform fee", amount: Number.isFinite(platformFee) ? platformFee : 0 },
      ],
      netBeforeVat: Number.isFinite(netBeforeVat) ? netBeforeVat : NaN,
      vatPercent,
      vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
      netAfterVat: Number.isFinite(netAfterVat) ? netAfterVat : NaN,
      denomOk,
      meta: {
        provider: "checkoutcom",
        productId,
        rateLabel: rate.label,

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
      },
    };
  },
};
