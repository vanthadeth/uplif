// A template remounts on every navigation, so each page eases in. Reduced motion is handled in theme.css.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-[uplif-in_220ms_ease-out_both]">{children}</div>;
}
