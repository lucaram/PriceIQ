// src/app/page.tsx
import { Suspense } from "react";
import { Calculator } from "@/components/calculator/Calculator";

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
        <header className="mb-6 md:mb-10 text-center">
          {/* Line 1 */}
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl whitespace-nowrap">
            PriceIQ.
          </h1>

          {/* Line 2 */}
          <p className="mt-1 text-white/70 text-lg md:text-2xl whitespace-nowrap">
            See the real cost of getting paid.
          </p>
        </header>

        <Suspense fallback={<CalculatorFallback />}>
          <Calculator />
        </Suspense>
      </div>
    </main>
  );
}
