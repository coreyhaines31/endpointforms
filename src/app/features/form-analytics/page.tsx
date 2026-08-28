import type { Metadata } from "next";
import { getFeature } from "@/app/features/_content";
import {
  FeatureDetail,
  featureMetadata,
} from "@/app/features/_components/feature-detail";

const feature = getFeature("form-analytics");

export const metadata: Metadata = featureMetadata(feature);

export default function YieldPage() {
  return <FeatureDetail feature={feature} />;
}
