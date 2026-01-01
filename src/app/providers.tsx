// src/app/providers.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ✅ Prevent duplicate $pageview captures (dev/hydration edge cases)
  const lastUrlRef = useRef<string | null>(null);

  // ✅ 1) Init once (browser-only) + expose for DevTools
  useEffect(() => {
    if (typeof window === "undefined") return;

    // prevent double-init in dev fast refresh
    if ((posthog as any).__initialized) return;
    (posthog as any).__initialized = true;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    // Guard: if env missing, don't init (prevents "without a token" noise)
    if (!key) {
      console.warn("[PostHog] Missing NEXT_PUBLIC_POSTHOG_KEY");
      return;
    }

    posthog.init(key, {
      // ✅ safer default if env missing
      api_host: host || "https://app.posthog.com",

      // We'll handle SPA pageviews ourselves below to reduce noise / duplicates
      capture_pageview: false,

      // matches your snippet
      person_profiles: "identified_only",

      // ✅ optional: keep local dev cleaner (turn off replay on localhost if you want)
      // disable_session_recording: window.location.hostname === "localhost",
    });

    // ✅ makes `posthog` available in DevTools: posthog.get_distinct_id()
    (window as any).posthog = posthog;

    // ✅ small "sanity ping" so you can verify quickly
    posthog.capture("app_loaded", {
      app: "PriceIQ",
      env: process.env.NODE_ENV,
    });
  }, []);

  // 1) if you are going to production and want to ignore local development stats in posthog, replace the above use effect with this
// useEffect(() => {
//   if (typeof window === "undefined") return;

//   // ✅ Only run analytics in production
//   if (process.env.NODE_ENV !== "production") {
//     console.info("[PostHog] Disabled (non-production environment)");
//     return;
//   }

//   // Prevent double init (React StrictMode / Fast Refresh)
//   if ((posthog as any).__initialized) return;
//   (posthog as any).__initialized = true;

//   const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
//   const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

//   if (!key) {
//     console.warn("[PostHog] Missing NEXT_PUBLIC_POSTHOG_KEY");
//     return;
//   }

//   posthog.init(key, {
//     api_host: host || "https://app.posthog.com",

//     // We handle routing manually
//     capture_pageview: false,

//     // Better identity model
//     person_profiles: "identified_only",
//   });

//   // Optional sanity event
//   posthog.capture("app_loaded", {
//     app: "PriceIQ",
//     env: process.env.NODE_ENV,
//   });

//   // Optional debugging access
//   (window as any).posthog = posthog;
// }, []);







  // ✅ 2) Minimal SPA pageview tracking (less noisy than autocapture)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!(posthog as any).__initialized) return;

    const url =
      window.location.origin +
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    // ✅ Skip duplicates
    if (lastUrlRef.current === url) return;
    lastUrlRef.current = url;

    // This becomes your clean Pageview stream in PostHog
    posthog.capture("$pageview", {
      $current_url: url,
      app: "PriceIQ",
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
