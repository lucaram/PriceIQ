// src/app/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { Calculator } from "@/components/calculator/Calculator";
import { ContactCta } from "@/components/contact/ContactCta";
import { AboutCta } from "@/components/about/AboutCta";

function CalculatorFallback() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
      Loading calculator…
    </div>
  );
}

export default function Page() {
  return (
    // ✅ isolation helps ensure the modal/backdrop layers behave consistently
    <main className="bg-premium min-h-screen text-white isolate">
      <div className="relative mx-auto max-w-6xl px-5 py-10 md:py-14">
        {/* Top-left: About */}
        <div className="absolute left-5 top-6 md:left-6 md:top-8">
          <AboutCta />
        </div>

        {/* Top-right: Contact */}
        <div className="absolute right-5 top-6 md:right-6 md:top-8">
          <ContactCta />
        </div>

        <header className="relative mb-4 flex flex-col items-center justify-center bg-transparent py-2 text-center md:mb-8">
          <div className="relative flex flex-col items-center">
            {/* Title Container */}
            <div className="relative inline-flex items-baseline">
              <h1 className="text-5xl font-black tracking-tighter text-white md:text-7xl">
                PriceIQ
              </h1>

              <span className="absolute right-0 bottom-[0.18em] h-3 w-3 translate-x-full rounded-[1px] bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)] md:h-4 md:w-4 md:-right-1" />
            </div>

            {/* Subtitle Section */}
            <div className="mt-2 flex flex-col items-center">
              <div className="mb-3 h-px w-20 bg-white/10" />

              <p className="whitespace-nowrap text-xl font-medium tracking-tight md:text-3xl">
                <span className="text-white">See the real cost</span>{" "}
                <span className="text-white/40">of getting paid.</span>
              </p>
            </div>
          </div>
        </header>

        <Suspense fallback={<CalculatorFallback />}>
          <Calculator />
        </Suspense>
      </div>

      <footer className="mt-12 border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 px-5 text-center text-xs text-white/50 md:flex-row md:gap-4">
          {/* Left: Terms */}
          <Link
            href="/terms"
            className="
              text-white/55 underline decoration-white/20
              hover:text-white hover:decoration-white/50
              transition
            "
          >
            Terms of Service
          </Link>

          {/* Center: Copyright */}
          <span className="text-white/50">
            © {new Date().getFullYear()} PriceIQ. All rights reserved.
          </span>

          {/* Right: Privacy */}
          <Link
            href="/privacy"
            className="
              text-white/55 underline decoration-white/20
              hover:text-white hover:decoration-white/50
              transition
            "
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </main>
  );
}
