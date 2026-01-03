"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen bg-premium text-white isolate">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.12),transparent_65%)]" />

      {/* Close button */}
      <button
        onClick={() => router.back()}
        aria-label="Close Privacy Policy"
        className="
          fixed right-5 top-5 z-20
          inline-flex h-10 w-10 items-center justify-center
          rounded-full border border-white/15
          bg-white/5 backdrop-blur-md
          text-white/70 shadow-lg
          transition-all duration-200
          hover:bg-white/10 hover:text-white hover:border-white/30
          focus:outline-none focus:ring-2 focus:ring-amber-400/30
        "
      >
        <X className="h-4 w-4" />
      </button>

      {/* Content */}
      <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-20">
        {/* Header */}
        <header className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Privacy Policy
          </h1>

          <p className="mt-2 text-sm text-white/55">
            Effective date: January 2026
          </p>

          <div className="mx-auto mt-6 h-px w-24 bg-white/10" />
        </header>

        {/* Body */}
        <section className="space-y-6 text-sm leading-relaxed text-white/80">
          <p>
            <strong className="font-medium text-white/90">PriceIQ Ltd</strong>{" "}
            respects your privacy. This Privacy Policy explains what information
            we collect, how we use it, and the choices you have.
          </p>

          <p>
            <span className="font-medium text-white/90">What we collect.</span>{" "}
            We may collect limited technical information such as device and
            browser type, basic usage patterns, and anonymised analytics to help
            us understand how PriceIQ is used and to improve the service. We do{" "}
            <strong>not</strong> sell personal data.
          </p>

          <p>
            <span className="font-medium text-white/90">Contact data.</span>{" "}
            If you contact us directly, we may store your email address and
            message content for the purpose of responding and providing support.
          </p>

          <p>
            <span className="font-medium text-white/90">How we use data.</span>{" "}
            We use information to operate, maintain, and improve PriceIQ, to
            troubleshoot issues, and to keep the service secure.
          </p>

          <p>
            <span className="font-medium text-white/90">Security.</span> We use
            reasonable measures to protect information, but no method of
            transmission or storage is completely secure. We cannot guarantee
            absolute security.
          </p>

          <p>
            <span className="font-medium text-white/90">Your rights.</span> You
            may have rights under applicable data protection laws (including UK
            GDPR), such as requesting access, correction, or deletion of your
            personal data. If you’d like to exercise these rights, contact us
            using the details on the website.
          </p>

          <p>
            <span className="font-medium text-white/90">Updates.</span> We may
            update this policy from time to time. When we do, we will revise the
            effective date above.
          </p>
        </section>

        {/* Footer hint */}
        <footer className="mt-12 text-center text-[11px] text-white/45">
          © {new Date().getFullYear()} PriceIQ Ltd. All rights reserved.
        </footer>
      </div>
    </main>
  );
}
