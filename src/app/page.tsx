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
        <header className="mb-10">
<h1 className="mt-5 max-w-6xl text-3xl font-extrabold tracking-tight md:text-5xl md:whitespace-nowrap">
  PriceIQ.
  <span className="block text-white/70">
    See the real cost of getting paid.
  </span>
</h1>
        </header>

        <Suspense fallback={<CalculatorFallback />}>
          <Calculator />
        </Suspense>
      </div>
    </main>
  );
}
