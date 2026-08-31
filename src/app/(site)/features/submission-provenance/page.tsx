import type { Metadata } from "next";
import { getFeature } from "@/app/(site)/features/_content";
import {
  FeatureDetail,
  featureMetadata,
} from "@/app/(site)/features/_components/feature-detail";
import { OriginTable } from "@/components/mockup/origin-table";

const feature = getFeature("submission-provenance");

export const metadata: Metadata = featureMetadata(feature);

export default function OriginPage() {
  return <FeatureDetail feature={feature} mockup={<OriginTable />} />;
}
