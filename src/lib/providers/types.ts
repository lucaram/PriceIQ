// src/lib/providers/types.ts
import type { Region } from "@/lib/pricing";

/**
 * Add more providers later: "adyen", "square", "braintree", etc.
 *
 * ✅ "custom" is a manual provider:
 * - Uses provider fee overrides (customProviderFeePercent/customFixedFee)
 * - Lets the user type a label (customProviderLabel) for display
 */
export type ProviderId = "stripe" | "paypal" | "adyen" | "checkoutcom" | "custom";

/**
 * Provider product identifiers are provider-specific.
 * - Stripe examples: "cards", "connect"
 * - PayPal examples: "checkout", "card_processing"
 * - Adyen examples: "cards", "platform"
 * - Checkout.com examples: "cards", "marketplace"
 * - Custom examples: "cards", "platform" (you define these in custom.ts)
 */
export type ProviderProductId = string;

/**
 * Normalized “model kind” used by the UI policy layer.
 */
export type ProviderProductKind = "cards" | "connect" | "wallet" | "other";

export type CalcMode = "forward" | "reverse";

/**
 * Keep name for now; later rename to "afterProviderFee" if you want.
 */
export type PlatformFeeBase = "gross" | "afterStripe";

/**
 * ✅ Volume projections input (shared type so providers can interpret it)
 *
 * Canonical fields:
 * - price: avg ticket for the tier
 * - fxPercent: per-tier FX % (optional)
 *
 * Back-compat:
 * - avgTicket may exist in older state/URLs; treat it as "price"
 */
export type VolumeTier = {
  id: string;
  label?: string;

  sharePct: number; // 0..100

  // ✅ canonical
  price: number; // >= 0
  fxPercent?: number; // >= 0 (optional)

  // ✅ legacy (optional)
  avgTicket?: number; // >= 0
};

export type QuoteInput = {
  providerId: ProviderId;

  region: Region;

  productId?: ProviderProductId;

  mode: CalcMode;
  amount: number; // forward: customer price
  targetNet: number; // reverse: desired net

  fxPercent?: number; // 0..100
  platformFeePercent?: number; // 0..100
  platformFeeBase?: PlatformFeeBase;

  roundingStep?: number;
  psychPriceOn?: boolean;

  vatPercent?: number; // 0..100

  // ✅ optional provider fee overrides (null/undefined = use provider defaults)
  customProviderFeePercent?: number | null; // 0..100
  customFixedFee?: number | null; // flat fee in currency units

  /**
   * ✅ Custom provider display label (user editable)
   * Only used when providerId === "custom".
   * This lets users name their PSP (e.g., "Worldpay", "My Bank Acquirer", "Local PSP").
   */
  customProviderLabel?: string;

  // ✅ NEW: volume projections (providers may ignore)
  volumeOn?: boolean;
  volumeTxPerMonth?: number;
  volumeTiers?: VolumeTier[];

  /**
   * Provider-specific config (optional):
   * e.g. Stripe pricing tier id, PayPal rate plan, etc.
   */
  providerConfig?: Record<string, unknown>;
};

export type FeeLine = {
  key: string; // stable machine key: "provider_fee", "fx_fee", ...
  label: string; // UI label: "Stripe fee", "PayPal fee", ...
  amount: number; // absolute amount
};

export type QuoteResult = {
  symbol: string;

  gross: number;
  fees: FeeLine[];
  netBeforeVat: number;

  vatPercent: number;
  vatAmount: number;
  netAfterVat: number;

  denomOk: boolean;

  meta?: Record<string, unknown>;
};

export type ProviderProductUiHints = {
  kind?: ProviderProductKind;
  recommendedPresetIds?: string[];

  flags?: {
    emphasizePlatform?: boolean;
    emphasizeVat?: boolean;
    emphasizeFx?: boolean;
    emphasizeRounding?: boolean;
    emphasizeTools?: boolean;
  };

  note?: string;
};

export type ProviderProduct = {
  id: ProviderProductId;
  label: string;
  description?: string;
  ui?: ProviderProductUiHints;
};

export type Provider = {
  id: ProviderId;
  label: string;
  products: ProviderProduct[];

  quote(input: QuoteInput): QuoteResult;
};
