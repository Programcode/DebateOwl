import type { useSubscriptionError } from '@/hooks/use-subscription-error';
import { LimitReachedModal } from './LimitReachedModal';
import { ModelRestrictedModal } from './ModelRestrictedModal';
import { PricingModal } from './PricingModal';

/**
 * The daily-limit, Pro-model and pricing dialogs a tool opens from useSubscriptionError.
 * Each mounts only while open, so a tool that never hits a limit never loads plan data for them.
 */
export function SubscriptionErrorModals({ subError }: { subError: ReturnType<typeof useSubscriptionError> }) {
  return (
    <>
      {subError.limitModalOpen && <LimitReachedModal
        open={subError.limitModalOpen}
        onOpenChange={subError.setLimitModalOpen}
        variant={subError.limitModalVariant}
        limit={subError.limitModalLimit}
        current={subError.limitModalCurrent}
        onUpgrade={() => { subError.setLimitModalOpen(false); subError.setPricingModalOpen(true); }}
      />}
      {subError.modelModalOpen && <ModelRestrictedModal
        open={subError.modelModalOpen}
        onOpenChange={subError.setModelModalOpen}
        onUpgrade={() => { subError.setModelModalOpen(false); subError.setPricingModalOpen(true); }}
      />}
      {subError.pricingModalOpen && <PricingModal open onOpenChange={subError.setPricingModalOpen} />}
    </>
  );
}
