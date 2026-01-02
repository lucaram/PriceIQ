// src/components/calculator/InputsCard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { PricingOption, Region } from "@/lib/pricing";
import { InfoTip } from "@/components/ui/InfoTip";
import type { PlatformFeeBase, RoundingStep, VolumeTier } from "@/lib/calcState";
import { BUILTIN_PRESETS, getPresetsForModel, type PresetId, type PresetTag } from "@/lib/presets";

// ✅ Provider plumbing
import { getProvider, DEFAULT_PROVIDER_ID } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers/types";

// ✅ UI policy (single source of truth for controls/sections)
import { getUiPolicy } from "@/lib/calculator/uiPolicy";

// ✅ icons
import { FiPlus, FiTrash2 } from "react-icons/fi";

// ✅ PostHog (usage analytics)
import posthog from "posthog-js";

function isValidDecimalInput(v: string) {
  // allows: "", "12", "12.", "12.3", "12.34"
  // blocks: letters, multiple dots, scientific notation, symbols
  // blocks: more than 2 decimals ("12.345")
  return /^\d*(?:\.\d{0,2})?$/.test(v);
}

/** Gold hairline divider (same as ResultsCard) */
function GoldDivider() {
  return (
    <div className="my-7">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-300/25 to-transparent" />
      <div className="mt-[1px] h-px w-full bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    </div>
  );
}

/** Small / tight divider for Advanced tools sub-sections */
function MiniDivider() {
  return (
    <div className="my-6">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/12 to-transparent" />
    </div>
  );
}

/** Small section header used for Provider / Basics / Pricing / Platform / Tax / Tools */
function GroupLabel({ text }: { text: string }) {
  return (
    <div className="mb-3 flex items-center justify-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
        {text}
      </div>
    </div>
  );
}

/**
 * ✅ More compact label + consistent, far-right “i”
 * NOTE: InfoTip is itself a button. Wrapping it in a <span> is safe.
 */
function LabelRow({
  label,
  tip,
  right,
  containerRef,
}: {
  label: string;
  tip?: React.ReactNode;
  right?: React.ReactNode;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div className="mb-1.5 flex h-5 items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/75">
          {label}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {tip ? (
          <span
            className={[
              "flex h-4.5 w-4.5 items-center justify-center rounded-full",
              "border border-white/16 bg-white/5",
              "shadow-[0_8px_18px_rgba(0,0,0,0.55)]",
              "shrink-0",
            ].join(" ")}
          >
            <InfoTip text={tip} containerRef={containerRef} />
          </span>
        ) : null}

        {right ? <div className="flex shrink-0 items-center">{right}</div> : null}
      </div>
    </div>
  );
}

/** More compact “premium” field shell */
function FieldShell({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <div
      className={[
        "relative flex h-10 items-center rounded-xl border",
        "border-white/12 bg-black/30",
        "shadow-[0_12px_38px_rgba(0,0,0,0.62)]",
        "transition",
        "hover:border-amber-300/18 hover:bg-black/40",
        "focus-within:border-amber-300/45 focus-within:ring-4 focus-within:ring-amber-400/15",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl",
        "before:bg-[radial-gradient(560px_80px_at_18%_0%,rgba(255,227,160,0.10),transparent_55%)]",
        "before:opacity-70",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function DisabledHint({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="mt-2 text-[11px] text-white/45">{text}</div>;
}

function BadgePill({
  text,
  tone,
}: {
  text: string;
  tone?: "muted" | "info" | "warning" | "success";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200/90"
      : tone === "warning"
      ? "border-amber-300/25 bg-amber-400/10 text-amber-100/90"
      : tone === "info"
      ? "border-sky-300/25 bg-sky-400/10 text-sky-100/90"
      : "border-white/14 bg-white/5 text-white/60";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        cls,
      ].join(" ")}
    >
      {text}
    </span>
  );
}

function Banner({
  tone,
  title,
  text,
}: {
  tone: "info" | "warning" | "success";
  title?: string;
  text: string;
}) {
  const ring =
    tone === "success"
      ? "border-emerald-300/18"
      : tone === "warning"
      ? "border-amber-300/18"
      : "border-white/14";
  const bg =
    tone === "success" ? "bg-emerald-500/10" : tone === "warning" ? "bg-amber-500/10" : "bg-white/5";

  return (
    <div
      className={[
        "rounded-2xl border p-4 shadow-[0_12px_45px_rgba(0,0,0,0.55)]",
        ring,
        bg,
      ].join(" ")}
    >
      {title ? <div className="text-[12px] font-semibold text-white/85">{title}</div> : null}
      <div className="mt-1 text-[12px] text-white/70">{text}</div>
    </div>
  );
}

function ToolSection(props: {
  title: string;
  subtitle?: string;
  accent?: "amber" | "rose" | "emerald";
  right?: React.ReactNode; // ✅ NEW
  children: React.ReactNode;
}) {
  const { title, subtitle, accent = "amber", right, children } = props;

  const accentMap = {
    amber: "from-amber-300/20 via-amber-300/10 to-transparent",
    rose: "from-rose-300/18 via-rose-300/8 to-transparent",
    emerald: "from-emerald-300/18 via-emerald-300/8 to-transparent",
  } as const;

  const dotMap = {
    amber: "bg-amber-300/70 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]",
    rose: "bg-rose-300/70 shadow-[0_0_0_3px_rgba(244,63,94,0.12)]",
    emerald: "bg-emerald-300/70 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]",
  } as const;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black/16 shadow-[0_14px_50px_rgba(0,0,0,0.55)]">
      {/* soft accent wash */}
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className={`absolute inset-0 bg-[linear-gradient(90deg,${accentMap[accent]})]`} />
        <div className="absolute inset-0 bg-[radial-gradient(900px_260px_at_15%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
      </div>

      <div className="relative p-4 md:p-5">
        {/* section header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${dotMap[accent]}`} />
              <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                {title}
              </div>
            </div>
            {subtitle ? <div className="mt-1 text-[12px] text-white/45">{subtitle}</div> : null}
          </div>

          {/* ✅ right-side slot (toggle goes here) */}
          {right ? <div className="shrink-0 pt-[2px]">{right}</div> : null}
        </div>

        {/* content */}
        {children}
      </div>
    </div>
  );
}

function normalizeModelLabel(s: string | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function presetBucketLabel(args: {
  providerId: ProviderId;
  presetTag: PresetTag;
  productId: string;
  productLabel?: string;
  customProviderLabel?: string;
}) {
  const { providerId, presetTag, productId, productLabel, customProviderLabel } = args;

  const id = productId.toLowerCase();
  const label = (productLabel ?? "").toLowerCase();

  // ✅ CUSTOM PROVIDER
  if (providerId === "custom") {
    const base = (customProviderLabel ?? "").trim() || "Custom";

    // Treat "connect" as PLATFORM for custom providers
    if (presetTag === "connect") {
      return `${base} Platform Presets`;
    }

    return `${base} Card Presets`;
  }

  // STRIPE
  if (providerId === "stripe") {
    return presetTag === "connect"
      ? "Stripe Connect Presets"
      : "Stripe Card Presets";
  }

  // PAYPAL
  if (providerId === "paypal") {
    const isCheckout = id.includes("checkout") || label.includes("checkout");
    return isCheckout
      ? "PayPal Checkout Presets"
      : "PayPal Card Presets";
  }

  // ADYEN
  if (providerId === "adyen") {
    const isPlatform =
      id.includes("platform") ||
      id.includes("market") ||
      label.includes("platform") ||
      label.includes("market");

    return isPlatform
      ? "Adyen Platform Presets"
      : "Adyen Card Presets";
  }

  // CHECKOUT.COM
  if (providerId === "checkoutcom") {
    const isMarketplace =
      id.includes("market") || label.includes("market");

    return isMarketplace
      ? "Checkout.com Marketplace Presets"
      : "Checkout.com Card Presets";
  }

  return "Presets";
}

function useNumberTextSync(value: number) {
  const [text, setText] = useState<string>(() => String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return { text, setText };
}

function useNullableNumberTextSync(value: number | null) {
  const [text, setText] = useState<string>(() => (value === null ? "" : String(value)));
  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);
  return { text, setText };
}

function MoneyField(props: { value: number; onChange: (n: number) => void; disabled?: boolean; ariaLabel?: string }) {
  const { value, onChange, disabled, ariaLabel } = props;
  const { text, setText } = useNumberTextSync(value);

  return (
    <FieldShell disabled={disabled}>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidDecimalInput(raw)) return;
          setText(raw);
          if (raw === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const raw = text.trim();
          if (raw === "") {
            setText(String(value));
            return;
          }

          const normalized = raw.endsWith(".") ? raw.slice(0, -1) : raw;
          const n = Number(normalized);

          if (!Number.isFinite(n)) {
            setText(String(value));
            return;
          }

          const fixed = Number(n.toFixed(2));
          setText(String(fixed));
          onChange(fixed);
        }}
        className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none disabled:cursor-not-allowed"
        aria-label={ariaLabel}
      />
    </FieldShell>
  );
}

function NullableMoneyField(props: {
  value: number | null;
  onChange: (n: number | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled, ariaLabel, placeholder } = props;
  const { text, setText } = useNullableNumberTextSync(value);

  return (
    <FieldShell disabled={disabled}>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidDecimalInput(raw)) return;
          setText(raw);

          if (raw.trim() === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const raw = text.trim();
          if (raw === "") {
            setText("");
            onChange(null);
            return;
          }

          const normalized = raw.endsWith(".") ? raw.slice(0, -1) : raw;
          const n = Number(normalized);

          if (!Number.isFinite(n)) {
            setText(value === null ? "" : String(value));
            return;
          }

          const fixed = Number(n.toFixed(2));
          setText(String(fixed));
          onChange(fixed);
        }}
        className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed"
        aria-label={ariaLabel}
      />
    </FieldShell>
  );
}

