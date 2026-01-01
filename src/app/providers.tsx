// src/app/providers.tsx
"use client";

import React, { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

/**
 * ✅ Uses useSearchParams(), so it MUST be inside a <Suspense> boundary
 * to avoid Next.js prerender errors on /_not-found and /404 during build.
 */
function PostHogPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ✅ Prevent duplicate $pageview captures (dev/hydration edge cases)
  const lastUrlRef = useRef<string | null>(null);

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

    posthog.capture("$pageview", {
      $current_url: url,
      app: "PriceIQ",
    });
  }, [pathname, searchParams]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // ✅ 1) Init once (browser-only) + expose for DevTools
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ✅ Only run analytics in production (comment this block out if you want dev tracking too)
    if (process.env.NODE_ENV !== "production") {
      // Keep dev console clean, but leave a breadcrumb
      console.info("[PostHog] Disabled (non-production environment)");
      return;
    }

    // prevent double-init in dev fast refresh / strict mode
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

      // ✅ optional: keep session recording off if you ever enable dev tracking
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

  return (
    <>
      {/* ✅ Required wrapper for useSearchParams() */}
      <Suspense fallback={null}>
        <PostHogPageViews />
      </Suspense>

      {children}
    </>
  );
}
