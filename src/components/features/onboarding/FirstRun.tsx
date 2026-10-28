import { useState, type ReactNode } from 'react';
import { DebateOwlIntro } from '@/components/features/onboarding/DebateOwlIntro';
import { firstRunStep } from '@/lib/debateowl-intro';

/**
 * The owl welcome and the product tour are one first-run moment.
 * The welcome opens first. Got it, Esc and the backdrop close it and continue
 * straight into the tour's Start debate step. Skip animation stays inside the
 * welcome. A finished tour stays finished, including a ?intro=show replay;
 * the tour owner still mounts so this account can claim a legacy completion.
 */
export function FirstRun({
  showIntro,
  tourCompleted,
  onIntroSeen,
  tour,
}: {
  showIntro: boolean;
  tourCompleted: boolean;
  onIntroSeen: () => void;
  tour: (continueFromIntro: boolean) => ReactNode;
}) {
  const [introDismissed, setIntroDismissed] = useState(false);
  const step = firstRunStep({ showIntro, introDismissed, tourCompleted });
  if (step === 'intro') {
    return (
      <DebateOwlIntro
        onClose={() => {
          onIntroSeen();
          setIntroDismissed(true);
        }}
      />
    );
  }
  // `idle` still mounts the tour owner. It draws nothing once the tour is finished.
  return <>{tour(step === 'start-debate')}</>;
}
