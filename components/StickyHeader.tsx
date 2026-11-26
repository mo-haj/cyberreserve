'use client';

// The site header stays at the top while scrolling. At the top of the page
// it is see-through as before; once the page scrolls it turns to frosted
// glass (60% dark + blur, so the background grid never fights the text) and
// gets a little shorter. Its height is shared as --hdr-h, so things that stick
// under it (the dashboard tabs) sit right below it.
import { useEffect, useRef, useState } from 'react';

export function StickyHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Two thresholds, far apart: the header turns compact after 64px of
    // scrolling and back only near the very top. With one threshold, the
    // header's own shrink moved the page under it and it flipped back and
    // forth (shaking) when the scroll stopped right at the edge.
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((was) => (was ? y > 4 : y > 64));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const el = ref.current;
    const size = () => el && document.documentElement.style.setProperty('--hdr-h', `${el.offsetHeight}px`);
    size();
    const ro = el ? new ResizeObserver(size) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, []);

  return (
    <header
      ref={ref}
      data-scrolled={scrolled}
      className="group/hdr sticky top-0 z-40 transition-[background-color,box-shadow] duration-200 data-[scrolled=true]:bg-[rgba(5,6,15,0.6)] data-[scrolled=true]:shadow-[0_1px_0_rgba(157,92,255,0.22),0_10px_30px_-18px_rgba(0,0,0,0.8)] data-[scrolled=true]:backdrop-blur-md"
    >
      {children}
    </header>
  );
}
