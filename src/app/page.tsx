import type { Metadata } from "next";
import { Hero } from "@/components/sections/hero";
import { OpenSource } from "@/components/sections/open-source";
import { Pillars } from "@/components/sections/pillars";
import { Proof } from "@/components/sections/proof";
import { Provenance } from "@/components/sections/provenance";
import { PullQuote } from "@/components/sections/pull-quote";
import { WaitlistCta } from "@/components/sections/waitlist-cta";

// Title, description and OG come from the root layout. Only the self-referential
// canonical is page-level (docs/05 §5, rule 7).
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Proof />
      <Pillars />
      <Provenance />
      <PullQuote />
      <OpenSource />
      <WaitlistCta />
    </main>
  );
}
