// src/lib/calcState.ts
import type { Region } from "@/lib/pricing";

// ✅ Provider/product plumbing
import { DEFAULT_PROVIDER_ID, getProvider } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers/types";

export type PlatformFeeBase = "gross" | "afterStripe";
export type RoundingStep = 0.01 | 0.05 | 0.1;

export type SensitivityTarget = "all" | "stripe" | "fx" | "platform";

/**
 * ✅ Volume projections
 * - Represent a blended basket of transactions:
 *   - sharePct: portion of total tx volume (0..100)
 *   - price: ticket price for that slice (>= 0)
 *   - fxPercent: per-tier FX % for multi-currency mixes (>= 0)
 *
 * Back-compat:
 * - Older state/URLs may still contain avgTicket (we map it to price).
 */
export type VolumeTier = {
  id: string; // stable for UI list rendering
  label?: string;

  // ✅ NEW canonical fields (used by InputsCard UI)
  sharePct: number; // 0..100
  price: number; // >= 0
  fxPercent: number; // >= 0

  // ✅ legacy (optional)
  avgTicket?: number; // >= 0
};

export type CalcState = {
  // ✅ Provider/model selection
  providerId: ProviderId;
  productId: string;

  /**
   * ✅ Custom provider label (UI editable)
   * Only meaningful when providerId === "custom".
   */
  customProviderLabel: string;

  region: Region;
  pricingId: string;

  mode: "forward" | "reverse";

  amount: number;
  targetNet: number;

  // ✅ FX is now % driven only. Enabled when fxPercent > 0.
  fxPercent: number;

  platformFeePercent: number;
  platformFeeBase: PlatformFeeBase;

  // ✅ Net margin goal input (0..100). 0 means “not set”.
  marginTargetPct: number;

  // ✅ Margin goal-mode toggle (Reverse-only behaviour is handled in Calculator)
  marginOn: boolean;

  roundingStep: RoundingStep;
  psychPriceOn: boolean;

  // ✅ VAT percent (0..100). 0 means “off”.
  vatPercent: number;

  breakEvenOn: boolean;
  breakEvenTargetNet: number;

  sensitivityOn: boolean;
  sensitivityDeltaPct: number;
  sensitivityTarget: SensitivityTarget;

  // ✅ Optional provider fee overrides (null = use provider model)
  customProviderFeePercent: number | null; // override provider % fee
  customFixedFee: number | null; // override provider fixed fee

  // ✅ NEW: volume projections inputs
  volumeOn: boolean;
  volumeTxPerMonth: number;

  // If you have this in InputsCard props, include it here too.
  // (Your InputsCard currently expects volumeRefundRatePct.)
  volumeRefundRatePct: number;

  volumeTiers: VolumeTier[];
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function asBool(v: string | null, fallback: boolean) {
  if (v === null) return fallback;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

function asNum(v: string | null, fallback: number) {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asNonNeg(v: string | null, fallback: number) {
  return Math.max(0, asNum(v, fallback));
}

function asPct(v: string | null, fallback: number) {
  return clamp(asNum(v, fallback), 0, 100);
}

function asEnum<T extends string>(v: string | null, allowed: readonly T[], fallback: T) {
  if (v === null) return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function asRounding(v: string | null, fallback: RoundingStep) {
  const n = asNum(v, fallback);
  if (n === 0.01 || n === 0.05 || n === 0.1) return n;
  return fallback;
}

/** override parsing: blank/missing => null */
function asNullablePct(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return clamp(n, 0, 100);
}

function asNullableMoney(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeLabel(raw: unknown, maxLen = 32) {
  const s = typeof raw === "string" ? raw : String(raw ?? "");
  // trim, remove newlines/tabs, collapse multiple spaces
  const cleaned = s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

// ----------------------------------------------------------------------------
// ✅ Volume tiers URL encoding
// ----------------------------------------------------------------------------
// NEW compact format: "id,share,price,fx|id,share,price,fx|..."
// Back-compat: accepts legacy "id,share,avg" (avg -> price, fx=0)
function serializeVolumeTiers(tiers: VolumeTier[]) {
  const safe = (tiers ?? [])
    .filter(Boolean)
    .map((t) => {
      const id = String(t.id ?? "").trim() || "t";
      const share = clamp(Number(t.sharePct ?? 0), 0, 100);
      const price = Math.max(0, Number.isFinite(Number(t.price)) ? Number(t.price) : 0);
      const fx = Math.max(0, Number.isFinite(Number(t.fxPercent)) ? Number(t.fxPercent) : 0);
      return `${encodeURIComponent(id)},${share},${price},${fx}`;
    });

  return safe.join("|");
}

function parseVolumeTiers(raw: string | null, fallback: VolumeTier[]) {
  if (!raw) return fallback;

  const parts = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return fallback;

  const out: VolumeTier[] = [];

  for (const part of parts) {
    const segs = part.split(",");
    const idRaw = segs[0];
    const shareRaw = segs[1];
    const thirdRaw = segs[2];
    const fourthRaw = segs[3];

    const id = decodeURIComponent(String(idRaw ?? "").trim() || "");
    const sharePct = clamp(Number(shareRaw), 0, 100);

    // If vt has 4 parts => new format (price, fx)
    // If vt has 3 parts => legacy format (avgTicket)
    const hasNew = typeof fourthRaw !== "undefined";

    const price = Math.max(0, Number.isFinite(Number(thirdRaw)) ? Number(thirdRaw) : 0);
    const fxPercent = hasNew ? Math.max(0, Number.isFinite(Number(fourthRaw)) ? Number(fourthRaw) : 0) : 0;

    const safeId = id || `t${out.length + 1}`;

    out.push({
      id: safeId,
      sharePct,
      price,
      fxPercent,
      // legacy capture (optional)
      ...(hasNew ? {} : { avgTicket: price }),
    });
  }

  return out.length ? out : fallback;
}

// ----------------------------------------------------------------------------
// ✅ Provider/product validation
// ----------------------------------------------------------------------------
function normalizeProviderProduct(input: { providerId?: unknown; productId?: unknown }) {
  const rawProviderId = String(input.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;

  let providerId: ProviderId = DEFAULT_PROVIDER_ID as ProviderId;
  let provider: ReturnType<typeof getProvider>;
  try {
    provider = getProvider(rawProviderId as ProviderId);
    providerId = rawProviderId as ProviderId;
  } catch {
    provider = getProvider(DEFAULT_PROVIDER_ID as ProviderId);
    providerId = DEFAULT_PROVIDER_ID as ProviderId;
  }

  const products = provider?.products ?? [];
  const firstProductId = products[0]?.id ?? "cards";

  const rawProductId =
    typeof input.productId === "string" ? input.productId.trim() : String(input.productId ?? "").trim();

  const productIdCandidate = rawProductId || firstProductId;

  const productOk = products.length ? products.some((p) => p.id === productIdCandidate) : true;
  const productId = products.length ? (productOk ? productIdCandidate : firstProductId) : productIdCandidate;

  return { providerId, productId };
}

/**
 * ✅ Ensures providerId/productId are always valid for the currently selected provider.
 * ✅ Also clamps pct fields & normalizes overrides + volume fields
 * ✅ Adds Custom label normalization
 */
export function normalizeState(input: CalcState): CalcState {
  const { providerId, productId } = normalizeProviderProduct({
    providerId: input.providerId,
    productId: input.productId,
  });

  const cp = input.customProviderFeePercent;
  const cf = input.customFixedFee;

  // volume
  const volumeOn = Boolean(input.volumeOn);
  const volumeTxPerMonth = Math.max(
    0,
    Number.isFinite(Number(input.volumeTxPerMonth)) ? Number(input.volumeTxPerMonth) : 0
  );

  const volumeRefundRatePct = clamp(Number(input.volumeRefundRatePct ?? 0), 0, 100);

  const volumeTiers0 = Array.isArray(input.volumeTiers) ? input.volumeTiers : [];

  const volumeTiers: VolumeTier[] =
    volumeTiers0.length > 0
      ? volumeTiers0.map((t, idx) => {
          const id = String((t as any)?.id ?? "").trim() || `t${idx + 1}`;
          const label = typeof (t as any)?.label === "string" ? (t as any).label : undefined;

          const sharePct = clamp(Number((t as any)?.sharePct ?? 0), 0, 100);

          // Support both new + legacy shapes:
          const priceRaw = (t as any)?.price ?? (t as any)?.avgTicket ?? 0;
          const fxRaw = (t as any)?.fxPercent ?? 0;

          const price = Math.max(0, Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0);
          const fxPercent = Math.max(0, Number.isFinite(Number(fxRaw)) ? Number(fxRaw) : 0);

          const legacyAvg = (t as any)?.avgTicket;

          return {
            id,
            label,
            sharePct,
            price,
            fxPercent,
            ...(legacyAvg != null ? { avgTicket: Math.max(0, Number(legacyAvg) || 0) } : {}),
          };
        })
      : [
          // sensible default tier
          {
            id: "t1",
            sharePct: 100,
            price: Math.max(0, Number(input.amount ?? 0) || 0) || 10,
            fxPercent: Math.max(0, Number(input.fxPercent ?? 0) || 0) || 0,
          },
        ];

  // ✅ custom provider label: only keep when provider is custom
  const labelRaw = normalizeLabel((input as any).customProviderLabel ?? "");
  const customProviderLabel = providerId === "custom" ? labelRaw : "";

  return {
    ...input,
    providerId,
    productId,
    customProviderLabel,

    fxPercent: clamp(Number(input.fxPercent ?? 0), 0, 100),
    platformFeePercent: clamp(Number(input.platformFeePercent ?? 0), 0, 100),
    marginTargetPct: clamp(Number(input.marginTargetPct ?? 0), 0, 100),
    vatPercent: clamp(Number(input.vatPercent ?? 0), 0, 100),
    sensitivityDeltaPct: clamp(Number(input.sensitivityDeltaPct ?? 0), 0, 100),

    customProviderFeePercent: cp == null ? null : clamp(Number(cp), 0, 100),
    customFixedFee: cf == null ? null : Number.isFinite(Number(cf)) ? Number(cf) : null,

    volumeOn,
    volumeTxPerMonth,
    volumeRefundRatePct,
    volumeTiers,
  };
}

// ✅ compute a safe default product for the default provider (no hardcoding in normal cases)
let __defaultProductId = "cards";
try {
  const __defaultProvider = getProvider(DEFAULT_PROVIDER_ID);
  __defaultProductId = __defaultProvider.products?.[0]?.id ?? "cards";
} catch {
  __defaultProductId = "cards";
}

export const DEFAULT_STATE: CalcState = normalizeState({
  providerId: DEFAULT_PROVIDER_ID,
  productId: __defaultProductId,

  customProviderLabel: "",

  region: "UK",
  pricingId: "",

  mode: "forward",

  amount: 10,
  targetNet: 8,

  fxPercent: 0,

  platformFeePercent: 0,
  platformFeeBase: "gross",

  marginTargetPct: 0,
  marginOn: false,

  roundingStep: 0.01,
  psychPriceOn: false,

  vatPercent: 0,

  breakEvenOn: false,
  breakEvenTargetNet: 10,

  sensitivityOn: false,
  sensitivityDeltaPct: 1,
  sensitivityTarget: "all",

  customProviderFeePercent: null,
  customFixedFee: null,

  // ✅ volume defaults
  volumeOn: false,
  volumeTxPerMonth: 100,
  volumeRefundRatePct: 0,
  volumeTiers: [{ id: "t1", sharePct: 100, price: 10, fxPercent: 0 }],
});

/**
 * Applies URLSearchParams to an existing state (keeps unknowns).
 *
 * ✅ Updates:
 * - FX is fxPercent-only (still reads legacy fx flag)
 * - Adds marginOn key ("mo")
 * - Adds provider/model keys: providerId ("p"), productId ("pid")
 * - Adds VAT percent key: "vat" (also accepts legacy "vatPercent")
 * - Adds override keys: percent ("op"), fixed ("of")
 * - ✅ Adds volume keys:
 *    - volumeOn: "vo"
 *    - tx/month: "vtx"
 *    - refund rate: "vrr"
 *    - tiers: "vt"
 * - ✅ Adds Custom label:
 *    - "cpl" = custom provider label
 *
 * Back-compat:
 * - vt supports legacy "id,share,avg" (avg -> price, fx=0)
 */
export function applySearchParamsToState(base: CalcState, sp: URLSearchParams): CalcState {
  const rawProviderId = (sp.get("p") ?? base.providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;
  const rawProductId = (sp.get("pid") ?? base.productId ?? "").trim();

  const region = asEnum(sp.get("r"), ["UK", "EU", "US"] as const, base.region);
  const mode = asEnum(sp.get("m"), ["forward", "reverse"] as const, base.mode);

  const fxFlagPresent = sp.has("fx");
  const fxOnLegacy = asBool(sp.get("fx"), false);

  const fxPercentRaw = asPct(sp.get("fxp"), base.fxPercent);
  const fxPercent = fxFlagPresent ? (fxOnLegacy ? fxPercentRaw : 0) : fxPercentRaw;

  const marginTargetPct = asPct(sp.get("mp"), base.marginTargetPct);
  const marginOn = asBool(sp.get("mo"), base.marginOn);

  const vatPercent = asPct(sp.get("vat") ?? sp.get("vatPercent"), base.vatPercent);

  const customProviderFeePercent = asNullablePct(sp.get("op"));
  const customFixedFee = asNullableMoney(sp.get("of"));

  // ✅ volume
  const volumeOn = asBool(sp.get("vo"), base.volumeOn);
  const volumeTxPerMonth = asNonNeg(sp.get("vtx"), base.volumeTxPerMonth);
  const volumeRefundRatePct = asPct(sp.get("vrr"), base.volumeRefundRatePct);
  const volumeTiers = parseVolumeTiers(sp.get("vt"), base.volumeTiers);

  // ✅ custom label (only used when providerId becomes "custom" after normalizeState)
  const customProviderLabel = normalizeLabel(sp.get("cpl") ?? base.customProviderLabel ?? "");

  // ✅ Stripe-only tier: ignore/strip "t" for non-stripe providers
  const pricingId = rawProviderId === "stripe" ? (sp.get("t") ?? base.pricingId) : base.pricingId;

  const next: CalcState = {
    ...base,

    providerId: rawProviderId,
    productId: rawProductId || base.productId,

    customProviderLabel,

    region,
    pricingId,

    mode,
    amount: asNonNeg(sp.get("a"), base.amount),
    targetNet: asNonNeg(sp.get("tn"), base.targetNet),

    fxPercent,

    platformFeePercent: asPct(sp.get("pp"), base.platformFeePercent),
    platformFeeBase: asEnum(sp.get("pb"), ["gross", "afterStripe"] as const, base.platformFeeBase),

    marginTargetPct,
    marginOn,

    roundingStep: asRounding(sp.get("rs"), base.roundingStep),
    psychPriceOn: asBool(sp.get("psy"), base.psychPriceOn),

    vatPercent,

    breakEvenOn: asBool(sp.get("be"), base.breakEvenOn),
    breakEvenTargetNet: asNonNeg(sp.get("ben"), base.breakEvenTargetNet),

    sensitivityOn: asBool(sp.get("so"), base.sensitivityOn),
    sensitivityDeltaPct: asPct(sp.get("sd"), base.sensitivityDeltaPct),
    sensitivityTarget: asEnum(sp.get("st"), ["all", "stripe", "fx", "platform"] as const, base.sensitivityTarget),

    customProviderFeePercent: customProviderFeePercent ?? base.customProviderFeePercent,
    customFixedFee: customFixedFee ?? base.customFixedFee,

    volumeOn,
    volumeTxPerMonth,
    volumeRefundRatePct,
    volumeTiers,
  };

  return normalizeState(next);
}

export function stateToSearchParams(s0: CalcState): URLSearchParams {
  const s = normalizeState(s0);
  const sp = new URLSearchParams();

  sp.set("p", s.providerId);
  sp.set("pid", s.productId);

  // ✅ Custom provider label in URL (only meaningful when provider is custom)
  if (s.providerId === "custom" && s.customProviderLabel.trim()) {
    sp.set("cpl", normalizeLabel(s.customProviderLabel));
  } else {
    sp.delete("cpl");
  }

  sp.set("r", s.region);

  // ✅ Stripe-only tier in URL (prevents t=uk_standard on paypal/adyen/checkout/custom)
  if (s.providerId === "stripe" && String(s.pricingId ?? "").trim()) {
    sp.set("t", String(s.pricingId));
  } else {
    sp.delete("t");
  }

  sp.set("m", s.mode);

  sp.set("a", String(Math.max(0, s.amount)));
  sp.set("tn", String(Math.max(0, s.targetNet)));

  const fxOn = clamp(s.fxPercent, 0, 100) > 0;
  sp.set("fx", fxOn ? "1" : "0");
  sp.set("fxp", String(clamp(s.fxPercent, 0, 100)));

  sp.set("pp", String(clamp(s.platformFeePercent, 0, 100)));
  sp.set("pb", s.platformFeeBase);

  sp.set("mp", String(clamp(s.marginTargetPct, 0, 100)));
  sp.set("mo", s.marginOn ? "1" : "0");

  sp.set("rs", String(s.roundingStep));
  sp.set("psy", s.psychPriceOn ? "1" : "0");

  const v = clamp(s.vatPercent, 0, 100);
  if (v > 0) sp.set("vat", String(v));
  sp.delete("vatPercent");

  sp.set("be", s.breakEvenOn ? "1" : "0");
  sp.set("ben", String(Math.max(0, s.breakEvenTargetNet)));

  sp.set("so", s.sensitivityOn ? "1" : "0");
  sp.set("sd", String(clamp(s.sensitivityDeltaPct, 0, 100)));
  sp.set("st", s.sensitivityTarget);

  if (s.customProviderFeePercent != null) sp.set("op", String(clamp(s.customProviderFeePercent, 0, 100)));
  else sp.delete("op");

  if (s.customFixedFee != null) sp.set("of", String(s.customFixedFee));
  else sp.delete("of");

  // ✅ volume params (only when ON to keep URLs clean)
  if (s.volumeOn) {
    sp.set("vo", "1");
    sp.set("vtx", String(Math.max(0, s.volumeTxPerMonth)));
    sp.set("vrr", String(clamp(s.volumeRefundRatePct, 0, 100)));
    sp.set("vt", serializeVolumeTiers(s.volumeTiers));
  } else {
    sp.set("vo", "0");
    sp.delete("vtx");
    sp.delete("vrr");
    sp.delete("vt");
  }

  return sp;
}
