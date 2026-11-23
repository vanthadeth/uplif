"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Reveals its content (fade and lift) the first time it scrolls into view. Use it for long pages such as
 * a landing page; for content that is on screen at once, use `Reveal`. Pass a delay (ms) to stagger a row.
 * Without IntersectionObserver the content simply shows; reduced-motion users get no animation (see theme.css).
 */
export function InView({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // "ssr" renders visible (readable without script); once mounted it hides until scrolled to, then animates in.
  const [phase, setPhase] = useState<"ssr" | "hidden" | "shown">("ssr");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    setPhase("hidden");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setPhase("shown"); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const style: CSSProperties | undefined = delay ? { animationDelay: `${Math.min(delay, 400)}ms` } : undefined;
  return (
    <div ref={ref} style={style} className={cn(phase === "shown" && "animate-[uplif-in_320ms_ease-out_both]", phase === "hidden" && "opacity-0", className)}>
      {children}
    </div>
  );
}
