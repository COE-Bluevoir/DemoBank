import Link from "next/link";
import { LockKeyhole, Shield, Sparkles } from "lucide-react";

import { BankFooter } from "@/components/bank-footer";
import { BankHeader } from "@/components/bank-header";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui";
import { BRAND } from "@/lib/onboarding/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <BankHeader />
      <main>
        <section className="relative overflow-hidden bg-[var(--color-navy)] text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,140,149,0.34),transparent_30%),radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.08),transparent_22%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-18 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-24">
            <div className="space-y-8">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white/80">
                Everyday banking, built around clarity and confidence
              </div>
              <div className="space-y-5">
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-[#8BDCE1]">
                  {BRAND.tagline}
                </p>
                <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
                  Open your account online with secure guidance every step of the way.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/78">
                  Discover a calm, modern account-opening experience designed
                  for salary credits, digital payments and everyday money
                  management, with clear progress from application to approval.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/onboarding/start">
                  <Button>Open an account</Button>
                </Link>
                <Link href="/accounts/everyday-plus">
                  <Button
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  >
                    Explore Everyday Plus
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-[32px] border border-white/12 bg-white/8 p-6 backdrop-blur-sm">
              <div className="grid gap-4">
                <div className="rounded-[24px] bg-white p-5 text-[var(--color-ink)]">
                  <p className="text-sm font-semibold">Why customers choose it</p>
                  <p className="mt-2 text-2xl font-semibold">
                    Built for everyday banking with dependable digital onboarding
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
                    Review your account details, provide your information,
                    upload your documents and keep track of progress in one
                    straightforward journey.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      icon: Shield,
                      title: "Built for confidence",
                      text: "Clear progress, accessible forms and dependable communication throughout the journey.",
                    },
                    {
                      icon: Sparkles,
                      title: "Helpful guidance",
                      text: "A guided digital assistant helps you understand what to do next at each stage.",
                    },
                    {
                      icon: LockKeyhole,
                      title: "Protected by design",
                      text: "Sensitive steps are handled through secure bank services behind the scenes.",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[24px] border border-white/10 bg-white/6 p-5"
                    >
                      <item.icon className="h-5 w-5 text-[#8BDCE1]" />
                      <p className="mt-4 text-sm font-semibold text-white">
                        {item.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white/72">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-6 py-16 lg:px-8">
          <ProductCard />
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-3 lg:px-8">
          {[
            {
              title: "Simple account opening",
              description:
                "A guided path that keeps information capture clear, structured and easy to follow.",
            },
            {
              title: "Security and trust",
              description:
                "Status updates, document handling and verification steps are designed to feel reassuring and transparent.",
            },
            {
              title: "Everyday-ready features",
              description:
                "Designed for salary deposits, routine payments and digital banking from the very first interaction.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[28px] border border-[var(--color-border)] bg-white p-6 shadow-[0_12px_32px_rgba(16,42,67,0.05)]"
            >
              <h2 className="text-xl font-semibold text-[var(--color-ink)]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-subtle)]">
                {item.description}
              </p>
            </div>
          ))}
        </section>
      </main>
      <BankFooter />
    </div>
  );
}
