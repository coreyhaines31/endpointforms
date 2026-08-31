import type { Metadata } from "next";
import { getFeature } from "@/app/(site)/features/_content";
import {
  FeatureDetail,
  featureMetadata,
} from "@/app/(site)/features/_components/feature-detail";
import { YieldBreakdown } from "@/components/mockup/yield-breakdown";

const feature = getFeature("form-analytics");

export const metadata: Metadata = featureMetadata(feature);

export default function YieldPage() {
  return <FeatureDetail feature={feature} mockup={<YieldBreakdown />} />;
}