function SegmentedShell({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <div
      className={[
        "relative",
        "rounded-xl p-1",
        "border border-white/12",
        "bg-black/28",
        "shadow-[0_12px_38px_rgba(0,0,0,0.62)]",
        "transition",
        "hover:border-white/18 hover:bg-black/32",
        "focus-within:border-amber-300/35 focus-within:ring-4 focus-within:ring-[rgba(251,191,36,0.15)]",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl",
        "before:bg-[radial-gradient(520px_90px_at_18%_0%,rgba(255,227,160,0.10),transparent_60%)]",
        "before:opacity-60",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function UnitField(props: { value: number; onChange: (n: number) => void; disabled?: boolean; ariaLabel?: string }) {
  const { value, onChange, disabled, ariaLabel } = props;
  const { text, setText } = useNumberTextSync(value);

  return (
    <FieldShell disabled={disabled}>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidDecimalInput(raw)) return;
          setText(raw);
          if (raw === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const raw = text.trim();
          if (raw === "") {
            setText(String(value));
            return;
          }

          const normalized = raw.endsWith(".") ? raw.slice(0, -1) : raw;
          const n = Number(normalized);

          if (!Number.isFinite(n)) {
            setText(String(value));
            return;
          }

          const fixed = Number(n.toFixed(2));
          setText(String(fixed));
          onChange(fixed);
        }}
        className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none disabled:cursor-not-allowed"
        aria-label={ariaLabel}
      />
      <span className="relative z-10 mr-3.5 text-[12px] text-amber-100/55">%</span>
    </FieldShell>
  );
}

function NullableUnitField(props: {
  value: number | null;
  onChange: (n: number | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const { value, onChange, disabled, ariaLabel, placeholder } = props;
  const { text, setText } = useNullableNumberTextSync(value);

  return (
    <FieldShell disabled={disabled}>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidDecimalInput(raw)) return;
          setText(raw);

          if (raw.trim() === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const raw = text.trim();
          if (raw === "") {
            setText("");
            onChange(null);
            return;
          }

          const normalized = raw.endsWith(".") ? raw.slice(0, -1) : raw;
          const n = Number(normalized);

          if (!Number.isFinite(n)) {
            setText(value === null ? "" : String(value));
            return;
          }

          const fixed = Number(n.toFixed(2));
          setText(String(fixed));
          onChange(fixed);
        }}
        className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed"
        aria-label={ariaLabel}
      />
      <span className="relative z-10 mr-3.5 text-[12px] text-amber-100/55">%</span>
    </FieldShell>
  );
}

/**
 * ✅ MODE SEGMENT
 * - Forward click => setUseReverse(false)
 * - Reverse click => setUseReverse(true)
 */
function SegmentedMode({
  useReverse,
  setUseReverse,
  onUserEdit,
  disabled,
}: {
  useReverse: boolean;
  setUseReverse: (v: boolean) => void;
  onUserEdit: () => void;
  disabled?: boolean;
}) {
  return (
    <FieldShell disabled={disabled}>
      <div className="grid h-8 w-full grid-cols-2 rounded-lg bg-white/5 p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onUserEdit();
            setUseReverse(false);
          }}
          className={[
            "rounded-md text-[13px] font-semibold transition",
            "disabled:cursor-not-allowed disabled:opacity-60",
            !useReverse
              ? "bg-gradient-to-b from-amber-200/80 to-amber-400/30 text-black shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
              : "text-white/70 hover:bg-white/5",
          ].join(" ")}
        >
          Forward
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onUserEdit();
            setUseReverse(true);
          }}
          className={[
            "rounded-md text-[13px] font-semibold transition",
            "disabled:cursor-not-allowed disabled:opacity-60",
            useReverse
              ? "bg-gradient-to-b from-amber-200/80 to-amber-400/30 text-black shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
              : "text-white/70 hover:bg-white/5",
          ].join(" ")}
        >
          Reverse
        </button>
      </div>
    </FieldShell>
  );
}

/**
 * ✅ Provider segment (Stripe/PayPal/Adyen/Checkout.com + Custom)
 * - Adds a 3rd row "Custom" spanning both columns.
 * - ✅ Custom label is NOT editable inline (button is plain text).
 * - ✅ Only the input below (Custom provider section) is editable.
 */
function SegmentedProvider({
  providerId,
  setProviderId,
  onUserEdit,
  containerRef,
  disabled,
  customProviderLabel,
}: {
  providerId: ProviderId;
  setProviderId: (v: ProviderId) => void;
  onUserEdit: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  disabled?: boolean;

  customProviderLabel?: string;
  setCustomProviderLabel?: (s: string) => void; // kept in prop type compatibility, but unused here by design
}) {
  // ✅ include custom provider row
  const candidates: ProviderId[] = ["stripe", "paypal", "adyen", "checkoutcom", "custom" as ProviderId];

  const providerTip = (
    <>
      Switch the payment provider used for the fee calculation.
      {"\n\n"}
      <strong>Stripe</strong> uses your Stripe tier table.
      {"\n"}
      <strong>PayPal</strong>, <strong>Adyen</strong>, and <strong>Checkout.com</strong> use their own fee models based on
      account and transaction type.
      {"\n"}
      <strong>Custom</strong> lets you label the provider (for display) while still using your chosen product bucket and
      overrides for what-if maths.
      {"\n\n"}
      Some controls (like <strong>Pricing tier</strong>) are <strong>Stripe-specific</strong>, so they won’t appear for
      non-Stripe providers.
    </>
  );

  const customLabelValue = (customProviderLabel ?? "").trim();
  const customDisplay = customLabelValue.length ? customLabelValue : "Custom Provider";

  return (
    <div>
      <LabelRow label="Provider" tip={providerTip} containerRef={containerRef} />

      <SegmentedShell disabled={disabled}>
        <div
          className={[
            "relative z-10 overflow-hidden rounded-lg",
            "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
            "focus-within:ring-4 focus-within:ring-[rgba(251,191,36,0.15)]",
            "focus-within:border-amber-300/35",
            "outline-none",
          ].join(" ")}
        >
          <div className="grid grid-cols-2 gap-px bg-white/18">
            {candidates.map((id) => {
              const isCustom = id === ("custom" as ProviderId);
              const active = providerId === id;

              const spanCls = isCustom ? "col-span-2" : "";

              const label = isCustom ? customDisplay : getProvider(id).label ?? String(id);

              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => {
                    onUserEdit();
                    setProviderId(id);
                  }}
                  className={[
                    "relative flex h-8 items-center justify-center px-3",
                    "transition-all duration-150",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    "outline-none focus:outline-none focus-visible:outline-none",
                    active ? "bg-transparent" : "bg-black/30 hover:bg-black/24",
                    spanCls,
                  ].join(" ")}
                >
                  {/* Active gold plate */}
                  {active ? (
                    <>
                      <span
                        className={[
                          "pointer-events-none absolute inset-0",
                          "bg-[linear-gradient(180deg,rgba(255,227,160,0.86),rgba(212,175,55,0.22))]",
                          "shadow-[inset_0_1px_0_rgba(255,255,255,0.30),inset_0_-14px_22px_rgba(0,0,0,0.22)]",
                        ].join(" ")}
                      />
                      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(260px_70px_at_50%_-20%,rgba(255,255,255,0.26),transparent_62%)] opacity-70" />
                    </>
                  ) : (
                    <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(240px_80px_at_50%_0%,rgba(255,255,255,0.06),transparent_64%)] opacity-60" />
                  )}

                  {/* ✅ Label (plain text only — NOT editable) */}
                  <span
                    className={[
                      "relative z-10 truncate",
                      "text-[16px] font-semibold tracking-wide",
                      active ? "text-[#0f0f0f] font-semibold" : "text-white/80",
                    ].join(" ")}
                    title={label}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
        </div>
      </SegmentedShell>
    </div>
  );
}

/**
 * ✅ Provider product selector (model under the provider)
 */
function ProviderProductSelect({
  providerId,
  productId,
  setProductId,
  onUserEdit,
  containerRef,
  disabled,
}: {
  providerId: ProviderId;
  productId: string;
  setProductId: (v: string) => void;
  onUserEdit: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  const provider = getProvider(providerId);
  const products = provider.products ?? [];

  const safeProductId = products.some((p) => p.id === productId) ? productId : products[0]?.id ?? "";
  const activeProduct = products.find((p) => p.id === safeProductId) ?? products[0];

  useEffect(() => {
    if (!products.length) return;
    if (products.some((p) => p.id === productId)) return;
    setProductId(products[0].id);
  }, [providerId, products, productId, setProductId]);

  const productTip = (
    <>
      Choose the <strong>fee model</strong> for the selected provider.
      {"\n\n"}
      <strong>Cards</strong>: You sell directly to customers and receive the full payment (minus provider fees).
      {"\n"}
      <strong>Platform</strong>: You take a fee from transactions between buyers and sellers on your platform. Some
      providers use different names for this model.
      {"\n\n"}
      <strong>Stripe</strong>: Cards or Connect (platform)
      {"\n"}
      <strong>PayPal</strong>: Cards or Checkout (platform)
      {"\n"}
      <strong>Adyen</strong>: Cards or Platform
      {"\n"}
      <strong>Checkout.com</strong>: Cards or Marketplace (platform)
      {"\n\n"}
      Presets below are filtered to show <strong>only the presets relevant to the selected product</strong>.
    </>
  );

  return (
    <div>
      <LabelRow label="Product" tip={productTip} containerRef={containerRef} />

      {products.length <= 1 ? (
        <FieldShell disabled={disabled}>
          <div className="relative z-10 w-full px-3.5 text-[13px] font-semibold text-white">
            {activeProduct?.label ?? provider.label}
          </div>
        </FieldShell>
      ) : (
        <FieldShell disabled={disabled}>
          <select
            disabled={disabled}
            value={safeProductId}
            onChange={(e) => {
              onUserEdit();
              setProductId(e.target.value);
            }}
            className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                       [color-scheme:dark]
                       [&>option]:bg-zinc-900 [&>option]:text-white
                       disabled:cursor-not-allowed"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </FieldShell>
      )}
    </div>
  );
}

export type SensitivityTarget = "stripe" | "fx" | "platform" | "all";
export type { PresetId };

function TogglePill({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      aria-disabled={disabled ? true : undefined}
      className={[
        "relative inline-flex h-4.5 w-8 items-center rounded-full border transition",
        disabled ? "cursor-not-allowed opacity-50" : "",
        checked ? "border-amber-300/40 bg-amber-400/20" : "border-white/14 bg-white/5 hover:bg-white/8",
        "shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 rounded-full transition",
          checked ? "translate-x-[14px] bg-amber-200" : "translate-x-[2px] bg-white/65",
        ].join(" ")}
      />
    </button>
  );
}

/**
 * ✅ FIX (Hydration + invalid HTML):
 * - CollapsibleHeader is NO LONGER a <button>.
 * - Uses an accessible div with role="button".
 * ✅ NEW:
 * - optional analyticsKey + onToggle callback (for PostHog tracking)
 */
function CollapsibleHeader({
  title,
  open,
  setOpen,
  right,
  analyticsKey,
  onToggle,
}: {
  title: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  right?: React.ReactNode;
  analyticsKey?: string;
  onToggle?: (nextOpen: boolean, key?: string) => void;
}) {
  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next, analyticsKey);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className={[
        "mb-3 flex w-full items-center gap-3",
        "rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        "shadow-[0_12px_35px_rgba(0,0,0,0.55)]",
        "hover:border-white/16 hover:bg-white/7",
        "cursor-pointer select-none outline-none",
        "focus-visible:ring-4 focus-visible:ring-amber-400/15 focus-visible:border-amber-300/25",
      ].join(" ")}
    >
      <div className="flex-1" />
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55">{title}</div>

      <div className="ml-auto flex flex-1 items-center justify-end gap-3">
        {right ? (
          <div
            className="flex items-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {right}
          </div>
        ) : null}

        <div className="text-[11px] text-white/45">{open ? "Hide" : "Show"}</div>
      </div>
    </div>
  );
}

/**
 * ✅ Preset model mapping:
 * - Stripe: use policy kind (cards/connect)
 * - PayPal: map product -> cards/connect bucket ("checkout" = connect)
 * - Adyen / Checkout.com: map platform/marketplace-ish products to connect bucket
 */
