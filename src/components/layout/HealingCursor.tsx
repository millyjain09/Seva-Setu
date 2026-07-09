import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

export const HealingCursor = () => {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-full"
      style={{
        width: 20,
        height: 20,
        left: pos.x - 10,
        top: pos.y - 10,
        background: 'hsl(122 46% 33% / 0.25)',
        filter: 'blur(8px)',
        transition: 'left 0.08s ease-out, top 0.08s ease-out',
      }}
    />
  );
};
