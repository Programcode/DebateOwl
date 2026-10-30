import { useState, type CSSProperties } from 'react';
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

/** A one-shot move the owl plays when it arrives or changes pose (index.css, "The owl's motion"). */
export type OwlGesture = 'wave' | 'cheer' | 'hop';

const POSES: Record<OwlPose, string> = { point, idea, skeptical, surprised, celebrating, thinking, reading, timekeeper, arguing, coach, sleepy };

const GESTURES: Partial<Record<OwlPose, OwlGesture>> = {
  point: 'wave',
  coach: 'wave',
  arguing: 'wave',
  celebrating: 'cheer',
  surprised: 'hop',
  idea: 'hop',
};

/** Each eye's outline as [left, top, width, height] in % of the square; sleepy's are already shut. */
type EyeBox = readonly [number, number, number, number];
const EYES: Partial<Record<OwlPose | 'mark', readonly [EyeBox, EyeBox]>> = {
  arguing: [[34.4, 22.2, 12.8, 14], [56.6, 22.2, 11.8, 14]],
  celebrating: [[31.3, 20, 11.7, 12.8], [50.9, 19.4, 10.9, 12.8]],
  coach: [[37.7, 23.9, 13, 14.4], [60.4, 23.9, 12.1, 14.4]],
  idea: [[41.7, 23.5, 13.4, 14.7], [64.3, 24, 12.5, 14.7]],
  point: [[35.5, 22.7, 13.5, 14.8], [59, 22.7, 12.5, 14.8]],
  reading: [[33, 25.9, 12.8, 14], [55.2, 25.9, 11.8, 14]],
  skeptical: [[29.3, 27.8, 12.2, 11.8], [50.6, 27.4, 11.5, 11.8]],
  surprised: [[38.3, 17, 13, 14.3], [60.4, 17.5, 12.1, 14.3]],
  thinking: [[31.2, 25.9, 12.8, 14], [53.3, 25.9, 11.8, 14]],
  timekeeper: [[30.1, 22.2, 12.8, 14], [52.3, 22.2, 11.8, 14]],
  mark: [[27.3, 36.3, 18, 19.5], [54.7, 36.3, 18, 19.5]],
};

// Below this the lids are a pixel or two and the blink reads as flicker.
const MIN_BLINK_SIZE = 28;

/**
 * Every owl blinks on its own clock: a random period and phase, fixed for the owl's lifetime
 * so a re-render (a streaming reply re-renders often) never restarts it.
 */
function useBlinkClock(): CSSProperties {
  const [clock] = useState(() => ({
    '--owl-blink-period': `${(4.6 + Math.random() * 2.4).toFixed(2)}s`,
    '--owl-blink-delay': `${(-Math.random() * 6).toFixed(2)}s`,
  }));
  return clock as CSSProperties;
}

/** Two lids over the owl's eyes. They sit flat (scaleY 0) and close briefly on the blink keyframes. */
function OwlLids({ eyes, size }: { eyes: readonly [EyeBox, EyeBox]; size: number }) {
  const lash = `${Math.max(1, size * 0.012).toFixed(1)}px`;
  return (
    <>
      {eyes.map(([left, top, width, height], index) => (
        <span
          key={index}
          className="owl-lid"
          style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, '--owl-lash': lash } as CSSProperties}
        />
      ))}
    </>
  );
}

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
  /** The move played on arrival and on each pose change; false keeps it still. Defaults by pose. */
  gesture?: OwlGesture | false;
  /** A slow breath while idle. Off on the landing page, where nothing moves on its own. */
  breathe?: boolean;
}

/**
 * The owl, full body. It blinks, breathes, plays its pose's gesture when it arrives, and hops when
 * hovered. Changing `pose` animates from one pose to the next. All of it is CSS keyframes, so
 * reduced motion (index.css) stops every move and leaves the owl still.
 */
export function Owl({ pose, size, className, label, priority = false, gesture, breathe = true }: OwlProps) {
  const clock = useBlinkClock();
  const move = gesture === undefined ? GESTURES[pose] : gesture;
  const eyes = size >= MIN_BLINK_SIZE ? EYES[pose] : undefined;
  return (
    <span
      className={cn('owl relative inline-block shrink-0', className)}
      style={{ width: size, height: size, ...clock }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className={cn('owl-body absolute inset-0', breathe && 'owl-breathe')}>
        <AnimatePresence initial={false}>
          <motion.span
            key={pose}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            transition={POSE_TRANSITION}
          >
            {/* Keyed with the pose, so the gesture replays on every change. */}
            <span className={cn('absolute inset-0', move && `owl-gesture-${move}`)}>
              <img
                src={POSES[pose]}
                width={size}
                height={size}
                alt={label ?? ''}
                draggable={false}
                decoding="async"
                loading={priority ? 'eager' : 'lazy'}
                className="absolute inset-0 h-full w-full select-none object-contain"
              />
              {eyes && <OwlLids eyes={eyes} size={size} />}
            </span>
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

interface OwlAvatarProps {
  pose: OwlPose;
  /** Diameter in CSS pixels. */
  size?: number;
  className?: string;
  label?: string;
  /**
   * Blink now and then. Off by default: a transcript renders one avatar per message, and only
   * the one that is present (a header, a working indicator) should look alive.
   */
  blink?: boolean;
}

/** The owl's head and shoulders in a tinted circle: the Ask coach and the Sparring opponent. */
export function OwlAvatar({ pose, size = 40, className, label, blink = false }: OwlAvatarProps) {
  const clock = useBlinkClock();
  // The avatar zooms 1.6x onto the head, so its lids are big enough from a smaller size.
  const eyes = blink && size * 1.6 >= MIN_BLINK_SIZE ? EYES[pose] : undefined;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full bg-plume-100 ring-2 ring-white dark:bg-plume-900 dark:ring-ink-900',
        className,
      )}
      style={{ width: size, height: size, ...clock }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={pose}
          // The full pose, zoomed onto the head and shoulders; the lids zoom with it.
          className="absolute inset-0 origin-[52%_32%] scale-[1.6]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <img
            src={POSES[pose]}
            width={size}
            height={size}
            alt={label ?? ''}
            draggable={false}
            decoding="async"
            className="absolute inset-0 h-full w-full select-none object-contain"
          />
          {eyes && <OwlLids eyes={eyes} size={size * 1.6} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The app mark: the owl's head on its sky tile (public/owl-mark.svg, also the favicon source).
 * It blinks now and then wherever it is big enough to see.
 */
export function OwlMark({ size = 36, className, alt = '' }: { size?: number; className?: string; alt?: string }) {
  const clock = useBlinkClock();
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-[28%] shadow-[0_2px_0_var(--do-plume-200)] dark:shadow-[0_2px_0_var(--do-plume-950)]', className)}
      style={{ width: size, height: size, ...clock }}
    >
      <img src="/owl-mark.svg" alt={alt} width={size} height={size} decoding="async" className="block h-full w-full" />
      {size >= MIN_BLINK_SIZE && EYES.mark && <span aria-hidden="true"><OwlLids eyes={EYES.mark} size={size} /></span>}
    </span>
  );
}
