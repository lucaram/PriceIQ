// src/app/page.tsx
import { Suspense } from "react";
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
    <main className="bg-premium min-h-screen text-white">
      <div className="relative mx-auto max-w-6xl px-5 py-10 md:py-14">

        {/* Top-left: About */}
        <div className="absolute left-5 top-6 md:left-6 md:top-8">
          <AboutCta />
        </div>

        {/* Top-right: Contact */}
        <div className="absolute right-5 top-6 md:right-6 md:top-8">
          <ContactCta />
        </div>

        <header className="mb-6 md:mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl whitespace-nowrap">
            PriceIQ.
          </h1>
          <p className="mt-1 text-lg text-white/70 md:text-2xl whitespace-nowrap">
            See the real cost of getting paid.
          </p>
        </header>

        <Suspense fallback={<CalculatorFallback />}>
          <Calculator />
        </Suspense>
      </div>

      <footer className="mt-12 border-t border-white/10 py-6 text-center text-xs text-white/50">
        © {new Date().getFullYear()} PriceIQ. All rights reserved.
      </footer>
    </main>
  );
}
