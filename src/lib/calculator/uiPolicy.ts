// src/lib/calculator/uiPolicy.ts
//
// Single source of truth for calculator UI behaviour.

import type { ProviderId, ProviderProduct, ProviderProductKind } from "@/lib/providers/types";
import type { Preset } from "@/lib/presets";
import type { CalcState } from "@/lib/calcState";

/** Sections visible in InputsCard (and any future layout) */
export type UiSectionId =
  | "provider"
  | "presets"
  | "basics"
  | "pricing"
  | "platform"
  | "tax"
  | "tools";

/** Individual controls you may want to enable/disable + explain */
export type UiControlId =
  | "providerId"
  | "productId"
  | "region"
  | "pricingTier"
  | "mode"
  | "amountOrTarget"
  | "fxPercent"
  | "platformFeePercent"
  | "platformFeeBase"
  | "vatPercent"
  | "rounding"
  | "psychPricing"
  | "breakEven"
  | "sensitivity"
  // ✅ NEW (optional policy-driven override controls)
  | "feeOverrides"
  // ✅ NEW: custom provider label field (shown only when providerId === "custom")
  | "customProviderLabel"
  // ✅ NEW: Volume projections tool toggle + policy gating
  | "volume";

export type UiMessage = {
  tone: "info" | "warning" | "success";
  title?: string;
  text: string;
};

export type UiSectionPolicy = {
  visible: boolean;
  defaultExpanded: boolean;
  helper?: UiMessage;
};

export type UiControlPolicy = {
  enabled: boolean;
  disabledReason?: string;
  helper?: UiMessage;
  badge?: string;
};

/**
 * Optional override policy:
 * Lets Calculator/InputsCard decide whether to show overrides, and optionally
 * disable Stripe tier when overrides are active.
 */
export type UiOverridesPolicy = {
  enabled: boolean; // can the user use overrides for this provider/product?
  showInputs: boolean; // should InputsCard render override inputs?
  disableTierWhenActive: boolean; // stripe-only behaviour (optional)
  bannerWhenActive?: UiMessage; // optional banner message (rendered in policy.banners)
};

export type UiPresetBadge = {
  label: string;
  tone?: "muted" | "info" | "warning" | "success";
};

export type UiPresetPolicy = {
  showNonMatchingPresets: boolean;
  featuredPresetIds?: string[];
  getBadges: (preset: Preset, ctx: UiContext) => UiPresetBadge[];
};

export type UiPolicy = {
  context: UiContext;

  sections: Record<UiSectionId, UiSectionPolicy>;
  controls: Record<UiControlId, UiControlPolicy>;

  starterDefaults?: Partial<CalcState>;

  presets: UiPresetPolicy;

  /**
   * Global banners (rendered ABOVE cards in InputsCard).
   */
  banners: UiMessage[];

  /**
   * ✅ Optional, policy-driven override behaviour
   * (InputsCard can ignore this if you don’t wire it yet.)
   */
  overrides?: UiOverridesPolicy;
};

