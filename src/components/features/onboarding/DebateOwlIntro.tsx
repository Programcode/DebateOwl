import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Paintbrush } from 'lucide-react';
import { Owl, OwlAvatar, type OwlPose } from '@/components/brand/Owl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STEPS = 3;

// The hello: the owl lands surprised, waves as it greets you, then points on to the next step.
// Each beat starts at its offset in ms; the last lands at 3.2 s. Reduced motion shows the last beat.
const HELLO_BEATS: { at: number; pose: OwlPose }[] = [
  { at: 0, pose: 'surprised' },
  { at: 900, pose: 'celebrating' },
  { at: 2000, pose: 'celebrating' },
  { at: 3200, pose: 'point' },
];
const LAST_BEAT = HELLO_BEATS.length - 1;

const STEP_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

/** The one-time DebateOwl welcome. Every way out (Skip, Got it, Esc, the X, the backdrop) calls onClose. */
export function DebateOwlIntro({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion() === true;
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(() => (reduceMotion ? LAST_BEAT : 0));
  const nextButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reduceMotion) {
      setBeat(LAST_BEAT);
      return;
    }
    const timers = HELLO_BEATS.slice(1).map(({ at }, index) => window.setTimeout(() => setBeat(index + 1), at));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion]);

  // The owl's personal name is still being chosen; with no name it just says hello.
  const owlName = t('debateOwlIntro.owlName').trim();
  const greeting = owlName ? t('debateOwlIntro.greetingNamed', { name: owlName }) : t('debateOwlIntro.greeting');
  const last = step === STEPS - 1;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-testid="debateowl-intro"
        className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-[30rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nextButton.current?.focus();
        }}
      >
        <div className="min-h-[24rem] px-6 pb-2 pt-7 sm:px-8 sm:pt-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={STEP_TRANSITION}
            >
              {step === 0 && (
                <div className="flex flex-col items-center text-center">
                  <motion.div
                    className="relative grid h-40 w-40 place-items-center rounded-full bg-plume-100 dark:bg-plume-900"
                    initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    <motion.div
                      initial={reduceMotion ? false : { y: 36, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.15 }}
                    >
                      <Owl pose={HELLO_BEATS[beat].pose} size={148} priority className="-mb-3" />
                    </motion.div>
                  </motion.div>
                  <div className="relative mt-5 w-full rounded-2xl border-2 border-border bg-accent px-5 py-4 text-left before:absolute before:-top-[9px] before:left-1/2 before:h-4 before:w-4 before:-translate-x-1/2 before:rotate-45 before:border-l-2 before:border-t-2 before:border-border before:bg-accent">
                    <DialogTitle className="relative text-2xl leading-8">
                      <Line shown={beat >= 1}>{greeting}</Line>
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="relative mt-1 space-y-1 text-base text-foreground">
                        <Line shown={beat >= 2}>{t('debateOwlIntro.hello')}</Line>
                        <Line shown={beat >= 3} className="text-muted-foreground">{t('debateOwlIntro.whatChanged')}</Line>
                      </div>
                    </DialogDescription>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <DialogTitle className="pr-8 text-2xl leading-8">{t('debateOwlIntro.changesTitle')}</DialogTitle>
                  <DialogDescription className="sr-only">{t('debateOwlIntro.changesTitle')}</DialogDescription>
                  <ul className="mt-5 space-y-4">
                    <Change
                      icon={(
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-plume-100 text-primary dark:bg-plume-900">
                          <Paintbrush className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                      )}
                      title={t('debateOwlIntro.freshLookTitle')}
                      description={t('debateOwlIntro.freshLookDesc')}
                    />
                    <Change
                      icon={<OwlAvatar pose="coach" size={44} />}
                      title={t('debateOwlIntro.owlGuideTitle')}
                      description={t('debateOwlIntro.owlGuideDesc')}
                    />
                    <Change
                      icon={(
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                          <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                        </span>
                      )}
                      title={t('debateOwlIntro.sameTitle')}
                      description={t('debateOwlIntro.sameDesc')}
                    />
                  </ul>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col items-center text-center">
                  <Owl pose="idea" size={128} priority />
                  <DialogTitle className="mt-3 text-2xl leading-8">{t('debateOwlIntro.nameTitle')}</DialogTitle>
                  <DialogDescription className="mt-3 text-base leading-relaxed text-foreground">
                    {t('debateOwlIntro.nameBody')}
                  </DialogDescription>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 border-t-2 border-border px-6 py-4 sm:px-8">
          <Progress step={step} label={t('debateOwlIntro.progress', { step: step + 1, steps: STEPS })} />
          <div className="flex items-center gap-2">
            {!last && (
              <Button variant="ghost" onClick={onClose}>{t('debateOwlIntro.skip')}</Button>
            )}
            <Button ref={nextButton} onClick={() => (last ? onClose() : setStep(step + 1))}>
              {last ? t('debateOwlIntro.done') : t('debateOwlIntro.next')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A line of the owl's speech. It holds its space before it appears, so the bubble never jumps. */
function Line({ shown, className, children }: { shown: boolean; className?: string; children: string }) {
  return (
    <motion.span
      className={cn('block', className)}
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  );
}

function Change({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <li className="flex items-start gap-4">
      {icon}
      <div className="min-w-0 pt-0.5">
        <p className="font-display text-lg font-[600] leading-6 text-heading">{title}</p>
        <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

function Progress({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: STEPS }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            'h-2 rounded-full transition-[width,background-color] duration-200',
            index === step ? 'w-6 bg-primary' : 'w-2 bg-border',
          )}
        />
      ))}
    </div>
  );
}
