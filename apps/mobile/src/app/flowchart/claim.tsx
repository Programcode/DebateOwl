import { useLocalSearchParams, useRouter } from 'expo-router';

import { ClaimPanel } from '@/components/claim-panel';
import { SheetScrollView } from '@/components/sheet';

/** A card's claim in a form sheet, as mock A. iPad docks the same panel beside the map instead. */
export default function ClaimSheet() {
  const router = useRouter();
  const { scope, map, node } = useLocalSearchParams<{ scope: string; map: string; node: string }>();
  return <ClaimPanel scope={scope} map={map} nodeId={node} container={SheetScrollView} onClose={() => router.back()} />;
}
