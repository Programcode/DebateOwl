import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import point160 from '@/assets/owl/owl-point-160.webp';
import point320 from '@/assets/owl/owl-point-320.webp';
import point640 from '@/assets/owl/owl-point-640.webp';
import idea160 from '@/assets/owl/owl-idea-160.webp';
import idea320 from '@/assets/owl/owl-idea-320.webp';
import idea480 from '@/assets/owl/owl-idea-480.webp';
import skeptical160 from '@/assets/owl/owl-skeptical-160.webp';
import skeptical320 from '@/assets/owl/owl-skeptical-320.webp';
import skeptical480 from '@/assets/owl/owl-skeptical-480.webp';
import surprised160 from '@/assets/owl/owl-surprised-160.webp';
import surprised320 from '@/assets/owl/owl-surprised-320.webp';
import surprised480 from '@/assets/owl/owl-surprised-480.webp';
import celebrating160 from '@/assets/owl/owl-celebrating-160.webp';
import celebrating320 from '@/assets/owl/owl-celebrating-320.webp';
import celebrating480 from '@/assets/owl/owl-celebrating-480.webp';
import pointBust96 from '@/assets/owl/owl-point-bust-96.webp';
import pointBust192 from '@/assets/owl/owl-point-bust-192.webp';
import ideaBust96 from '@/assets/owl/owl-idea-bust-96.webp';
import ideaBust192 from '@/assets/owl/owl-idea-bust-192.webp';
import skepticalBust96 from '@/assets/owl/owl-skeptical-bust-96.webp';
import skepticalBust192 from '@/assets/owl/owl-skeptical-bust-192.webp';

/**
 * The owl's poses, cut from the mascot art as transparent WebP at 1x to 3x:
 * point (eager, pointing at the action), idea (finger up, making a point),
 * skeptical (arms crossed, sizing up an argument), surprised, celebrating.
 */
export type OwlPose = 'point' | 'idea' | 'skeptical' | 'surprised' | 'celebrating';
export type OwlBustPose = 'point' | 'idea' | 'skeptical';

const FULL: Record<OwlPose, string> = {
  point: `${point160} 160w, ${point320} 320w, ${point640} 640w`,
  idea: `${idea160} 160w, ${idea320} 320w, ${idea480} 480w`,
  skeptical: `${skeptical160} 160w, ${skeptical320} 320w, ${skeptical480} 480w`,
  surprised: `${surprised160} 160w, ${surprised320} 320w, ${surprised480} 480w`,
  celebrating: `${celebrating160} 160w, ${celebrating320} 320w, ${celebrating480} 480w`,
};

const FALLBACK: Record<OwlPose, string> = {
  point: point320,
  idea: idea320,
  skeptical: skeptical320,
  surprised: surprised320,
  celebrating: celebrating320,
};

const BUST: Record<OwlBustPose, [string, string]> = {
  point: [pointBust96, pointBust192],
  idea: [ideaBust96, ideaBust192],
  skeptical: [skepticalBust96, skepticalBust192],
};

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
          src={FALLBACK[pose]}
          srcSet={FULL[pose]}
          sizes={`${size}px`}
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
  pose: OwlBustPose;
  /** Diameter in CSS pixels. */
  size?: number;
  className?: string;
  label?: string;
}

/** The owl's head and shoulders in a tinted circle: the Ask coach and the Sparring opponent. */
export function OwlAvatar({ pose, size = 40, className, label }: OwlAvatarProps) {
  const [x1, x2] = BUST[pose];
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
          src={x1}
          srcSet={`${x1} 96w, ${x2} 192w`}
          sizes={`${size}px`}
          width={size}
          height={size}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute inset-0 h-full w-full translate-y-[6%] scale-110 select-none object-cover"
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
