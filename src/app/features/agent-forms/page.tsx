import type { Metadata } from "next";
import { getFeature } from "@/app/features/_content";
import {
  FeatureDetail,
  featureMetadata,
} from "@/app/features/_components/feature-detail";
import { ManifestPair } from "@/components/mockup/manifest-pair";

const feature = getFeature("agent-forms");

export const metadata: Metadata = featureMetadata(feature);

export default function ManifestPage() {
  return <FeatureDetail feature={feature} mockup={<ManifestPair />} />;
}
