"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/**
 * True while the bar should be on screen: shown at the top and at the very bottom of the page, hidden while the
 * person scrolls down, shown again as soon as they scroll up. Small jitters (under `threshold` px) are ignored.
 */
export function useHideOnScroll({ threshold = 10, topOffset = 48 }: { threshold?: number; topOffset?: number } = {}) {
  const [visible, setVisible] = useState(true);
  const last = useRef(0);
  const frame = useRef(0);
  useEffect(() => {
    last.current = window.scrollY;
    const update = () => {
      frame.current = 0;
      const y = Math.max(0, window.scrollY);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const delta = y - last.current;
      if (y <= topOffset || (max > 0 && y >= max - 4)) setVisible(true);
      else if (Math.abs(delta) >= threshold) setVisible(delta < 0);
      else return;
      last.current = y;
    };
    const onScroll = () => { if (!frame.current) frame.current = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [threshold, topOffset]);
  return visible;
}

/**
 * Phone bottom navigation shell shared by the phone apps. Fixed to the screen edge, clear of the home indicator,
 * slides away when scrolling down and back when scrolling up. It stays visible while a control inside has focus.
 * `overhang` is how far content (a raised centre button) sticks out above the bar, so it hides completely.
 */
export function BottomNav({ label, children, overhang = "2rem", className }: { label: string; children: React.ReactNode; overhang?: string; className?: string }) {
  const scrolled = useHideOnScroll();
  const [focused, setFocused] = useState(false);
  const shown = scrolled || focused;
  return (
    <nav aria-label={label}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ transform: shown ? "translateY(0)" : `translateY(calc(100% + ${overhang}))` }}
      className={cn("fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out motion-reduce:transition-none", className)}>
      {children}
    </nav>
  );
}
