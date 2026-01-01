// src/lib/providers/stripe.ts

import { PRICING } from "@/lib/pricing";
import type { Provider, QuoteInput, QuoteResult } from "./types";

function clampPct(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function getSymbolFromRegion(region: QuoteInput["region"]) {
  // Use your existing PRICING table to pull a symbol.
  const first = PRICING[region]?.[0];
  return first?.currencySymbol ?? "£";
}

/**
 * ✅ STUB IMPLEMENTATION
 * - returns 0 fees and echoes the gross/target in a predictable way
 * - keeps VAT fields wired so your UI can adopt it later
 */
export const stripeProvider: Provider = {
  id: "stripe",
  label: "Stripe",
  products: [
    { id: "cards", label: "Cards", description: "Basic card processing" },
    { id: "connect", label: "Connect", description: "Platform / marketplace payouts" },
  ],

  quote(input: QuoteInput): QuoteResult {
    const symbol = getSymbolFromRegion(input.region);

    const vatPercent = clampPct(input.vatPercent ?? 0);
    const vatP = vatPercent / 100;

    // For a stub: choose a gross depending on mode (no solving yet)
    const gross =
      input.mode === "reverse" ? Number(input.targetNet ?? 0) : Number(input.amount ?? 0);

    const safeGross = Number.isFinite(gross) && gross >= 0 ? gross : NaN;

    const vatAmount =
      Number.isFinite(safeGross) && vatP > 0 ? safeGross * (vatP / (1 + vatP)) : 0;

    const netBeforeVat = Number.isFinite(safeGross) ? safeGross : NaN;
    const netAfterVat =
      Number.isFinite(safeGross) ? safeGross - vatAmount : NaN;

    return {
      symbol,
      gross: Number.isFinite(safeGross) ? safeGross : NaN,
      fees: [
        // later you’ll replace with real Stripe math
        { key: "provider_fee", label: "Stripe fee", amount: 0 },
        { key: "fx_fee", label: "FX fee", amount: 0 },
        { key: "platform_fee", label: "Platform fee", amount: 0 },
      ],
      netBeforeVat,
      vatPercent,
      vatAmount,
      netAfterVat,
      denomOk: Number.isFinite(safeGross),

      meta: {
        provider: "stripe",
        productId: input.productId ?? "cards",
      },
    };
  },
};
