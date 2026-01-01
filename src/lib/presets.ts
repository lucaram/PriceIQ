// src/lib/presets.ts
import type { CalcState } from "@/lib/calcState";

export type PresetId =
  // ✅ Cards (4)
  | "cards_standard"
  | "cards_cross_border_fx"
  | "cards_high_ticket_psych"
  | "cards_reverse_clean"
  // ✅ Connect (4)
  | "connect_typical_take_rate"
  | "connect_after_provider_base"
  | "connect_marketplace_fx"
  | "connect_low_take_rate";

export type PresetTag = "cards" | "connect";

export type Preset = {
  id: PresetId;
  name: string;
  description?: string;

  /** Exactly one model tag to drive conditional dropdown */
  tag: PresetTag;

  state: Partial<CalcState>;
};

/**
 * Region is intentionally NOT baked into scenario presets.
 */
export const REGION_CHOICES: Array<{ id: CalcState["region"]; name: string }> = [
  { id: "UK", name: "UK" },
  { id: "EU", name: "EU" },
  { id: "US", name: "US" },
];

/**
 * ✅ Built-in presets:
 * - Exactly 4 for Cards
 * - Exactly 4 for Connect
 * - No “recommendations”, no ranking, no universal blending
 * - Dropdown will be filtered by active model
 *
 * ✅ Override safety:
 * Each preset explicitly clears fee overrides so overrides never “stick”
 * across preset changes depending on merge behaviour.
 */
export const BUILTIN_PRESETS: Preset[] = [
  // ---------------------------------------------------------------------------
  // ✅ CARDS (4)
  // ---------------------------------------------------------------------------
  {
    id: "cards_standard",
    tag: "cards",
    name: "Standard ecommerce (no FX, no platform)",
    description: "Simple baseline. No FX and no platform fee.",
    state: {
      fxPercent: 0,
      platformFeePercent: 0,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "cards_cross_border_fx",
    tag: "cards",
    name: "Cross-border (2% FX, no platform)",
    description: "Common international customer mix. FX uplift on provider conversion.",
    state: {
      fxPercent: 2,
      platformFeePercent: 0,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "cards_high_ticket_psych",
    tag: "cards",
    name: "Popular pricing (0.01 + Psych .99)",
    description: "Presentation preset: 0.01 rounding + psych (.99). No FX/platform assumptions.",
    state: {
      fxPercent: 0,
      platformFeePercent: 0,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: true,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "cards_reverse_clean",
    tag: "cards",
    name: "Reverse mode (target net → required charge)",
    description: "Reverse mode with clean baseline (no FX, no platform).",
    state: {
      mode: "reverse",
      fxPercent: 0,
      platformFeePercent: 0,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },

  // ---------------------------------------------------------------------------
  // ✅ CONNECT (4)
  // ---------------------------------------------------------------------------
  {
    id: "connect_typical_take_rate",
    tag: "connect",
    name: "Typical platform (10% take rate, gross base, no FX)",
    description: "Common marketplace take rate. Platform fee calculated from customer charge.",
    state: {
      fxPercent: 0,
      platformFeePercent: 10,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "connect_after_provider_base",
    tag: "connect",
    name: "Platform after provider (10% after provider fee)",
    description: "Platform commission calculated after provider fee is removed (afterStripe).",
    state: {
      fxPercent: 0,
      platformFeePercent: 10,
      platformFeeBase: "afterStripe",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "connect_marketplace_fx",
    tag: "connect",
    name: "Marketplace + cross-border (10% platform + 2% FX)",
    description: "Common cross-border marketplace stack.",
    state: {
      fxPercent: 2,
      platformFeePercent: 10,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
  {
    id: "connect_low_take_rate",
    tag: "connect",
    name: "Low take rate (5% platform, no FX)",
    description: "Lower platform commission baseline (e.g. competitive marketplace).",
    state: {
      fxPercent: 0,
      platformFeePercent: 5,
      platformFeeBase: "gross",
      roundingStep: 0.01,
      psychPriceOn: false,
      mode: "forward",
      marginOn: false,
      marginTargetPct: 0,

      // ✅ clear overrides
      customProviderFeePercent: null as any,
      customFixedFee: null as any,
    },
  },
];

// -----------------------------------------------------------------------------
// Saved presets (unchanged from your file)
// -----------------------------------------------------------------------------

const LS_KEY = "sfc_presets_v2";

export type SavedPreset = {
  id: string;
  name: string;
  state: Partial<CalcState>;
  createdAt: number;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function clampPct(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function sanitizeSavedPreset(x: any): SavedPreset | null {
  if (!x || typeof x !== "object") return null;

  const id = typeof x.id === "string" ? x.id : "";
  const name = typeof x.name === "string" ? x.name : "";
  const createdAt = Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now();

  const rawState = x.state && typeof x.state === "object" ? x.state : {};
  const state: Partial<CalcState> = { ...rawState };

  if ("fxPercent" in state) (state as any).fxPercent = clampPct((state as any).fxPercent);
  if ("platformFeePercent" in state) (state as any).platformFeePercent = clampPct((state as any).platformFeePercent);
  if ("marginTargetPct" in state) (state as any).marginTargetPct = clampPct((state as any).marginTargetPct);
  if ("vatPercent" in state) (state as any).vatPercent = clampPct((state as any).vatPercent);
  if ("sensitivityDeltaPct" in state) (state as any).sensitivityDeltaPct = clampPct((state as any).sensitivityDeltaPct);

  if ("roundingStep" in state) {
    const rs = Number((state as any).roundingStep);
    (state as any).roundingStep = Number.isFinite(rs) && rs > 0 ? rs : 0.01;
  }

  if ("psychPriceOn" in state) (state as any).psychPriceOn = Boolean((state as any).psychPriceOn);
  if ("marginOn" in state) (state as any).marginOn = Boolean((state as any).marginOn);

  // ✅ NEW: sanitize overrides if present (keeps them safe + compatible)
  if ("customProviderFeePercent" in state) {
    const raw = (state as any).customProviderFeePercent;
    if (raw === null || raw === undefined || raw === "") (state as any).customProviderFeePercent = null;
    else (state as any).customProviderFeePercent = clampPct(raw);
  }

  if ("customFixedFee" in state) {
    const raw = (state as any).customFixedFee;
    if (raw === null || raw === undefined || raw === "") (state as any).customFixedFee = null;
    else {
      const v = Number(raw);
      (state as any).customFixedFee = Number.isFinite(v) ? v : null;
    }
  }

  return { id, name, state, createdAt };
}

export function loadSavedPresets(): SavedPreset[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => sanitizeSavedPreset(x)).filter((x): x is SavedPreset => Boolean(x));
  } catch {
    return [];
  }
}

export function savePreset(p: SavedPreset) {
  if (!isBrowser()) return;

  const safe =
    sanitizeSavedPreset(p) ?? {
      id: String((p as any)?.id ?? ""),
      name: String((p as any)?.name ?? ""),
      state: ((p as any)?.state ?? {}) as Partial<CalcState>,
      createdAt: Date.now(),
    };

  const existing = loadSavedPresets();
  const next = [safe, ...existing.filter((x) => x.id !== safe.id)].slice(0, 20);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

export function deletePreset(id: string) {
  if (!isBrowser()) return;
  const existing = loadSavedPresets();
  const next = existing.filter((p) => p.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

/**
 * ✅ InputsCard helper:
 * Return only presets for the active model.
 * No ranking, no “recommended”.
 */
export function getPresetsForModel(modelTag: PresetTag): Preset[] {
  return BUILTIN_PRESETS.filter((p) => p.tag === modelTag);
}
