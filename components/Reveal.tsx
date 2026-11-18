'use client';

import { useEffect, useRef, useState } from 'react';

// Fades and slides its content in the first time it scrolls into view.
// The motion itself lives in globals.css (.reveal) and is switched off for
// visitors who ask for reduced motion.
export default function Reveal({
  children,
  from = 'bottom',
  className = '',
}: {
  children: React.ReactNode;
  from?: 'start' | 'end' | 'bottom';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-from={from} data-shown={shown ? 'true' : 'false'} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
