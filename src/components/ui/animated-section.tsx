import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedSectionProps {
  delay?: number;
  children: ReactNode;
  className?: string;
}

export function AnimatedSection({ delay = 0, children, className }: AnimatedSectionProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className
      )}
    >
      {children}
    </div>
  );
}

interface StaggeredContainerProps {
  children: ReactNode;
  staggerMs?: number;
  className?: string;
}

export function StaggeredContainer({ children, staggerMs = 200, className }: StaggeredContainerProps) {
  return (
    <div className={cn('staggered-container', className)} style={{ '--stagger-ms': `${staggerMs}ms` } as React.CSSProperties}>
      {children}
      <style>{`
        .staggered-container > * {
          opacity: 0;
          transform: translateY(8px);
          animation: stagger-in 0.3s ease-out forwards;
        }
        ${Array.from({ length: 10 }, (_, i) => `.staggered-container > *:nth-child(${i + 1}) { animation-delay: ${i * staggerMs}ms; }`).join('\n')}
        @keyframes stagger-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .staggered-container > * {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
