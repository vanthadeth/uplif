import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { ToastProvider, themeInitScript } from "@uplif/ui";

export const metadata: Metadata = {
  title: "UPLIF Super Admin",
  description: "Platform administration for UPLIF",
  applicationName: "UPLIF Super Admin",
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
