import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Paintbrush } from 'lucide-react';
import { Owl, type OwlPose } from '@/components/brand/Owl';
import { Button, ThinkingDots } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OWL_NAME } from '@/lib/debateowl-intro';
import { cn } from '@/lib/utils';

// The owl's lines. Beat n shows lines 1..n; each beat starts at `at` ms and sets the owl's pose.
// Beat 0 is the owl landing, surprised to see you. The last beat lands at 5.6 s and the owl
// settles by 6.6 s. Reduced motion, and Skip animation, show the last beat straight away.
const BEATS: { at: number; pose: OwlPose }[] = [
  { at: 0, pose: 'surprised' },
  { at: 700, pose: 'celebrating' },
  { at: 2300, pose: 'idea' },
  { at: 3900, pose: 'thinking' },
  { at: 5600, pose: 'coach' },
];
const LAST_BEAT = BEATS.length - 1;
const SETTLED_AT = 6600;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * The one-time DebateOwl welcome: the owl introduces itself line by line beside the rename
 * notice, in one dialog with one way out. Got it, Esc and the backdrop all call onClose.
 */
export function DebateOwlIntro({ onClose, owlName = OWL_NAME }: { onClose: () => void; owlName?: string }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion() === true;
  const [beat, setBeat] = useState(() => (reduceMotion ? LAST_BEAT : 0));
  const [settled, setSettled] = useState(reduceMotion);
  const doneButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reduceMotion || settled) {
      setBeat(LAST_BEAT);
      setSettled(true);
      return;
    }
    const timers = [
      ...BEATS.slice(1).map(({ at }, index) => window.setTimeout(() => setBeat(index + 1), at)),
      window.setTimeout(() => setSettled(true), SETTLED_AT),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion, settled]);

  // The owl's personal name is still being chosen; until then it introduces itself as DebateOwl.
  const name = owlName.trim();
  const greeting = name ? t('debateOwlIntro.greetingNamed', { name }) : t('debateOwlIntro.greeting');
  const pose = BEATS[beat].pose;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-testid="debateowl-intro"
        // One way out: Got it. Esc and the backdrop still close it.
        closeClassName="hidden"
        className="max-h-[calc(100dvh-1.5rem)] max-w-[34rem] gap-0 overflow-y-auto p-0 lg:max-w-[38rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          doneButton.current?.focus();
        }}
      >
        <div className="flex flex-col items-center gap-5 px-6 pt-7 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:pt-8">
          <motion.div
            className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-plume-100 dark:bg-plume-900"
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <motion.span
              className={cn('-mb-2', pose === 'thinking' && 'owl-bob')}
              initial={reduceMotion ? false : { y: 36, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.15 }}
            >
              <Owl pose={pose} size={136} priority />
            </motion.span>
          </motion.div>

          <div
            className={cn(
              'relative w-full rounded-2xl border-2 border-border bg-accent px-5 py-4',
              // The bubble's tail points up at the owl when stacked, left beside it.
              'before:absolute before:h-4 before:w-4 before:rotate-45 before:border-border before:bg-accent',
              'before:-top-[9px] before:left-1/2 before:-translate-x-1/2 before:border-l-2 before:border-t-2',
              'sm:before:left-[-9px] sm:before:top-1/2 sm:before:-translate-y-1/2 sm:before:translate-x-0 sm:before:border-t-0 sm:before:border-b-2',
            )}
          >
            <ul className="relative space-y-2">
              <Line shown={beat >= 1} className="font-display text-xl font-[600] leading-7 text-heading text-balance">
                {greeting}
              </Line>
              <Line shown={beat >= 2} icon={<Paintbrush className="h-4 w-4 text-primary" strokeWidth={2.5} />}>
                {t('debateOwlIntro.newLook')}
              </Line>
              <Line shown={beat >= 3} icon={<ThinkingDots className="text-[0.7rem] text-primary" />}>
                {t('debateOwlIntro.company')}
              </Line>
              <Line shown={beat >= 4} icon={<Check className="h-4 w-4 text-success" strokeWidth={3} />}>
                {t('debateOwlIntro.sameTools')}
              </Line>
            </ul>
          </div>
        </div>

        <div className="px-6 pb-6 pt-6 sm:px-8">
          <DialogTitle className="text-[1.375rem] leading-7">{t('debateOwlIntro.noticeTitle')}</DialogTitle>
          <DialogDescription className="mt-2 text-base leading-relaxed text-foreground">
            {t('debateOwlIntro.noticeBody')}
          </DialogDescription>
        </div>

        <div className="flex min-h-[4.75rem] items-center justify-between gap-3 border-t-2 border-border px-6 py-4 sm:px-8">
          {settled ? <span /> : (
            <Button variant="ghost" size="sm" className="-ml-3.5 text-muted-foreground" onClick={() => setSettled(true)}>
              {t('debateOwlIntro.skipAnimation')}
            </Button>
          )}
          <Button ref={doneButton} onClick={onClose}>{t('debateOwlIntro.done')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One of the owl's lines. It holds its space before it appears, so the bubble never jumps. */
function Line({ shown, icon, className, children }: {
  shown: boolean;
  icon?: ReactNode;
  className?: string;
  children: string;
}) {
  return (
    <motion.li
      className={cn('flex items-start gap-2.5 text-base leading-6 text-foreground', className)}
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
    >
      {/* The icon pops in as its line lands; the check draws itself. */}
      {icon && <span className={cn('mt-1 flex h-4 w-5 shrink-0 items-center justify-center', shown && 'success-pop [--success-delay:120ms]')} aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </motion.li>
  );
}
