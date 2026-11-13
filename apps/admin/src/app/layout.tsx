import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-khmer/400.css";
import "@fontsource/noto-sans-khmer/600.css";
import "@fontsource/noto-sans-khmer/700.css";
import "./globals.css";
import { ToastProvider, themeInitScript } from "@uplif/ui";

export const metadata: Metadata = {
  title: "UPLIF Platform",
  description: "Platform administration for UPLIF",
  applicationName: "UPLIF Platform",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1D5FD1" }, { media: "(prefers-color-scheme: dark)", color: "#111A2B" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