function inferPresetTag(args: {
  providerId: ProviderId;
  policyKind: "cards" | "connect";
  productId: string;
  productLabel?: string;
}): PresetTag {
  const { providerId, policyKind, productId, productLabel } = args;

  // Stripe uses policy kind directly
  if (providerId === "stripe") {
    return policyKind === "connect" ? "connect" : "cards";
  }

  const id = normalizeModelLabel(productId);
  const label = normalizeModelLabel(productLabel);

  // PayPal: checkout behaves like connect/marketplace thinking
  if (providerId === "paypal") {
    const isCheckout = id.includes("checkout") || label.includes("checkout");
    return isCheckout ? "connect" : "cards";
  }

  // Adyen: platform/marketplace products should map to connect
  if (providerId === "adyen") {
    const isPlatformLike =
      id.includes("platform") || id.includes("market") || label.includes("platform") || label.includes("market");
    return isPlatformLike ? "connect" : "cards";
  }

  // Checkout.com: marketplace should map to connect
  if (providerId === "checkoutcom") {
    const isMarketplace = id.includes("market") || label.includes("market");
    return isMarketplace ? "connect" : "cards";
  }

  // Fallback: use policy kind
  return policyKind === "connect" ? "connect" : "cards";
}

/**
 * ✅ Hint copy mapping:
 * - Stripe cards/connect
 * - PayPal card/checkout
 * - Adyen cards/platform
 * - Checkout.com cards/marketplace
 * - ✅ Custom (uses edited label in title when present)
 */
function buildActiveModelHint(args: {
  providerId: ProviderId;
  productId: string;
  productLabel?: string;
  presetTag: PresetTag;
  platformFeePercent: number;

  // ✅ NEW (optional)
  providerDisplayName?: string;
}): { tone: "info" | "warning"; title: string; text: string } | null {
  const { providerId, productId, productLabel, presetTag, platformFeePercent } = args;

  const id = normalizeModelLabel(productId);
  const label = normalizeModelLabel(productLabel);

  const providerName =
    (args.providerDisplayName ?? "").trim() ||
    (() => {
      const p = getProvider(providerId);
      return (p?.label ?? String(providerId)).trim();
    })();

  // ✅ Custom provider hint (cards vs platform-aware)
  if (providerId === ("custom" as ProviderId)) {
    const isPlatformLike = presetTag === "connect";

    if (isPlatformLike) {
      return platformFeePercent === 0
        ? {
            tone: "info",
            title: `Hint - ${providerName}: ${productLabel ?? "Platform"}`,
            text:
              "Platform or marketplace flows usually include a platform fee. " +
              "If you take a cut, set Platform fee %. If not, leaving it at 0 is fine.",
          }
        : {
            tone: "info",
            title: `Hint - ${providerName}: ${productLabel ?? "Platform"}`,
            text:
              "Platform fee % is enabled. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
          };
    }

    // Card-style flow
    return platformFeePercent > 0
      ? {
          tone: "info",
          title: `Hint - ${providerName}: Card processing`,
          text:
            "Card processing is usually simple ecommerce. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
        }
      : {
          tone: "info",
          title: `Hint - ${providerName}: Card processing`,
          text:
            "Card processing is usually simple ecommerce. Platform fee % is often 0 unless you’re taking a marketplace cut.",
        };
  }

  // --- PayPal ---
  if (providerId === "paypal") {
    const isCheckout = id.includes("checkout") || label.includes("checkout");
    if (!isCheckout) {
      return platformFeePercent > 0
        ? {
            tone: "info",
            title: "Hint - PayPal: Card processing",
            text:
              "Card processing is usually simple ecommerce. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
          }
        : {
            tone: "info",
            title: "Hint - PayPal: Card processing",
            text:
              "Card processing is usually simple ecommerce. Platform fee % is often 0 unless you’re taking a marketplace cut.",
          };
    }

    if (platformFeePercent === 0) {
      return {
        tone: "info",
        title: "Hint - PayPal: Checkout",
        text:
          "Checkout flows sometimes behave like marketplace/platform pricing. If you take a cut, set Platform fee %. If not, leaving it at 0 is fine.",
      };
    }

    return {
      tone: "info",
      title: "Hint - PayPal: Checkout",
      text: "Platform fee % is enabled. Please consider enabling your marketplace/platform cut.",
    };
  }

  // --- Adyen ---
  if (providerId === "adyen") {
    const isPlatformLike =
      id.includes("platform") || id.includes("market") || label.includes("platform") || label.includes("market");

    if (!isPlatformLike) {
      return platformFeePercent > 0
        ? {
            tone: "info",
            title: "Hint - Adyen: Cards processing",
            text:
              "Cards processing is usually simple ecommerce. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
          }
        : {
            tone: "info",
            title: "Hint - Adyen: Cards processing",
            text:
              "Cards processing is usually simple ecommerce. Platform fee % is often 0 unless you’re taking a marketplace cut.",
          };
    }

    if (platformFeePercent === 0) {
      return {
        tone: "info",
        title: "Hint - Adyen: Platform / Marketplaces",
        text: "Platform/marketplace flows usually include a platform fee. Consider setting Platform fee %.",
      };
    }

    return {
      tone: "info",
      title: "Hint - Adyen: Platform / Marketplaces",
      text: "Platform fee % is enabled. Please consider enabling your marketplace/platform cut.",
    };
  }

  // --- Checkout.com ---
  if (providerId === "checkoutcom") {
    const isMarketplace = id.includes("market") || label.includes("market");

    if (!isMarketplace) {
      return platformFeePercent > 0
        ? {
            tone: "info",
            title: "Hint - Checkout.com: Cards processing",
            text:
              "Cards processing is usually simple ecommerce. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
          }
        : {
            tone: "info",
            title: "Hint - Checkout.com: Cards processing",
            text:
              "Cards processing is usually simple ecommerce. Platform fee % is often 0 unless you’re taking a marketplace cut.",
          };
    }

    if (platformFeePercent === 0) {
      return {
        tone: "info",
        title: "Hint - Checkout.com: Marketplace",
        text: "Marketplace flows usually include a platform fee. Consider setting Platform fee %.",
      };
    }

    return {
      tone: "info",
      title: "Hint - Checkout.com: Marketplace",
      text: "Platform fee % is enabled. Please consider enabling your marketplace/platform cut.",
    };
  }

  // --- Stripe (and other non-PayPal providers) ---
  if (presetTag === "cards") {
    return platformFeePercent > 0
      ? {
          tone: "info",
          title: "Hint - Stripe: Cards Processing",
          text:
            "Cards processing is usually simple ecommerce. If you’re not taking a marketplace cut, set Platform fee % back to 0.",
        }
      : {
          tone: "info",
          title: "Hint - Stripe: Cards Processing",
          text:
            "Cards processing is usually simple ecommerce. Platform fee % is often 0 unless you’re taking a marketplace cut.",
        };
  }

  if (platformFeePercent === 0) {
    return {
      tone: "info",
      title: "Hint - Stripe: Connect",
      text: "Connect/marketplace flows usually include a platform fee. Consider setting Platform fee %.",
    };
  }

  return {
    tone: "info",
    title: "Hint - Stripe: Connect",
    text: "Platform fee % is enabled. Please consider enabling your marketplace/platform cut.",
  };
}

/** Accept either number-ish or string-ish rounding steps safely */
function toRoundingStep(stepRaw: string, fallback: RoundingStep): RoundingStep {
  const n = Number(stepRaw);
  if (!Number.isFinite(n)) return fallback;
  // We only expose these steps in the UI.
  if (Math.abs(n - 0.01) < 1e-12) return 0.01 as RoundingStep;
  if (Math.abs(n - 0.05) < 1e-12) return 0.05 as RoundingStep;
  if (Math.abs(n - 0.1) < 1e-12) return 0.1 as RoundingStep;
  return fallback;
}

