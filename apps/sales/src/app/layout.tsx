import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-khmer/400.css";
import "@fontsource/noto-sans-khmer/600.css";
import "@fontsource/noto-sans-khmer/700.css";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@uplif/ui";
import { RegisterServiceWorker } from "@/components/register-sw";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "UPLIF Go",
  description: "Customer visits, calls and notes for field sales",
  applicationName: "UPLIF Go",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "UPLIF Go", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1D5FD1" }, { media: "(prefers-color-scheme: dark)", color: "#111A2B" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <I18nProvider><ToastProvider>{children}</ToastProvider></I18nProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
