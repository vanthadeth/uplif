import { Reveal } from "@uplif/ui";

/** A template remounts on every navigation, so each page fades in instead of snapping. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <Reveal>{children}</Reveal>;
}
