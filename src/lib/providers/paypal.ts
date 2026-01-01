// src/lib/providers/paypal.ts
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
 * PayPal fee model (CONFIGURABLE DEFAULTS)
 * ------------------------------------------------------------
 * These are *starter* modelling defaults so your PayPal path produces
 * non-zero fees in forward + reverse mode.
 *
 * Replace with your real PayPal plan numbers later.
 *
 * percent is % of gross, fixed is absolute in settlement currency.
 */
type PayPalRate = { percent: number; fixed: number; label: string };

const PAYPAL_RATES: Record<QuoteInput["region"], Record<string /* productId */, PayPalRate>> = {
  UK: {
    // “Checkout” / “Cards” are modelled similarly by default
    checkout: { percent: 2.9, fixed: 0.3, label: "PayPal Checkout (model)" },
    card_processing: { percent: 2.9, fixed: 0.3, label: "PayPal Cards/PPCP (model)" },
  },
  EU: {
    checkout: { percent: 2.9, fixed: 0.35, label: "PayPal Checkout (model)" },
    card_processing: { percent: 2.9, fixed: 0.35, label: "PayPal Cards/PPCP (model)" },
  },
  US: {
    checkout: { percent: 2.99, fixed: 0.49, label: "PayPal Checkout (model)" },
    card_processing: { percent: 2.99, fixed: 0.49, label: "PayPal Cards/PPCP (model)" },
  },
};

function getPayPalRate(region: QuoteInput["region"], productId?: string): PayPalRate {
  const pid = String(productId ?? "checkout");
  const byRegion = PAYPAL_RATES[region] ?? PAYPAL_RATES.UK;
  return byRegion[pid] ?? byRegion.checkout;
}

/**
 * Reverse solve for gross (customer charge) given target net (before VAT)
 *
 * platformFeeBase:
 * - "gross" => platformFee = gross * plat
 * - "afterStripe" => treat as "after provider fee" for PayPal:
 *      platformFee = (gross - providerFee) * plat
 *
 * providerFee = gross*p + fixed
 * fxFee       = gross*fxp
 */
function grossFromNetPayPal(params: {
  targetNet: number;
  providerPercent: number; // fraction e.g. 0.029
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

export const paypalProvider: Provider = {
  id: "paypal",
  label: "PayPal",
  products: [
    {
      id: "card_processing",
      label: "Cards",
      description: "PayPal card processing (PPCP)",
      ui: {
        // ✅ cards-like: keep Platform/Tax/Tools collapsed by default
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
      id: "checkout",
      label: "Checkout",
      description: "Standard PayPal checkout",
      ui: {
        // ✅ IMPORTANT FIX:
        // Treat Checkout as connect-like so InputsCard auto-expands Platform / Tax / Tools,
        // matching your Stripe Connect behaviour.
        kind: "connect",
        flags: {
          // ✅ Nudge UI to open these sections on selection
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

    const productId = String(input.productId ?? "checkout");
    const rate = getPayPalRate(input.region, productId);

    const vatPercent = clampPct(input.vatPercent ?? 0);
    const vatP = vatPercent / 100;

    const fxPercent = clampPct(input.fxPercent ?? 0);
    const fxp = fxPercent / 100;

    const platformFeePercent = clampPct(input.platformFeePercent ?? 0);
    const plat = platformFeePercent / 100;

    const platformFeeBase = (input.platformFeeBase ?? "gross") as "gross" | "afterStripe";

    // ✅ Overrides (number|null) — if provided, replace model defaults
    const overridePct = (input as any).customProviderFeePercent as number | null | undefined;
    const overrideFixed = (input as any).customFixedFee as number | null | undefined;

    const pctUsed = overridePct != null ? clampPct(overridePct) : clampPct(rate.percent);
    const fixedUsed = overrideFixed != null ? clampMoneyLike(overrideFixed) : clampMoneyLike(rate.fixed);

    const p = pctUsed / 100;

    // Compute gross (customer charge)
    const rawGross =
      input.mode === "reverse"
        ? grossFromNetPayPal({
            targetNet: Number(input.targetNet ?? 0),
            providerPercent: p,
            providerFixed: fixedUsed,
            fxp,
            plat,
            platformFeeBase,
          })
        : Number(input.amount ?? 0);

    const safeGross = Number.isFinite(rawGross) && rawGross >= 0 ? rawGross : NaN;

    // Fees
    const providerFee = Number.isFinite(safeGross) ? safeGross * p + fixedUsed : NaN;
    const fxFee = Number.isFinite(safeGross) ? safeGross * fxp : NaN;

    const platformFee = Number.isFinite(safeGross)
      ? platformFeeBase === "afterStripe"
        ? (safeGross - providerFee) * plat
        : safeGross * plat
      : NaN;

    const netBeforeVat = Number.isFinite(safeGross) ? safeGross - providerFee - fxFee - platformFee : NaN;

    // VAT included in gross (shown separately)
    const vatAmount = Number.isFinite(safeGross) && vatP > 0 ? safeGross * (vatP / (1 + vatP)) : 0;

    const netAfterVat = Number.isFinite(netBeforeVat) ? netBeforeVat - vatAmount : NaN;

    const denomOk = Number.isFinite(safeGross) && safeGross >= 0;

    return {
      symbol,
      gross: denomOk ? safeGross : NaN,
      fees: [
        { key: "provider_fee", label: "PayPal fee", amount: Number.isFinite(providerFee) ? providerFee : 0 },
        { key: "fx_fee", label: "FX fee", amount: Number.isFinite(fxFee) ? fxFee : 0 },
        { key: "platform_fee", label: "Platform fee", amount: Number.isFinite(platformFee) ? platformFee : 0 },
      ],
      netBeforeVat: Number.isFinite(netBeforeVat) ? netBeforeVat : NaN,
      vatPercent,
      vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
      netAfterVat: Number.isFinite(netAfterVat) ? netAfterVat : NaN,
      denomOk,
      meta: {
        provider: "paypal",
        productId,
        rateLabel: rate.label,

        // ✅ report what was used
        providerPercent: pctUsed,
        providerFixed: fixedUsed,

        // ✅ include raw defaults for reference (helps debug)
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