export type UiContext = {
  providerId: ProviderId;
  providerLabel?: string;

  productId: string;
  productLabel?: string;

  kind: ProviderProductKind;

  isStripe: boolean;
  isCustom: boolean;

  product?: ProviderProduct;

  mode?: "forward" | "reverse";
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function normalizeModelLabel(s: string | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function normalizeProviderId(providerId: ProviderId) {
  return normalizeModelLabel(String(providerId));
}

function looksLikeConnect(productId: string, productLabel?: string) {
  const id = normalizeModelLabel(productId);
  const label = normalizeModelLabel(productLabel);
  return (
    id.includes("connect") ||
    label.includes("connect") ||
    id.includes("checkout") ||
    label.includes("checkout") ||
    id.includes("platform") ||
    label.includes("platform") ||
    id.includes("marketplace") ||
    label.includes("marketplace")
  );
}

function looksLikeCards(productId: string, productLabel?: string) {
  const id = normalizeModelLabel(productId);
  const label = normalizeModelLabel(productLabel);
  return id.includes("card") || label.includes("card");
}

function inferKindFromProduct(args: {
  providerId: ProviderId;
  productId: string;
  product?: ProviderProduct;
  productLabel?: string;
}): ProviderProductKind {
  const { providerId, productId, product, productLabel } = args;

  const explicit = product?.ui?.kind;
  if (explicit) return explicit;

  const pid = normalizeProviderId(providerId);
  const id = normalizeModelLabel(productId);

  if (id.includes("wallet") || id.includes("balance") || id.includes("payout")) return "wallet";

  // Stripe and Custom use the same “shape” of product ids ("cards", "connect/platform") in your UI
  if (pid.includes("stripe") || pid.includes("custom")) {
    if (looksLikeConnect(productId, productLabel)) return "connect";
    if (looksLikeCards(productId, productLabel)) return "cards";
    return "other";
  }

  if (looksLikeConnect(productId, productLabel)) return "connect";
  if (looksLikeCards(productId, productLabel)) return "cards";

  return "other";
}

function baseSections(): Record<UiSectionId, UiSectionPolicy> {
  return {
    provider: { visible: true, defaultExpanded: true },
    presets: { visible: true, defaultExpanded: true },
    basics: { visible: true, defaultExpanded: true },
    pricing: { visible: true, defaultExpanded: true },
    platform: { visible: true, defaultExpanded: false },
    tax: { visible: true, defaultExpanded: false },
    tools: { visible: true, defaultExpanded: false },
  };
}

function baseControls(): Record<UiControlId, UiControlPolicy> {
  return {
    providerId: { enabled: true },
    productId: { enabled: true },

    // ✅ shown only for providerId === "custom" (InputsCard decides)
    customProviderLabel: {
      enabled: true,
      helper: {
        tone: "info",
        text: "Name your payment provider (display only). Example: “Worldpay”, “Local PSP”, “Bank Acquirer”.",
      },
    },

    region: { enabled: true },

    pricingTier: { enabled: true },
    mode: { enabled: true },

    amountOrTarget: { enabled: true },

    fxPercent: { enabled: true },

    platformFeePercent: { enabled: true },
    platformFeeBase: { enabled: true },

    vatPercent: { enabled: true },

    rounding: { enabled: true },
    psychPricing: { enabled: true },

    breakEven: { enabled: true },
    sensitivity: { enabled: true },

    // ✅ Overrides are enabled by default; policy may disable/hide
    feeOverrides: { enabled: true },

    // ✅ Volume projections tool (InputsCard uses ctrl.volume.*)
    volume: {
      enabled: true,
      helper: {
        tone: "info",
        text: "Turn on Volume projections to estimate monthly totals using your current fee assumptions.",
      },
    },
  };
}

function prettyProviderName(ctx: UiContext) {
  return (ctx.providerLabel ?? String(ctx.providerId)).trim();
}

function prettyProductName(ctx: UiContext) {
  return (ctx.productLabel ?? String(ctx.productId)).trim();
}

function buildConnectPlatformHint(ctx: UiContext): UiMessage {
  const providerName = prettyProviderName(ctx);
  const productName = prettyProductName(ctx);

  return {
    tone: "info",
    title: `Hint - ${providerName}: ${productName}`,
    text: "Marketplace/platform models often include a platform fee. If you don’t take a cut, keep Platform fee % at 0.",
  };
}

/**
 * ✅ Custom provider hint is kind-aware:
 * - Cards => "Card processing"
 * - Connect/Platform => Marketplace/platform style hint
 */
function buildCustomProviderHint(ctx: UiContext): UiMessage {
  const providerName = prettyProviderName(ctx);
  const productName = prettyProductName(ctx);

  if (ctx.kind === "connect") {
    return {
      tone: "info",
      title: `Hint - ${providerName}: ${productName}`,
      text:
        "Platform/marketplace flows usually include a platform fee. " +
        "If you take a cut, keep Platform fee % enabled. If not, set Platform fee % back to 0.",
    };
  }

  return {
    tone: "info",
    title: `Hint - ${providerName}: Card processing`,
    text:
      "Card processing is usually simple ecommerce. " +
      "If you’re not taking a marketplace cut, set Platform fee % back to 0.",
  };
}

/**
 * ✅ Single source of truth for the preset “bucket” chip label.
 * - Custom + connect-like => “Custom Platform …” (NOT “Custom Connect …”)
 */
export function getPresetBucketChipLabel(args: {
  ctx: UiContext;
  presetTag: "cards" | "connect";
}): string {
  const { ctx, presetTag } = args;

  const providerName = prettyProviderName(ctx);

  if (ctx.isCustom) {
    // Custom uses user-facing wording
    return presetTag === "connect" ? `${providerName} Platform Presets` : `${providerName} Card Presets`;
  }

  // Non-custom: keep provider-specific naming
  if (ctx.isStripe) {
    return presetTag === "connect" ? "Stripe Connect Presets" : "Stripe Card Presets";
  }

  // Default fallback
  return presetTag === "connect" ? `${providerName} Connect Presets` : `${providerName} Card Presets`;
}

/**
 * Determine override behaviour for a given provider/product.
 * - For "custom": overrides are the primary fee input (so we strongly encourage them)
 */
function getOverridesPolicy(args: { ctx: UiContext; state?: Partial<CalcState> }): UiOverridesPolicy {
  const { ctx, state } = args;

  const customPct = (state as any)?.customProviderFeePercent as number | null | undefined;
  const customFixed = (state as any)?.customFixedFee as number | null | undefined;
  const overridesActive = customPct != null || customFixed != null;

  const enabled = true;

  // ✅ Always show override inputs for custom (it’s the whole point)
  const showInputs = true;

  const disableTierWhenActive = ctx.isStripe; // only meaningful on Stripe

  // ✅ ONLY show a global banner when overrides are ACTIVE.
  // When overrides are missing for Custom, we now drive that message via sections.provider.helper
  // so InputsCard can place it above the model hint inside the Providers section.
  const bannerWhenActive: UiMessage | undefined = overridesActive
    ? {
        tone: "info",
        title: "Fee overrides active",
        text: ctx.isCustom
          ? "Your custom provider fee overrides are being used for calculations."
          : "Fee overrides are being used for calculations. " + (ctx.isStripe ? "Stripe tier is informational unless you clear overrides." : ""),
      }
    : undefined;

  return { enabled, showInputs, disableTierWhenActive, bannerWhenActive };
}

export function getUiPolicy(input: {
  providerId: ProviderId;
  productId: string;
  product?: ProviderProduct;
  providerLabel?: string;
  productLabel?: string;
  mode?: "forward" | "reverse";

  /**
   * ✅ Optional: pass current state so policy can:
   * - show a banner when overrides are active
   * - disable tier selector when overrides active (stripe-only)
   * - warn for custom when overrides are empty
   */
  state?: Partial<CalcState>;
}): UiPolicy {
  const pid = normalizeProviderId(input.providerId);
  const isStripe = pid.includes("stripe");
  const isCustom = pid.includes("custom");

  const inferredProductLabel = input.productLabel ?? input.product?.label ?? "";

  const kind = inferKindFromProduct({
    providerId: input.providerId,
    productId: input.productId,
    product: input.product,
    productLabel: inferredProductLabel,
  });

  const ctx: UiContext = {
    providerId: input.providerId,
    providerLabel: input.providerLabel,

    productId: input.productId,
    productLabel: inferredProductLabel,

    product: input.product,
    kind,
    isStripe,
    isCustom,

    mode: input.mode,
  };

  const sections = baseSections();
  const controls = baseControls();
  const banners: UiMessage[] = [];

  const customPct = (input.state as any)?.customProviderFeePercent as number | null | undefined;
  const customFixed = (input.state as any)?.customFixedFee as number | null | undefined;
  const overridesActive = customPct != null || customFixed != null;

  // ---------------------------------------------------------------------------
  // Pricing tier
  // ---------------------------------------------------------------------------
  if (!ctx.isStripe) {
    controls.pricingTier = {
      enabled: false,
      disabledReason: "Pricing tiers are Stripe-only. This provider is modelled via provider.quote().",
      helper: {
        tone: "info",
        text: "Pricing tier is disabled because tiers come from your Stripe PRICING table.",
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Custom provider label control
  // ---------------------------------------------------------------------------
  if (ctx.isCustom) {
    controls.customProviderLabel = {
      enabled: true,
      helper: controls.customProviderLabel.helper,
      badge: "Custom",
    };
  } else {
    controls.customProviderLabel = {
      enabled: false,
      disabledReason: "Only available for the Custom provider.",
    };
  }

  // ---------------------------------------------------------------------------
  // Model-based emphasis + default expand
  // ---------------------------------------------------------------------------
  const connectLike = ctx.kind === "connect";
  const cardsLike = ctx.kind === "cards";

  // ✅ Platform helper copy (better + explains subtraction)
  const platformFeesHelper: UiMessage = {
    tone: "info",
    title: "Hint - Platform fees",
    text:
      "Use only if you take a platform cut. It’s deducted from the transaction, not added to the customer price." 
  };

  if (cardsLike) {
    sections.platform.defaultExpanded = false;
    sections.tax.defaultExpanded = false;
    sections.tools.defaultExpanded = false;

    sections.platform.helper = platformFeesHelper;

    if (ctx.isCustom) {
      // Base “custom” hint; may be overridden below by the “needs fees” warning
      sections.provider.helper = buildCustomProviderHint(ctx);
    }
  }

  if (connectLike) {
    sections.platform.defaultExpanded = true;
    sections.tax.defaultExpanded = true;
    sections.tools.defaultExpanded = true;

    // ✅ Do NOT overwrite custom hint with generic connect/platform hint
    sections.provider.helper = ctx.isCustom ? buildCustomProviderHint(ctx) : buildConnectPlatformHint(ctx);

    sections.platform.helper = {
      tone: "info",
      title: "Hint - Marketplace models",
      text: "Marketplace/platform products often include a platform fee.",
    };
  }

  if (ctx.kind === "wallet") {
    sections.tools.defaultExpanded = true;
    sections.tax.defaultExpanded = true;
    sections.platform.defaultExpanded = false;

    sections.tools.helper = {
      tone: "info",
      title: "Hint - Wallet models",
      text: "Wallet/payout models often focus on net outcomes and fee drift. Tools are shown prominently.",
    };
  }

  // ---------------------------------------------------------------------------
  // Provider product ui.flags “nudges”
  // ---------------------------------------------------------------------------
  const flags = ctx.product?.ui?.flags;

  if (flags?.emphasizePlatform) sections.platform.defaultExpanded = true;
  if (flags?.emphasizeVat) sections.tax.defaultExpanded = true;
  if (flags?.emphasizeTools) sections.tools.defaultExpanded = true;

  // ---------------------------------------------------------------------------
  // Starter defaults (Calculator may apply these safely on model-change)
  // ---------------------------------------------------------------------------
  const starterDefaults: Partial<CalcState> | undefined = connectLike
    ? {
        platformFeePercent: 10,
        platformFeeBase: "gross",
      }
    : undefined;

  // ---------------------------------------------------------------------------
  // Overrides policy
  // ---------------------------------------------------------------------------
  const overrides = getOverridesPolicy({ ctx, state: input.state });

  if (!overrides.enabled || !overrides.showInputs) {
    controls.feeOverrides = {
      enabled: false,
      disabledReason: "Fee overrides are disabled for this model.",
    };
  } else if (ctx.isCustom) {
    controls.feeOverrides = {
      enabled: true,
      badge: "Required",
      helper: {
        tone: "info",
        title: "Custom provider fees",
        text: "Set provider fee % and fixed fee here. Custom provider has no built-in rates.",
      },
    };
  }

  // ✅ Stripe-only: disable tier when overrides are active (if policy requests it)
  if (ctx.isStripe && overrides.disableTierWhenActive && overridesActive) {
    controls.pricingTier = {
      enabled: false,
      disabledReason: "Stripe tier is disabled while fee overrides are active.",
      helper: {
        tone: "info",
        text: "Clear overrides to re-enable tier selection.",
      },
    };
  }

  // ✅ Global banner only when overrides are active
  if (overrides.bannerWhenActive) {
    banners.push(overrides.bannerWhenActive);
  }

  // ✅ Custom provider “needs fees” message is now a provider section helper
  // so InputsCard can render it ABOVE the model hint inside the Providers area.
  if (ctx.isCustom && !overridesActive) {
    sections.provider.helper = {
      tone: "warning",
      title: "Custom provider needs fees",
      text:
        "Go to Provider Fee Override section to set up custom provider fees, " +
        "otherwise they are treated as 0 fees.",
    };
  }

  // ---------------------------------------------------------------------------
  // Volume projections tool gating (policy-only)
  // ---------------------------------------------------------------------------
  // Default is enabled (from baseControls). Keep this hook in place so you can
  // later disable it for specific products if needed.
  // Example logic (commented):
  // if (ctx.kind === "wallet") controls.volume = { enabled: true };
  // else controls.volume = { enabled: true };

  // ---------------------------------------------------------------------------
  // Preset ranking/filtering policy
  // ---------------------------------------------------------------------------
  const featuredPresetIds = ctx.product?.ui?.recommendedPresetIds;

  const presets: UiPresetPolicy = {
    showNonMatchingPresets: false,
    featuredPresetIds,
    getBadges: (preset: Preset, c: UiContext): UiPresetBadge[] => {
      const out: UiPresetBadge[] = [];

      // ✅ Bucket badge (chip label policy fix)
      if (preset.tag === "cards" || preset.tag === "connect") {
        out.push({
          label: getPresetBucketChipLabel({ ctx: c, presetTag: preset.tag }),
          tone: preset.tag === "connect" ? "info" : "muted",
        });
      }

      // ✅ semantic tags (avoid “Connect” wording for custom connect-like)
      if (preset.tag === "cards") out.push({ label: "Cards", tone: "muted" });
      if (preset.tag === "connect") out.push({ label: c.isCustom ? "Platform" : "Connect", tone: "info" });

      if (preset.tag === c.kind) out.push({ label: "Recommended", tone: "success" });

      if (c.isCustom) out.push({ label: "Custom", tone: "warning" });

      return out;
    },
  };

  return {
    context: ctx,
    sections,
    controls,
    starterDefaults,
    presets,
    banners,
    overrides,
  };
}

export function rankPresetsForContext(presets: Preset[], policy: UiPolicy): Preset[] {
  const ctx = policy.context;

  const featured = new Map<string, number>();
  (policy.presets.featuredPresetIds ?? []).forEach((id, i) => featured.set(id, 1000 - i));

  const kind = ctx.kind;

  function presetScore(p: Preset): number {
    const sortWeight = Number((p as any).sortWeight ?? 0);

    let score = 0;

    const f = featured.get(p.id);
    if (typeof f === "number") score += f;

    if (p.tag === kind) score += 200;

    score += sortWeight;

    return score;
  }

  const filtered = presets.filter((p) => {
    if (policy.presets.showNonMatchingPresets) return true;
    return p.tag === kind;
  });

  return [...filtered].sort((a, b) => {
    const sa = presetScore(a);
    const sb = presetScore(b);
    if (sb !== sa) return sb - sa;

    const an = (a.name ?? "").toLowerCase();
    const bn = (b.name ?? "").toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function getProductKind(
  providerId: ProviderId,
  productId: string,
  product?: ProviderProduct,
  productLabel?: string
): ProviderProductKind {
  return inferKindFromProduct({ providerId, productId, product, productLabel });
}
