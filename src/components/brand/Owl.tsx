import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import point from '@/assets/owl/owl-point.svg';
import idea from '@/assets/owl/owl-idea.svg';
import skeptical from '@/assets/owl/owl-skeptical.svg';
import surprised from '@/assets/owl/owl-surprised.svg';
import celebrating from '@/assets/owl/owl-celebrating.svg';
import thinking from '@/assets/owl/owl-thinking.svg';
import reading from '@/assets/owl/owl-reading.svg';
import timekeeper from '@/assets/owl/owl-timekeeper.svg';
import arguing from '@/assets/owl/owl-arguing.svg';
import coach from '@/assets/owl/owl-coach.svg';
import sleepy from '@/assets/owl/owl-sleepy.svg';

/**
 * The owl's poses, hand-traced SVGs on a 512 px square: point (eager, pointing at the action),
 * idea (finger up), skeptical (arms crossed), surprised, celebrating, thinking (wing at the beak),
 * reading (open book), timekeeper (stopwatch), arguing (wings out, the Sparring opponent),
 * coach (thumbs up, the Ask coach) and sleepy (nothing here yet).
 */
export type OwlPose = 'point' | 'idea' | 'skeptical' | 'surprised' | 'celebrating' | 'thinking' | 'reading' | 'timekeeper' | 'arguing' | 'coach' | 'sleepy';

const POSES: Record<OwlPose, string> = { point, idea, skeptical, surprised, celebrating, thinking, reading, timekeeper, arguing, coach, sleepy };

// A pose change crossfades with a small pop on the design system's `pop` spring. With reduced
// motion, App's MotionConfig drops the scale and travel and only the fade remains.
const POSE_TRANSITION = { type: 'spring', stiffness: 420, damping: 22, mass: 1, opacity: { duration: 0.16 } } as const;

interface OwlProps {
  pose: OwlPose;
  /** Rendered width and height in CSS pixels. */
  size: number;
  className?: string;
  /** A spoken description when the owl carries meaning; decorative owls are hidden from assistive tech. */
  label?: string;
  /** Above the fold: load at once instead of when scrolled near. */
  priority?: boolean;
}

/** The owl, full body. Changing `pose` animates from one pose to the next. */
export function Owl({ pose, size, className, label, priority = false }: OwlProps) {
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={pose}
          src={POSES[pose]}
          width={size}
          height={size}
          alt=""
          draggable={false}
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          className="absolute inset-0 h-full w-full select-none object-contain"
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 0 }}
          transition={POSE_TRANSITION}
        />
      </AnimatePresence>
    </span>
  );
}

interface OwlAvatarProps {
  pose: OwlPose;
  /** Diameter in CSS pixels. */
  size?: number;
  className?: string;
  label?: string;
}

/** The owl's head and shoulders in a tinted circle: the Ask coach and the Sparring opponent. */
export function OwlAvatar({ pose, size = 40, className, label }: OwlAvatarProps) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full bg-plume-100 ring-2 ring-white dark:bg-plume-900 dark:ring-ink-900',
        className,
      )}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={pose}
          src={POSES[pose]}
          width={size}
          height={size}
          alt=""
          draggable={false}
          decoding="async"
          // The full pose, zoomed onto the head and shoulders.
          className="absolute inset-0 h-full w-full origin-[52%_32%] scale-[1.6] select-none object-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />
      </AnimatePresence>
    </span>
  );
}

/** The app mark: the owl's head on its sky tile (public/owl-mark.svg, also the favicon source). */
export function OwlMark({ size = 36, className, alt = '' }: { size?: number; className?: string; alt?: string }) {
  return (
    <img
      src="/owl-mark.svg"
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={cn('shrink-0 rounded-[28%] shadow-[0_2px_0_var(--do-plume-200)] dark:shadow-[0_2px_0_var(--do-plume-950)]', className)}
    />
  );
}
