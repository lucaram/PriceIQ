// src/lib/providers/index.ts

import type { Provider, ProviderId } from "./types";
import { stripeProvider } from "./stripe";
import { paypalProvider } from "./paypal";
import { adyenProvider } from "./adyen";
import { checkoutComProvider } from "./checkoutcom";
import { customProvider } from "./custom";

export const DEFAULT_PROVIDER_ID: ProviderId = "stripe";

// ✅ keep it typed as "optional map", so indexing by ProviderId works
export const PROVIDERS: Partial<Record<ProviderId, Provider>> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  adyen: adyenProvider,
  checkoutcom: checkoutComProvider,
  custom: customProvider,
};

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id] ?? PROVIDERS[DEFAULT_PROVIDER_ID]!;
}

// (optional helper for UI lists)
export function listProviders(): Provider[] {
  return Object.values(PROVIDERS).filter(Boolean) as Provider[];
}
