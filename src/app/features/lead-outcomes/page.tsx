import type { Metadata } from "next";
import { getFeature } from "@/app/features/_content";
import {
  FeatureDetail,
  featureMetadata,
} from "@/app/features/_components/feature-detail";

const feature = getFeature("lead-outcomes");

export const metadata: Metadata = featureMetadata(feature);

export default function VerdictPage() {
  return <FeatureDetail feature={feature} />;
}
