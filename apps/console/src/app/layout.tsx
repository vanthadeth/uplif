import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-khmer/400.css";
import "@fontsource/noto-sans-khmer/600.css";
import "@fontsource/noto-sans-khmer/700.css";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@uplif/ui";
import { RegisterServiceWorker } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "UPLIF",
  description: "Business management made simple",
  applicationName: "UPLIF",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "UPLIF", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1D5FD1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider><ToastProvider>{children}</ToastProvider></I18nProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
