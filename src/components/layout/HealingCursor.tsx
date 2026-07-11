import { useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

export const HealingCursor = () => {
  const isMobile = useIsMobile();
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    const handler = (e: MouseEvent) => {
      // Use requestAnimationFrame to sync directly with the browser's refresh rate (60Hz/144Hz+)
      requestAnimationFrame(() => {
        // Offset by -10 to center the 20px circle perfectly under the pointer
        cursor.style.transform = `translate3d(${e.clientX - 10}px, ${e.clientY - 10}px, 0)`;
      });
    };

    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full"
      style={{
        width: 20,
        height: 20,
        background: 'hsl(122 46% 33% / 0.25)',
        filter: 'blur(8px)',
        // removed top/left transitions entirely for instantaneous response
        willChange: 'transform', // Tells the browser to use GPU acceleration
        transform: 'translate3d(-100px, -100px, 0)', // initial hidden state
      }}
    />
  );
};