function clampPctOrNull(n: number | null): number | null {
  if (n === null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}
function clampMoneyOrNull(n: number | null): number | null {
  if (n === null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

function clampInt(n: number, min = 0) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.floor(n));
}

function parseLiveDecimal(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null; // transitional
  if (t.endsWith(".")) return null; // transitional like "8."
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function InputsCard(props: {
  activePresetId: PresetId | null;
  setActivePresetId: (id: PresetId | null) => void;

  providerId: ProviderId;
  setProviderId: (v: ProviderId) => void;

  // ✅ NEW (optional): custom provider label for the Custom button
  customProviderLabel?: string;
  setCustomProviderLabel?: (s: string) => void;

  productId: string;
  setProductId: (v: string) => void;

  region: Region;
  setRegion: (r: Region) => void;
  options: PricingOption[];
  pricingId: string;
  setPricingId: (id: string) => void;

  useReverse: boolean;
  setUseReverse: (v: boolean) => void;

  amount: number;
  setAmount: (n: number) => void;

  targetNet: number;
  setTargetNet: (n: number) => void;

  fxPercent: number;
  setFxPercent: (n: number) => void;

  platformFeePercent: number;
  setPlatformFeePercent: (n: number) => void;

  vatPercent: number;
  setVatPercent: (n: number) => void;

  platformFeeBase: PlatformFeeBase;
  setPlatformFeeBase: (v: PlatformFeeBase) => void;

  roundingStep: RoundingStep;
  setRoundingStep: (v: RoundingStep) => void;

  psychPriceOn: boolean;
  setPsychPriceOn: (v: boolean) => void;

  breakEvenOn: boolean;
  setBreakEvenOn: (v: boolean) => void;
  breakEvenTargetNet: number;
  setBreakEvenTargetNet: (n: number) => void;

  sensitivityOn: boolean;
  setSensitivityOn: (v: boolean) => void;
  sensitivityDeltaPct: number;
  setSensitivityDeltaPct: (n: number) => void;
  sensitivityTarget: SensitivityTarget;
  setSensitivityTarget: (v: SensitivityTarget) => void;

  // ✅ NEW: Fee % override section (nullable => “use provider default”)
  customProviderFeePercent: number | null;
  setCustomProviderFeePercent: (n: number | null) => void;
  customFixedFee: number | null;
  setCustomFixedFee: (n: number | null) => void;

  // ✅ NEW: Volume projections (Advanced tools)
  volumeOn: boolean;
  setVolumeOn: (v: boolean) => void;
  volumeTxPerMonth: number;
  setVolumeTxPerMonth: (n: number) => void;
  volumeRefundRatePct: number;
  setVolumeRefundRatePct: (n: number) => void;
  volumeTiers: VolumeTier[];
  setVolumeTiers: (tiers: VolumeTier[]) => void;
}) {
  const {
    activePresetId,
    setActivePresetId,

    providerId,
    setProviderId,

    // ✅ custom provider label
    customProviderLabel,
    setCustomProviderLabel,

    productId,
    setProductId,

    region,
    setRegion,
    options,
    pricingId,
    setPricingId,

    useReverse,
    setUseReverse,

    amount,
    setAmount,

    targetNet,
    setTargetNet,

    fxPercent,
    setFxPercent,

    platformFeePercent,
    setPlatformFeePercent,

    vatPercent,
    setVatPercent,

    platformFeeBase,
    setPlatformFeeBase,

    roundingStep,
    setRoundingStep,

    psychPriceOn,
    setPsychPriceOn,

    breakEvenOn,
    setBreakEvenOn,
    breakEvenTargetNet,
    setBreakEvenTargetNet,

    sensitivityOn,
    setSensitivityOn,
    sensitivityDeltaPct,
    setSensitivityDeltaPct,
    sensitivityTarget,
    setSensitivityTarget,

    customProviderFeePercent,
    setCustomProviderFeePercent,
    customFixedFee,
    setCustomFixedFee,

    volumeOn,
    setVolumeOn,
    volumeTxPerMonth,
    setVolumeTxPerMonth,
    volumeRefundRatePct,
    setVolumeRefundRatePct,
    volumeTiers,
    setVolumeTiers,
  } = props;

  const cardRef = useRef<HTMLElement | null>(null);

  const normalizedProviderId = (providerId ?? DEFAULT_PROVIDER_ID) as ProviderId;
  const provider = getProvider(normalizedProviderId);

  const products = provider.products ?? [];
  const safeProductId = useMemo(() => {
    return products.some((p) => p.id === productId) ? productId : products[0]?.id ?? "";
  }, [products, productId]);

  const activeProduct = useMemo(() => {
    return products.find((p) => p.id === safeProductId) ?? products[0];
  }, [products, safeProductId]);

  // ✅ display name for custom provider (used by hint + policy context)
  const providerDisplayName = useMemo(() => {
    if (normalizedProviderId === ("custom" as ProviderId)) {
      const t = (customProviderLabel ?? "").trim();
      return t.length ? t : "Custom";
    }
    return (provider.label ?? "").trim() || "Provider";
  }, [normalizedProviderId, customProviderLabel, provider.label]);

  // ✅ Ensure productId stays valid when provider changes
  useEffect(() => {
    if (!products.length) return;
    if (products.some((p) => p.id === productId)) return;
    setProductId(products[0].id);
  }, [products, productId, setProductId]);

  // ---------------------------------------------------------------------------
  // ✅ PostHog helpers (section opens + key actions + first-touch groups)
  // ---------------------------------------------------------------------------
  const phSeenRef = useRef<Record<string, number>>({});
  const phTouchedRef = useRef<Record<string, boolean>>({});

  const phBase = useMemo(
    () => ({
      component: "InputsCard",
      providerId: normalizedProviderId,
      providerLabel: providerDisplayName,
      productId: safeProductId,
      productLabel: activeProduct?.label ?? "",
      region,
      mode: useReverse ? "reverse" : "forward",
    }),
    [normalizedProviderId, providerDisplayName, safeProductId, activeProduct?.label, region, useReverse]
  );

  function phCapture(name: string, props?: Record<string, any>, cooldownMs = 400) {
  try {
    if (typeof window === "undefined") return;
    if (!posthog || typeof (posthog as any).capture !== "function") return;

    const merged = { ...phBase, ...(props ?? {}) };

    // ✅ stable throttle key: event + provider/product/region/mode (no dynamic values)
    const key = [
      name,
      String(merged.providerId ?? ""),
      String(merged.productId ?? ""),
      String(merged.region ?? ""),
      String(merged.mode ?? ""),
    ].join("|");

    const now = Date.now();
    const last = phSeenRef.current[key] ?? 0;
    if (cooldownMs > 0 && now - last < cooldownMs) return;

    phSeenRef.current[key] = now;

    // cap map size (simple, safe)
    const keys = Object.keys(phSeenRef.current);
    if (keys.length > 300) {
      for (let i = 0; i < 120; i++) {
        const k = keys[i];
        if (k) delete phSeenRef.current[k];
      }
    }

    (posthog as any).capture(name, merged);
  } catch {
    // ignore
  }
}



  function phFirstTouch(group: string, props?: Record<string, any>) {
    if (phTouchedRef.current[group]) return;
    phTouchedRef.current[group] = true;
    phCapture("inputs_first_touch", { group, ...(props ?? {}) }, 0);
  }

  function trackSectionOpen(section: string) {
    phCapture("inputs_section_opened", { section }, 700);
  }

  // ---------------------------------------------------------------------------
  // ✅ UI POLICY (single source of truth for controls/sections)
  // ---------------------------------------------------------------------------
  const policy = useMemo(() => {
    return getUiPolicy({
      providerId: normalizedProviderId,
      productId: safeProductId,
      product: activeProduct,
      providerLabel: providerDisplayName,
      productLabel: activeProduct?.label,
      mode: useReverse ? "reverse" : "forward",
    });
  }, [normalizedProviderId, safeProductId, activeProduct, providerDisplayName, useReverse]);

  // Convenience accessors
  const ctrl = policy.controls;
  const sec = policy.sections;

  // ---------------------------------------------------------------------------
  // ✅ PRESETS: filter by PRODUCTS (Stripe: policy kind, others: mapped)
  // ---------------------------------------------------------------------------
  const presetTag: PresetTag = useMemo(() => {
    const policyKind = policy.context.kind === "connect" ? "connect" : "cards";
    return inferPresetTag({
      providerId: normalizedProviderId,
      policyKind,
      productId: safeProductId,
      productLabel: activeProduct?.label,
    });
  }, [normalizedProviderId, policy.context.kind, safeProductId, activeProduct?.label]);

  const presetsForModel = useMemo(() => {
    return getPresetsForModel(presetTag);
  }, [presetTag]);

  // If user switches model and the currently selected preset is no longer visible, clear it.
  useEffect(() => {
    if (!activePresetId) return;
    const stillVisible = presetsForModel.some((p) => p.id === activePresetId);
    if (!stillVisible) setActivePresetId(null);
  }, [activePresetId, presetsForModel, setActivePresetId]);

  // Collapsible state driven by policy defaults
  const [openPresets, setOpenPresets] = useState<boolean>(policy.sections.presets.defaultExpanded);
  const [openBasics, setOpenBasics] = useState<boolean>(policy.sections.basics.defaultExpanded);
  const [openPricing, setOpenPricing] = useState<boolean>(policy.sections.pricing.defaultExpanded);
  const [openPlatform, setOpenPlatform] = useState<boolean>(policy.sections.platform.defaultExpanded);
  const [openTax, setOpenTax] = useState<boolean>(policy.sections.tax.defaultExpanded);
  const [openTools, setOpenTools] = useState<boolean>(policy.sections.tools.defaultExpanded);

  // ✅ Fee override collapsible
  const [openFeeOverride, setOpenFeeOverride] = useState<boolean>(true);

  useEffect(() => {
    // When provider/model changes, reset to policy defaults
    setOpenPresets(policy.sections.presets.defaultExpanded);
    setOpenBasics(policy.sections.basics.defaultExpanded);
    setOpenPricing(policy.sections.pricing.defaultExpanded);
    setOpenPlatform(policy.sections.platform.defaultExpanded);
    setOpenTax(policy.sections.tax.defaultExpanded);
    setOpenTools(policy.sections.tools.defaultExpanded);

    // keep your new section predictable
    setOpenFeeOverride(true);
  }, [policy.sections, normalizedProviderId, safeProductId]);

  const clearPreset = () => setActivePresetId(null);

  // Keep tier consistent (even if tier UI is hidden for non-Stripe, this keeps state valid)
  useEffect(() => {
    const tierOk = options.some((o) => o.id === pricingId);
    if (!tierOk && options[0]) setPricingId(options[0].id);
  }, [options, pricingId, setPricingId]);

  // FX normalize
  useEffect(() => {
    const safe = Number.isFinite(fxPercent) ? Math.max(0, fxPercent) : 0;
    if (safe !== fxPercent) setFxPercent(safe);
  }, [fxPercent, setFxPercent]);

  // Volume tiers: ensure at least 1 tier exists (safe UX)
  useEffect(() => {
    if (volumeTiers && volumeTiers.length) return;
    setVolumeTiers([{ id: uid(), price: Math.max(0, amount || 10), sharePct: 100, fxPercent: Math.max(0, fxPercent || 0) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(id: PresetId) {
    const p = (BUILTIN_PRESETS as any[]).find((x) => x?.id === id);
    if (!p) return;

    phCapture("inputs_preset_applied", { presetId: id, presetTag }, 0);

    setActivePresetId(id);

    const s = (p?.state ?? {}) as any;

    // Provider/model overrides (if present) first
    if (typeof s.providerId === "string") setProviderId(s.providerId as ProviderId);
    if (typeof s.productId === "string") setProductId(String(s.productId));

    if (typeof s.platformFeePercent === "number") setPlatformFeePercent(s.platformFeePercent);
    if (s.platformFeeBase === "gross" || s.platformFeeBase === "afterStripe") setPlatformFeeBase(s.platformFeeBase);

    if (typeof s.fxPercent === "number") {
      const safe = Number.isFinite(s.fxPercent) ? Math.max(0, s.fxPercent) : 0;
      setFxPercent(safe);
    }

    if (s.mode === "forward" || s.mode === "reverse") setUseReverse(s.mode === "reverse");

    // ✅ RoundingStep can be number-like OR string-like depending on where it came from
    if (typeof s.roundingStep === "number" || typeof s.roundingStep === "string") {
      const next = toRoundingStep(String(s.roundingStep), roundingStep);
      setRoundingStep(next);
    }
    if (typeof s.psychPriceOn === "boolean") setPsychPriceOn(s.psychPriceOn);

    // Presets do NOT touch: amount/targetNet, pricing tier, VAT, or tools toggles.
  }

  const isReverseMode = useReverse;
  const priceFieldLabel = isReverseMode ? "Target net" : "Price";

  // Tips
  const regionTip = (
    <>
      Select the region where your <strong>payment account</strong> is registered.
      {"\n\n"}
      This controls currency behaviour and default fee assumptions.
    </>
  );

  const pricingTierTip = (
    <>
      Choose the Stripe pricing tier that best matches your expected <strong>customer mix</strong>.
      {"\n\n"}
      This is Stripe-only and comes from your <strong>PRICING</strong> table.
    </>
  );

  const modeTip = (
    <>
      <strong>Forward</strong>: enter customer price → see net.
      {"\n"}
      <strong>Reverse</strong>: enter target net → solve required customer charge.
    </>
  );

  const priceFieldTip = isReverseMode ? (
    <>Enter the <strong>net you want to keep</strong> after fees. We’ll solve the required customer charge.</>
  ) : (
    <>Enter the <strong>price the customer pays</strong>. We’ll show net after fees.</>
  );

  const fxTip = (
    <>
      FX conversion percentage used when the provider converts currency.
      {"\n\n"}
      <strong>0%</strong> → no FX applied. <strong>&gt; 0%</strong> → adds FX cost.
    </>
  );

  const roundingTip = <>Rounds the final customer price (and optional psych pricing), then recalculates fees from that final charge.</>;

  const platformFeeTip = <>Your own platform/marketplace fee percentage (separate from provider fees).</>;

  const platformAppliedOnTip = (
    <>
      What your platform fee % is calculated from.
      {"\n\n"}
      <strong>From gross</strong> = from customer charge.
      {"\n"}
      <strong>After provider</strong> = after the provider fee is removed (key name kept as <code>afterStripe</code> for now).
    </>
  );

  const vatTip = <>VAT is shown separately (not a provider fee) so you can see the tax component and net after VAT.</>;

  const breakEvenTip = <>Computes the customer price required to hit a target net using your current settings.</>;

  const feeImpactTip = (
    <>
      Estimates net change if selected fee(s) drift by <strong>±Δ</strong>.
      {"\n\n"}
      (Currently calculated using Stripe math in the engine.)
    </>
  );

  const affectedFeeTip = <>Choose which fee(s) drift during the fee impact simulation.</>;

  const feeOverrideTip = (
    <>
      Optional overrides for the <strong>provider fee model</strong>.
      {"\n\n"}
      Leave blank to use the provider’s default math (Stripe tiers / PayPal / Adyen / Checkout.com models).
      {"\n"}
      Set a value to force the engine to use your override instead.
    </>
  );

  const tierFxTip = (
    <>
      FX % for this basket tier (put it here for multi-currency mixes).
      {"\n\n"}
      Use <strong>0%</strong> if this tier is in the same currency. Use a positive % if currency conversion applies.
    </>
  );

  // ✅ Unified hint banner (Stripe + PayPal + Adyen + Checkout.com + Custom)
  const activeModelHint = useMemo(() => {
    return buildActiveModelHint({
      providerId: normalizedProviderId,
      productId: safeProductId,
      productLabel: activeProduct?.label,
      presetTag,
      platformFeePercent,
      providerDisplayName,
    });
  }, [normalizedProviderId, safeProductId, activeProduct?.label, presetTag, platformFeePercent, providerDisplayName]);

  // Basics layout: hide Stripe-only “Pricing tier” for non-Stripe providers
  const showPricingTier = ctrl.pricingTier.enabled && normalizedProviderId === "stripe";

  // Used only for sensitivity labels
  const providerName =
    providerDisplayName?.trim()?.length ? providerDisplayName.trim() : provider.label?.trim() ? provider.label.trim() : "Provider";

  // ✅ Robust rounding select value even if RoundingStep becomes string-ish later
  const roundingKey = String(roundingStep);

  // Volume derived
  const volumeShareSum = useMemo(() => {
    return (volumeTiers ?? []).reduce((acc, t) => acc + (Number.isFinite(t.sharePct) ? t.sharePct : 0), 0);
  }, [volumeTiers]);

  const volumeAllocatedBadge = useMemo(() => {
    const s = Math.round(volumeShareSum * 1000) / 1000;
    if (Math.abs(s - 100) < 1e-6) return { text: "100% allocated", tone: "success" as const };
    if (s < 100) return { text: `${Math.max(0, Math.round((100 - s) * 10) / 10)}% unallocated`, tone: "warning" as const };
    return { text: `${Math.round((s - 100) * 10) / 10}% over`, tone: "warning" as const };
  }, [volumeShareSum]);

  const currencySymbol = region === "EU" ? "€" : region === "US" ? "$" : "£";

  // ✅ Tier price draft text (so users can type decimals like "8." then "8.50")
  const [tierPriceTextById, setTierPriceTextById] = useState<Record<string, string>>({});
  const [editingTierPriceId, setEditingTierPriceId] = useState<string | null>(null);

  // ✅ Keep draft text in sync with state (but don't overwrite the one currently being edited)
  useEffect(() => {
    setTierPriceTextById((prev) => {
      const next: Record<string, string> = { ...prev };

      const ids = new Set((volumeTiers ?? []).map((t) => t.id));

      // remove drafts for deleted tiers
      for (const key of Object.keys(next)) {
        if (!ids.has(key)) delete next[key];
      }

      // set drafts for existing tiers (skip active editor)
      for (const t of volumeTiers ?? []) {
        if (t.id === editingTierPriceId) continue;
        next[t.id] = String(Number.isFinite(t.price) ? t.price : 0);
      }

      return next;
    });
  }, [volumeTiers, editingTierPriceId]);

  function updateTier(id: string, patch: Partial<VolumeTier>) {
    const next = (volumeTiers ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t));
    setVolumeTiers(next);
  }

  function addTier() {
    const next = [
      ...(volumeTiers ?? []),
      { id: uid(), price: Math.max(0, amount || 10), sharePct: 0, fxPercent: Math.max(0, fxPercent || 0) },
    ];
    setVolumeTiers(next);
  }

  function removeTier(id: string) {
    const cur = volumeTiers ?? [];
    if (cur.length <= 1) return;
    setVolumeTiers(cur.filter((t) => t.id !== id));
  }

  // ---------------------------------------------------------------------------
  // ✅ Minimal tracking hooks for the main collapsible sections
  // ---------------------------------------------------------------------------
  function onSectionToggle(nextOpen: boolean, key?: string) {
    if (!nextOpen) return;
    if (!key) return;
    trackSectionOpen(key);
  }

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
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_900px_at_50%_45%,rgba(255,227,160,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_700px_at_50%_60%,rgba(212,175,55,0.09),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_220px_at_14%_0%,rgba(255,227,160,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,227,160,0.06),transparent_45%,rgba(212,175,55,0.06))]" />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="relative mb-10 flex justify-center text-center">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/35 bg-amber-400/15 text-sm font-extrabold text-amber-200 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
                1
              </div>
              <h2 className="text-lg font-bold text-white">Decisions</h2>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <p className="max-w-md text-sm text-white/60">
Configure pricing, fees and your economic assumptions.              </p>
            </div>
          </div>
        </div>

        {/* Optional banners from policy */}
        {policy.banners.length ? (
          <div className="mb-6 space-y-3">
            {policy.banners.map((b, i) => (
              <Banner key={i} tone={b.tone} title={b.title} text={b.text} />
            ))}
          </div>
        ) : null}

        <div className="space-y-6">
          {/* ✅ PROVIDERS (Payment Providers + Presets merged cosmetically) */}
          {sec.provider.visible || sec.presets.visible ? (
            <div
              className={[
                "rounded-3xl border border-white/18 bg-black/22 p-5",
                "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
              ].join(" ")}
            >
              <GroupLabel text="Payment providers" />

              {/* ===== Provider + Product ===== */}
              {sec.provider.visible ? (
                <div className="grid gap-5 md:grid-cols-3 md:items-start">
                  {/* LEFT: Provider */}
                  <div className="md:col-span-2">
                    <SegmentedProvider
                      providerId={normalizedProviderId}
                      setProviderId={(v) => {
                        phFirstTouch("provider");
                        phCapture("inputs_provider_selected", { selectedProviderId: v }, 0);
                        clearPreset();
                        setProviderId(v);
                      }}
                      onUserEdit={() => {
                        phFirstTouch("provider");
                        clearPreset();
                      }}
                      containerRef={cardRef}
                      disabled={!ctrl.providerId.enabled}
                      customProviderLabel={customProviderLabel}
                      setCustomProviderLabel={setCustomProviderLabel}
                    />
                    <DisabledHint text={!ctrl.providerId.enabled ? ctrl.providerId.disabledReason : undefined} />

                    {/* ✅ Custom provider section only when Custom is selected */}
                    {normalizedProviderId === ("custom" as ProviderId) ? (
                      <div className="mt-6">
                        <div className="grid gap-3">
                          <LabelRow
                            label="Custom provider"
                            tip={
                              <>
                                It names the payment provider shown in the UI (for example: <em>Worldpay</em> or a local payment service provider).
                                <br />
                                <br />
                                <strong>Important:</strong> Custom Provider fees default to 0. To apply fees of your choice, go to Provider Fee Override section and set the Fee % and/or Fixed fee.
                                <br />
                                <br />
                                Allowed characters: letters and numbers.
                                <br />
                                Maximum length: 20 characters.
                              </>
                            }
                            containerRef={cardRef}
                            right={
                              <BadgePill
                                text={`${Math.min(20, (customProviderLabel ?? "").length)}/20`}
                                tone={(customProviderLabel ?? "").trim().length ? "info" : "muted"}
                              />
                            }
                          />

                          <FieldShell disabled={!ctrl.providerId.enabled}>
                            <input
                              value={customProviderLabel ?? ""}
                              placeholder="Custom Provider"
                              inputMode="text"
                              autoComplete="off"
                              disabled={!ctrl.providerId.enabled}
                              onChange={(e) => {
                                phFirstTouch("custom_provider_label");
                                const next = e.target.value.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20);
                                clearPreset();
                                setCustomProviderLabel?.(next);
                              }}
                              onBlur={() => {
                                const tidy = (customProviderLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
                                if (tidy !== (customProviderLabel ?? "")) {
                                  clearPreset();
                                  setCustomProviderLabel?.(tidy);
                                }
                                phCapture("inputs_custom_provider_label_committed", { length: tidy.length }, 0);
                              }}
                              className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed"
                              aria-label="Custom provider name"
                            />
                          </FieldShell>

                          <DisabledHint text={!ctrl.providerId.enabled ? ctrl.providerId.disabledReason : undefined} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* RIGHT: Product */}
                  <div className="flex items-start justify-end">
                    <div className="w-full md:w-[260px]">
                      <ProviderProductSelect
                        providerId={normalizedProviderId}
                        productId={safeProductId}
                        setProductId={(v) => {
                          phFirstTouch("product");
                          phCapture("inputs_product_selected", { selectedProductId: v }, 0);
                          clearPreset();
                          setProductId(v);
                        }}
                        onUserEdit={() => {
                          phFirstTouch("product");
                          clearPreset();
                        }}
                        containerRef={cardRef}
                        disabled={!ctrl.productId.enabled}
                      />
                      <DisabledHint text={!ctrl.productId.enabled ? ctrl.productId.disabledReason : undefined} />
                    </div>
                  </div>

                  {/* FULL-WIDTH HINT */}
                  {activeModelHint ? (
                    <div className="md:col-span-3">
                      <div className="mt-4">
                        <Banner tone={activeModelHint.tone} title={activeModelHint.title} text={activeModelHint.text} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Divider between provider controls and presets (only if both visible) */}
              {sec.provider.visible && sec.presets.visible ? <MiniDivider /> : null}

              {/* ===== Presets (inline — no collapsible header) ===== */}
              {sec.presets.visible ? (
                <div className="mt-1">
                  {sec.presets.helper ? (
                    <div className="mb-4">
                      <Banner tone={sec.presets.helper.tone} title={sec.presets.helper.title} text={sec.presets.helper.text} />
                    </div>
                  ) : null}

                  <div className="grid gap-3">
                    <LabelRow
                      label="Scenario presets"
                      tip={
                        <>
                          Presets are <strong>ready-made scenario bundles</strong> (quick starting points).
                          {"\n\n"}
                          This dropdown is filtered to show <strong>only</strong>:
                          {"\n"}• <strong>No preset</strong>
                          {"\n"}• The <strong>4 presets</strong> for your product bucket:{" "}
                          <strong>{presetTag === "connect" ? "Connect" : "Cards"}</strong>
                          {"\n\n"}
                          Presets can change: FX, platform fee, fee base, mode, rounding, psych pricing.
                          {"\n"}
                          They don’t change: Region, price/target, pricing tier, VAT, or tools toggles.
                        </>
                      }
                      containerRef={cardRef}
                      right={
                        <BadgePill
                          text={presetBucketLabel({
                            providerId: normalizedProviderId,
                            presetTag,
                            productId: safeProductId,
                            productLabel: activeProduct?.label,
                            customProviderLabel,
                          })}
                          tone={presetTag === "connect" ? "info" : "muted"}
                        />
                      }
                    />

                    <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
                      <div className="min-w-0 flex-1">
                        <FieldShell>
                          <select
                            value={activePresetId ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                phCapture("inputs_preset_cleared", { from: activePresetId ?? "" }, 0);
                                clearPreset();
                                return;
                              }
                              applyPreset(v as PresetId);
                            }}
                            className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                              [color-scheme:dark]
                              [&>option]:bg-zinc-900 [&>option]:text-white"
                          >
                            <option value="">No preset</option>
                            {presetsForModel.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </FieldShell>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          phCapture("inputs_preset_cleared", { from: activePresetId ?? "" }, 0);
                          clearPreset();
                        }}
                        className={[
                          "w-full md:w-[170px] rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                          "border-white/14 bg-black/18 text-white/70 hover:border-white/24 hover:bg-black/26 hover:text-white",
                          "shadow-[0_10px_28px_rgba(0,0,0,0.55)]",
                          "disabled:cursor-not-allowed disabled:opacity-40",
                        ].join(" ")}
                        disabled={activePresetId === null}
                      >
                        Clear preset
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <GoldDivider />

          {/* ✅ PRICING */}
{sec.basics.visible || sec.pricing.visible ? (
  <div
    className={[
      "rounded-3xl border border-white/18 bg-black/22 p-5",
      "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
    ].join(" ")}
  >
    <CollapsibleHeader
      title="Pricing"
      open={openBasics}
      setOpen={setOpenBasics}
      analyticsKey="pricing"
      onToggle={onSectionToggle}
    />

    {openBasics ? (
      <>
        {/* Optional helper */}
        {sec.basics.helper ? (
          <div className="mb-4">
            <Banner
              tone={sec.basics.helper.tone}
              title={sec.basics.helper.title}
              text={sec.basics.helper.text}
            />
          </div>
        ) : sec.pricing.helper ? (
          <div className="mb-4">
            <Banner
              tone={sec.pricing.helper.tone}
              title={sec.pricing.helper.title}
              text={sec.pricing.helper.text}
            />
          </div>
        ) : null}

        {/* ===== Row 1: Region / Pricing tier / Mode ===== */}
        {sec.basics.visible ? (
          <div
            className={["grid gap-5", showPricingTier ? "md:grid-cols-3" : "md:grid-cols-2"].join(
              " "
            )}
          >
            <div>
              <LabelRow label="Region" tip={regionTip} containerRef={cardRef} />
              <FieldShell disabled={!ctrl.region.enabled}>
                <select
                  disabled={!ctrl.region.enabled}
                  value={region}
                  onChange={(e) => {
                    phFirstTouch("region");
                    phCapture("inputs_region_changed", { next: e.target.value }, 0);
                    clearPreset();
                    setRegion(e.target.value as Region);
                  }}
                  className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                    [color-scheme:dark]
                    [&>option]:bg-zinc-900 [&>option]:text-white disabled:cursor-not-allowed"
                >
                  <option value="UK">UK (GBP)</option>
                  <option value="EU">EU (EUR)</option>
                  <option value="US">US (USD)</option>
                </select>
              </FieldShell>
              <DisabledHint text={!ctrl.region.enabled ? ctrl.region.disabledReason : undefined} />
            </div>

            {showPricingTier ? (
              <div>
                <LabelRow label="Pricing tier" tip={pricingTierTip} containerRef={cardRef} />
                <FieldShell disabled={!ctrl.pricingTier.enabled}>
                  <select
                    disabled={!ctrl.pricingTier.enabled}
                    value={pricingId}
                    onChange={(e) => {
                      phFirstTouch("pricing_tier");
                      phCapture("inputs_pricing_tier_changed", { next: e.target.value }, 0);
                      clearPreset();
                      setPricingId(e.target.value);
                    }}
                    className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                      [color-scheme:dark]
                      [&>option]:bg-zinc-900 [&>option]:text-white disabled:cursor-not-allowed"
                  >
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.percent}% + {o.currencySymbol}
                        {o.fixed.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </FieldShell>
                <DisabledHint
                  text={!ctrl.pricingTier.enabled ? ctrl.pricingTier.disabledReason : undefined}
                />
              </div>
            ) : null}

            <div>
              <LabelRow label="Mode" tip={modeTip} containerRef={cardRef} />
              <SegmentedMode
                useReverse={useReverse}
                setUseReverse={(v) => {
                  phFirstTouch("mode");
                  phCapture("inputs_mode_changed", { next: v ? "reverse" : "forward" }, 0);
                  setUseReverse(v);
                }}
                onUserEdit={() => {
                  phFirstTouch("mode");
                  clearPreset();
                }}
                disabled={!ctrl.mode.enabled}
              />
              <DisabledHint text={!ctrl.mode.enabled ? ctrl.mode.disabledReason : undefined} />
            </div>
          </div>
        ) : null}

        {/* Divider */}
        {sec.basics.visible && sec.pricing.visible ? <MiniDivider /> : null}

        {/* ===== Row 2: Price / FX / Rounding ===== */}
        {sec.pricing.visible ? (
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              {/* ✅ FIXED: same LabelRow style + badge rendered via `right` (no children) */}
              <LabelRow
                label={priceFieldLabel}
                tip={priceFieldTip}
                containerRef={cardRef}
                right={
                  ctrl.amountOrTarget.badge ? (
                    <BadgePill text={ctrl.amountOrTarget.badge} tone="muted" />
                  ) : null
                }
              />

              <MoneyField
                value={isReverseMode ? targetNet : amount}
                onChange={(n) => {
                  phFirstTouch("price_or_target");
                  phCapture(
                    "inputs_amount_or_target_changed",
                    { value: n, field: isReverseMode ? "targetNet" : "amount" },
                    400
                  );
                  clearPreset();
                  if (isReverseMode) setTargetNet(n);
                  else setAmount(n);
                }}
                ariaLabel={priceFieldLabel}
                disabled={!ctrl.amountOrTarget.enabled}
              />
              <DisabledHint
                text={!ctrl.amountOrTarget.enabled ? ctrl.amountOrTarget.disabledReason : undefined}
              />
            </div>

            <div>
              {/* ✅ FIXED: same LabelRow style + badge via `right` */}
              <LabelRow
                label="FX fee %"
                tip={fxTip}
                containerRef={cardRef}
                right={
                  ctrl.fxPercent.badge ? (
                    <BadgePill text={ctrl.fxPercent.badge} tone="muted" />
                  ) : null
                }
              />

              <UnitField
                value={Number.isFinite(fxPercent) ? Math.max(0, fxPercent) : 0}
                onChange={(n) => {
                  phFirstTouch("fx");
                  phCapture("inputs_fx_changed", { value: n }, 400);
                  clearPreset();
                  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
                  setFxPercent(safe);
                }}
                ariaLabel="FX conversion percentage"
                disabled={!ctrl.fxPercent.enabled}
              />
              <DisabledHint
                text={!ctrl.fxPercent.enabled ? ctrl.fxPercent.disabledReason : undefined}
              />
            </div>

            <div>
              {/* ✅ FIXED: same LabelRow style + badge via `right` */}
              <LabelRow
                label="Rounding"
                tip={roundingTip}
                containerRef={cardRef}
                right={
                  ctrl.rounding.badge ? (
                    <BadgePill text={ctrl.rounding.badge} tone="muted" />
                  ) : null
                }
              />

              <FieldShell disabled={!ctrl.rounding.enabled}>
                <select
                  disabled={!ctrl.rounding.enabled}
                  value={`${roundingKey}|${psychPriceOn ? "1" : "0"}`}
                  onChange={(e) => {
                    phFirstTouch("rounding");
                    const [stepRaw, psychRaw] = e.target.value.split("|");
                    phCapture(
                      "inputs_rounding_changed",
                      { step: stepRaw, psych: psychRaw === "1" },
                      0
                    );
                    clearPreset();
                    setRoundingStep(toRoundingStep(stepRaw, roundingStep));
                    setPsychPriceOn(psychRaw === "1");
                  }}
                  className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                    [color-scheme:dark]
                    [&>option]:bg-zinc-900 [&>option]:text-white disabled:cursor-not-allowed"
                >
                  <option value="0.01|0">To 0.01</option>
                  <option value="0.01|1">To 0.01 + Psych (.99)</option>

                  <option value="0.05|0">To 0.05</option>
                  <option value="0.05|1">To 0.05 + Psych (.95)</option>

                  <option value="0.1|0">To 0.10</option>
                  <option value="0.1|1">To 0.10 + Psych (.90)</option>
                </select>
              </FieldShell>
              <DisabledHint
                text={!ctrl.rounding.enabled ? ctrl.rounding.disabledReason : undefined}
              />
            </div>
          </div>
        ) : null}
      </>
    ) : null}
  </div>
) : null}


          {/* ✅ PROVIDER FEE OVERRIDE */}
          <div
            className={[
              "mt-6 rounded-3xl border border-white/18 bg-black/18 p-5",
              "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
            ].join(" ")}
          >
            <CollapsibleHeader
              title="Provider Fee Override"
              open={openFeeOverride}
              setOpen={setOpenFeeOverride}
              analyticsKey="fee_override"
              onToggle={onSectionToggle}
            />
            {openFeeOverride ? (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  {/* Provider % */}
                  <div>
                    <LabelRow
                      label="Fee %"
                      tip={feeOverrideTip}
                      containerRef={cardRef}
                      right={
                        customProviderFeePercent === null ? (
                          <BadgePill text="Default" tone="muted" />
                        ) : (
                          <BadgePill text="Override" tone="warning" />
                        )
                      }
                    />
                    <NullableUnitField
                      value={customProviderFeePercent}
                      onChange={(n) => {
                        phFirstTouch("fee_override");
                        phCapture("inputs_fee_override_percent_changed", { value: n }, 0);
                        clearPreset();
                        setCustomProviderFeePercent(clampPctOrNull(n));
                      }}
                      ariaLabel="Custom provider fee percent"
                      placeholder="(default)"
                    />
                  </div>

                  {/* Fixed fee */}
                  <div>
                    <LabelRow
                      label="Fixed fee"
                      tip={
                        <>
                          Optional fixed fee override (e.g. 0.20).
                          {"\n\n"}
                          Leave blank to use the provider’s default fixed fee.
                        </>
                      }
                      containerRef={cardRef}
                      right={
                        customFixedFee === null ? (
                          <BadgePill text="Default" tone="muted" />
                        ) : (
                          <BadgePill text="Override" tone="warning" />
                        )
                      }
                    />
                    <NullableMoneyField
                      value={customFixedFee}
                      onChange={(n) => {
                        phFirstTouch("fee_override");
                        phCapture("inputs_fee_override_fixed_changed", { value: n }, 0);
                        clearPreset();
                        setCustomFixedFee(clampMoneyOrNull(n));
                      }}
                      ariaLabel="Custom provider fixed fee"
                      placeholder="(default)"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Banner
                      tone="info"
                      text="Hint - Leave blank to use defaults. Override values for what-if scenarios."
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>

         {/* ✅ PLATFORM */}
{sec.platform.visible ? (
  <div
    className={[
      "rounded-3xl border border-white/18 bg-black/18 p-5",
      "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
    ].join(" ")}
  >
    <CollapsibleHeader
      title="Platform"
      open={openPlatform}
      setOpen={setOpenPlatform}
      analyticsKey="platform"
      onToggle={onSectionToggle}
    />

    {openPlatform ? (
      <>
        {sec.platform.helper ? (
          <div className="mb-4">
            <Banner
              tone={sec.platform.helper.tone}
              title={sec.platform.helper.title}
              text={sec.platform.helper.text}
            />
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 items-start">
          <div>
            {/* ✅ FIXED: LabelRow spans full width, "i" goes far right, badge via right */}
            <LabelRow
              label="Platform fee"
              tip={platformFeeTip}
              containerRef={cardRef}
              right={
                ctrl.platformFeePercent.badge ? (
                  <BadgePill text={ctrl.platformFeePercent.badge} tone="success" />
                ) : null
              }
            />

            <UnitField
              value={platformFeePercent}
              onChange={(n) => {
                phFirstTouch("platform");
                phCapture("inputs_platform_fee_changed", { value: n }, 400);
                clearPreset();
                setPlatformFeePercent(n);
              }}
              ariaLabel="Platform fee percentage"
              disabled={!ctrl.platformFeePercent.enabled}
            />
            <DisabledHint
              text={
                !ctrl.platformFeePercent.enabled
                  ? ctrl.platformFeePercent.disabledReason
                  : undefined
              }
            />
          </div>

          <div>
            {/* ✅ FIXED: LabelRow spans full width, "i" goes far right, badge via right */}
            <LabelRow
              label="Applied on"
              tip={platformAppliedOnTip}
              containerRef={cardRef}
              right={
                ctrl.platformFeeBase.badge ? (
                  <BadgePill text={ctrl.platformFeeBase.badge} tone="info" />
                ) : null
              }
            />

            <FieldShell disabled={!ctrl.platformFeeBase.enabled}>
              <select
                disabled={!ctrl.platformFeeBase.enabled}
                value={platformFeeBase}
                onChange={(e) => {
                  phFirstTouch("platform");
                  phCapture("inputs_platform_base_changed", { value: e.target.value }, 0);
                  clearPreset();
                  setPlatformFeeBase(e.target.value as PlatformFeeBase);
                }}
                className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                  [color-scheme:dark]
                  [&>option]:bg-zinc-900 [&>option]:text-white disabled:cursor-not-allowed"
              >
                <option value="gross">From gross</option>
                <option value="afterStripe">After provider fee</option>
              </select>
            </FieldShell>

            <DisabledHint
              text={
                !ctrl.platformFeeBase.enabled ? ctrl.platformFeeBase.disabledReason : undefined
              }
            />
          </div>

          <div />
        </div>
      </>
    ) : null}
  </div>
) : null}


          {/* ✅ TAX (VAT) */}
{sec.tax.visible ? (
  <div
    className={[
      "rounded-3xl border border-white/18 bg-black/18 p-5",
      "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
    ].join(" ")}
  >
    <CollapsibleHeader
      title="Tax"
      open={openTax}
      setOpen={setOpenTax}
      analyticsKey="tax"
      onToggle={onSectionToggle}
    />

    {openTax ? (
      <>
        {sec.tax.helper ? (
          <div className="mb-4">
            <Banner
              tone={sec.tax.helper.tone}
              title={sec.tax.helper.title}
              text={sec.tax.helper.text}
            />
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-3">
          <div>
            {/* ✅ FIXED: LabelRow spans full width, "i" goes far right, badge via right */}
            <LabelRow
              label="VAT %"
              tip={vatTip}
              containerRef={cardRef}
              right={
                ctrl.vatPercent.badge ? (
                  <BadgePill text={ctrl.vatPercent.badge} tone="info" />
                ) : null
              }
            />

            <UnitField
              value={Number.isFinite(vatPercent) ? vatPercent : 0}
              onChange={(n) => {
                phFirstTouch("vat");
                phCapture("inputs_vat_changed", { value: n }, 400);
                clearPreset();
                const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
                setVatPercent(safe);
              }}
              ariaLabel="VAT percentage"
              disabled={!ctrl.vatPercent.enabled}
            />
            <DisabledHint
              text={!ctrl.vatPercent.enabled ? ctrl.vatPercent.disabledReason : undefined}
            />
          </div>

          <div className="md:col-span-2">
            <Banner
              tone="info"
              text="Hint - Keep VAT separate so you can compare net before VAT and net after VAT."
            />
          </div>
        </div>
      </>
    ) : null}
  </div>
) : null}


          {/* ✅ ADVANCED TOOLS */}
          {sec.tools.visible ? (
            <>
              <GoldDivider />

              <div
                className={[
                  "rounded-3xl border border-white/18 bg-black/18 p-5",
                  "shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
                ].join(" ")}
              >
                <CollapsibleHeader
                  title="Advanced tools"
                  open={openTools}
                  setOpen={setOpenTools}
                  analyticsKey="advanced_tools"
                  onToggle={onSectionToggle}
                />

                {openTools ? (
                  <>
                    <div className="mt-4 space-y-4">
                      {/* ===================== Break-even ===================== */}
                      <ToolSection
                        title="Break-even"
                        subtitle="Solve for the customer price needed to hit a target net."
                        accent="amber"
                        right={
                          <div className="flex items-center gap-2">
                            {ctrl.breakEven.badge ? <BadgePill text={ctrl.breakEven.badge} tone="muted" /> : null}
                            <TogglePill
                              checked={breakEvenOn}
                              onChange={(v) => {
                                phFirstTouch("break_even");
                                phCapture("inputs_tool_toggled", { tool: "break_even", enabled: v }, 0);
                                clearPreset();
                                setBreakEvenOn(v);
                              }}
                              ariaLabel="Toggle break-even tool"
                              disabled={!ctrl.breakEven.enabled}
                            />
                            <span className="text-[11px] text-white/50">{breakEvenOn ? "On" : "Off"}</span>
                          </div>
                        }
                      >
                        <div className="flex justify-center">
                          <div className="w-full max-w-[520px]">
                            <div className="flex items-center justify-between gap-3">
                              <LabelRow label="Break-even" tip={breakEvenTip} containerRef={cardRef} />
                            </div>

                            <MoneyField
                              value={breakEvenTargetNet}
                              disabled={!breakEvenOn || !ctrl.breakEven.enabled}
                              onChange={(n) => {
                                phFirstTouch("break_even");
                                phCapture("inputs_break_even_target_changed", { value: n }, 400);
                                clearPreset();
                                setBreakEvenTargetNet(n);
                              }}
                              ariaLabel="Break-even target net"
                            />
                            <DisabledHint text={!ctrl.breakEven.enabled ? ctrl.breakEven.disabledReason : undefined} />
                          </div>
                        </div>
                      </ToolSection>

                      {/* ===================== Fee impact ===================== */}
                      <ToolSection
                        title="Fee impact"
                        subtitle="See how your net changes when fees drift up/down."
                        accent="rose"
                        right={
                          <div className="flex items-center gap-2">
                            {ctrl.sensitivity.badge ? <BadgePill text={ctrl.sensitivity.badge} tone="muted" /> : null}
                            <TogglePill
                              checked={sensitivityOn}
                              onChange={(v) => {
                                phFirstTouch("fee_impact");
                                phCapture("inputs_tool_toggled", { tool: "fee_impact", enabled: v }, 0);
                                clearPreset();
                                setSensitivityOn(v);
                              }}
                              ariaLabel="Toggle fee impact tool"
                              disabled={!ctrl.sensitivity.enabled}
                            />
                            <span className="text-[11px] text-white/50">{sensitivityOn ? "On" : "Off"}</span>
                          </div>
                        }
                      >
                        <div className="flex justify-center">
                          <div className="w-full max-w-[820px]">
                            <div className="grid gap-5 md:grid-cols-2">
                              <div>
                                <div className="flex items-center justify-between gap-3">
                                  <LabelRow label="Fee impact ±" tip={feeImpactTip} containerRef={cardRef} />
                                </div>

                                <UnitField
                                  value={sensitivityDeltaPct}
                                  disabled={!sensitivityOn || !ctrl.sensitivity.enabled}
                                  onChange={(n) => {
                                    phFirstTouch("fee_impact");
                                    phCapture("inputs_fee_impact_delta_changed", { value: n }, 400);
                                    clearPreset();
                                    setSensitivityDeltaPct(n);
                                  }}
                                  ariaLabel="Sensitivity delta percent"
                                />
                                <DisabledHint text={!ctrl.sensitivity.enabled ? ctrl.sensitivity.disabledReason : undefined} />
                              </div>

                              <div>
                                <div className="flex items-center justify-between gap-3">
                                  <LabelRow label="Affected fee" tip={affectedFeeTip} containerRef={cardRef} />
                                </div>

                                <FieldShell disabled={!sensitivityOn || !ctrl.sensitivity.enabled}>
                                  <select
                                    disabled={!sensitivityOn || !ctrl.sensitivity.enabled}
                                    value={sensitivityTarget}
                                    onChange={(e) => {
                                      phFirstTouch("fee_impact");
                                                                            phCapture("inputs_fee_impact_target_changed", { value: e.target.value }, 0);
                                      clearPreset();
                                      setSensitivityTarget(e.target.value as SensitivityTarget);
                                    }}
                                    className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none
                                     [color-scheme:dark]
                                     [&>option]:bg-zinc-900 [&>option]:text-white disabled:cursor-not-allowed"
                                  >
                                    <option value="stripe">{providerName} fee</option>
                                    <option value="fx">FX fee</option>
                                    <option value="platform">Platform fee</option>
                                    <option value="all">All fees</option>
                                  </select>
                                </FieldShell>
                                <DisabledHint text={!ctrl.sensitivity.enabled ? ctrl.sensitivity.disabledReason : undefined} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </ToolSection>

                      {/* ===================== Volume projections ===================== */}
                      <ToolSection
                        title="Volume projections"
                        subtitle="Estimate monthly totals across mixed baskets and currencies."
                        accent="emerald"
                        right={
                          <div className="flex items-center gap-2">
                            {ctrl.volume?.badge ? <BadgePill text={ctrl.volume.badge} tone="muted" /> : null}
                            <TogglePill
                              checked={volumeOn}
                              onChange={(v) => {
                                phFirstTouch("volume");
                                phCapture("inputs_tool_toggled", { tool: "volume", enabled: v }, 0);
                                clearPreset();
                                setVolumeOn(v);
                              }}
                              ariaLabel="Toggle volume projections tool"
                              disabled={ctrl.volume ? !ctrl.volume.enabled : false}
                            />
                            <span className="text-[11px] text-white/50">{volumeOn ? "On" : "Off"}</span>
                          </div>
                        }
                      >
                        <div className="flex justify-center">
                          <div className="w-full max-w-[980px] space-y-5">
                            {/* top inputs */}
                            <div className="grid gap-5 md:grid-cols-3">
                              <div>
                                <LabelRow
                                  label="TX / month"
                                  tip={
                                    <>
                                      How many customer payments you expect per month.
                                      {"\n\n"}
                                      Used to estimate monthly totals from your current fee assumptions.
                                    </>
                                  }
                                  containerRef={cardRef}
                                />
                                <FieldShell disabled={!volumeOn || (ctrl.volume ? !ctrl.volume.enabled : false)}>
                                  <input
                                    inputMode="numeric"
                                    value={String(volumeTxPerMonth)}
                                    disabled={!volumeOn || (ctrl.volume ? !ctrl.volume.enabled : false)}
                                    onChange={(e) => {
                                      phFirstTouch("volume");
                                      const raw = e.target.value.replace(/[^\d]/g, "");
                                      const n = raw === "" ? 0 : Number(raw);
                                      if (!Number.isFinite(n)) return;
                                      phCapture("inputs_volume_tx_changed", { value: n }, 300);
                                      clearPreset();
                                      setVolumeTxPerMonth(clampInt(n, 0));
                                    }}
                                    className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none disabled:cursor-not-allowed"
                                    aria-label="Transactions per month"
                                  />
                                </FieldShell>
                              </div>

                              <div>
                                <LabelRow
                                  label="Refund %"
                                  tip={
                                    <>
                                      Percentage of transactions that refund (or chargeback) per month.
                                      {"\n\n"}
                                      This is a simple top-line adjustment for projection totals.
                                    </>
                                  }
                                  containerRef={cardRef}
                                />
                                <UnitField
                                  value={Number.isFinite(volumeRefundRatePct) ? Math.max(0, volumeRefundRatePct) : 0}
                                  disabled={!volumeOn || (ctrl.volume ? !ctrl.volume.enabled : false)}
                                  onChange={(n) => {
                                    phFirstTouch("volume");
                                    phCapture("inputs_volume_refund_rate_changed", { value: n }, 300);
                                    clearPreset();
                                    setVolumeRefundRatePct(Math.max(0, n));
                                  }}
                                  ariaLabel="Refund rate percent"
                                />
                              </div>

<div className="flex items-start justify-end">
  <div className="w-full md:w-[260px]">
    <LabelRow
      label=""
      containerRef={cardRef}
      right={
        <div className="flex items-center gap-2">
          <BadgePill text={volumeAllocatedBadge.text} tone={volumeAllocatedBadge.tone} />

          <InfoTip
            text={
              <>
                Each tier represents a basket at a price point + currency FX assumption.
                {"\n\n"}
                Shares should add up to 100% for a full allocation.
              </>
            }
            containerRef={cardRef}
          />
        </div>
      }
    />
  </div>
</div></div>



                            <MiniDivider />

                            {/* tiers editor */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-white/55">
                                  Basket tiers
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!volumeOn) return;
                                    phFirstTouch("volume");
                                    phCapture("inputs_volume_tier_added", {}, 0);
                                    clearPreset();
                                    addTier();
                                  }}
                                  className={[
                                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                                    "border-white/14 bg-black/18 text-white/70 hover:border-white/24 hover:bg-black/26 hover:text-white",
                                    "shadow-[0_10px_28px_rgba(0,0,0,0.55)]",
                                    !volumeOn ? "cursor-not-allowed opacity-40" : "",
                                  ].join(" ")}
                                  disabled={!volumeOn}
                                >
                                  <FiPlus />
                                  Add tier
                                </button>
                              </div>

                              <div className="grid gap-3">
                                {(volumeTiers ?? []).map((t, idx) => {
                                  const priceDraft = tierPriceTextById[t.id] ?? String(Number.isFinite(t.price) ? t.price : 0);

                                  return (
                                    <div
                                      key={t.id}
                                      className={[
                                        "relative overflow-hidden rounded-2xl border border-white/12 bg-black/16 p-4",
                                        "shadow-[0_14px_50px_rgba(0,0,0,0.45)]",
                                      ].join(" ")}
                                    >
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                          <BadgePill text={`Tier ${idx + 1}`} tone="muted" />
                                          {t.sharePct > 0 ? (
                                            <BadgePill text={`${Math.round(t.sharePct * 10) / 10}% share`} tone="info" />
                                          ) : (
                                            <BadgePill text="0% share" tone="muted" />
                                          )}
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!volumeOn) return;
                                            if ((volumeTiers ?? []).length <= 1) return;
                                            phFirstTouch("volume");
                                            phCapture("inputs_volume_tier_removed", { id: t.id }, 0);
                                            clearPreset();
                                            removeTier(t.id);
                                          }}
                                          className={[
                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition",
                                            "border-white/14 bg-black/18 text-white/65 hover:border-white/24 hover:bg-black/26 hover:text-white",
                                            "shadow-[0_10px_28px_rgba(0,0,0,0.55)]",
                                            !volumeOn || (volumeTiers ?? []).length <= 1 ? "cursor-not-allowed opacity-40" : "",
                                          ].join(" ")}
                                          disabled={!volumeOn || (volumeTiers ?? []).length <= 1}
                                        >
                                          <FiTrash2 />
                                          Remove
                                        </button>
                                      </div>

                                      <div className="grid gap-4 md:grid-cols-3">
                                        {/* Tier price */}
                                        <div>
                                          <LabelRow
                                            label={`Price (${currencySymbol})`}
                                            tip={
                                              <>
                                                Customer price for this basket tier.
                                                {"\n\n"}
                                                Supports decimals. This is a “basket” price used for projections.
                                              </>
                                            }
                                            containerRef={cardRef}
                                          />

                                          <FieldShell disabled={!volumeOn}>
                                            <input
                                              inputMode="decimal"
                                              value={priceDraft}
                                              disabled={!volumeOn}
                                              onFocus={() => setEditingTierPriceId(t.id)}
                                              onChange={(e) => {
                                                phFirstTouch("volume");
                                                const raw = e.target.value;
                                                if (!isValidDecimalInput(raw)) return;

                                                setTierPriceTextById((prev) => ({ ...prev, [t.id]: raw }));

                                                const n = parseLiveDecimal(raw);
                                                if (n === null) return;

                                                phCapture("inputs_volume_tier_price_changed", { id: t.id, value: n }, 350);
                                                clearPreset();
                                                updateTier(t.id, { price: Math.max(0, n) });
                                              }}
                                              onBlur={() => {
                                                setEditingTierPriceId(null);

                                                const raw = (tierPriceTextById[t.id] ?? "").trim();
                                                if (raw === "") {
                                                  setTierPriceTextById((prev) => ({
                                                    ...prev,
                                                    [t.id]: String(Number.isFinite(t.price) ? t.price : 0),
                                                  }));
                                                  return;
                                                }

                                                const n = parseLiveDecimal(raw);
                                                if (n === null) {
                                                  setTierPriceTextById((prev) => ({
                                                    ...prev,
                                                    [t.id]: String(Number.isFinite(t.price) ? t.price : 0),
                                                  }));
                                                  return;
                                                }

                                                const fixed = Number(Math.max(0, n).toFixed(2));
                                                setTierPriceTextById((prev) => ({ ...prev, [t.id]: String(fixed) }));
                                                updateTier(t.id, { price: fixed });
                                              }}
                                              className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none placeholder:text-white/35 disabled:cursor-not-allowed"
                                              aria-label="Tier price"
                                            />
                                          </FieldShell>
                                        </div>

                                        {/* Share */}
                                        <div>
                                          <LabelRow
                                            label="Share %"
                                            tip={
                                              <>
                                                What percentage of monthly transactions fall into this tier.
                                                {"\n\n"}
                                                All tiers should add up to 100% for a full allocation.
                                              </>
                                            }
                                            containerRef={cardRef}
                                          />

                                          <FieldShell disabled={!volumeOn}>
                                            <input
                                              inputMode="decimal"
                                              value={String(Number.isFinite(t.sharePct) ? t.sharePct : 0)}
                                              disabled={!volumeOn}
                                              onChange={(e) => {
                                                phFirstTouch("volume");
                                                const raw = e.target.value;
                                                if (!/^\d*\.?\d*$/.test(raw)) return;
                                                const n = raw === "" ? 0 : Number(raw);
                                                if (!Number.isFinite(n)) return;

                                                phCapture("inputs_volume_tier_share_changed", { id: t.id, value: n }, 350);
                                                clearPreset();
                                                updateTier(t.id, { sharePct: Math.max(0, n) });
                                              }}
                                              onBlur={(e) => {
                                                const n = Number(e.currentTarget.value);
                                                if (!Number.isFinite(n)) {
                                                  updateTier(t.id, { sharePct: 0 });
                                                  return;
                                                }
                                                updateTier(t.id, { sharePct: Math.max(0, Number(n.toFixed(2))) });
                                              }}
                                              className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none disabled:cursor-not-allowed"
                                              aria-label="Tier share percentage"
                                            />
                                            <span className="relative z-10 mr-3.5 text-[12px] text-amber-100/55">%</span>
                                          </FieldShell>
                                        </div>

                                        {/* FX */}
                                        <div>
                                          <LabelRow label="Tier FX %" tip={tierFxTip} containerRef={cardRef} />

                                          <FieldShell disabled={!volumeOn}>
                                            <input
                                              inputMode="decimal"
                                              value={String(Number.isFinite(t.fxPercent) ? t.fxPercent : 0)}
                                              disabled={!volumeOn}
                                              onChange={(e) => {
                                                phFirstTouch("volume");
                                                const raw = e.target.value;
                                                if (!/^\d*\.?\d*$/.test(raw)) return;
                                                const n = raw === "" ? 0 : Number(raw);
                                                if (!Number.isFinite(n)) return;

                                                phCapture("inputs_volume_tier_fx_changed", { id: t.id, value: n }, 350);
                                                clearPreset();
                                                updateTier(t.id, { fxPercent: Math.max(0, n) });
                                              }}
                                              onBlur={(e) => {
                                                const n = Number(e.currentTarget.value);
                                                if (!Number.isFinite(n)) {
                                                  updateTier(t.id, { fxPercent: 0 });
                                                  return;
                                                }
                                                updateTier(t.id, { fxPercent: Math.max(0, Number(n.toFixed(2))) });
                                              }}
                                              className="relative z-10 w-full bg-transparent px-3.5 text-[13px] text-white outline-none disabled:cursor-not-allowed"
                                              aria-label="Tier FX percentage"
                                            />
                                            <span className="relative z-10 mr-3.5 text-[12px] text-amber-100/55">%</span>
                                          </FieldShell>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="md:col-span-2">
                                <Banner
                                  tone="info"
                                  text="Hint - Use tiers to model mixed pricing. Shares should total 100%. Affects monthly totals only."
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </ToolSection>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}



