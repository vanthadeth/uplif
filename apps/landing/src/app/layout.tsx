import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-khmer/400.css";
import "@fontsource/noto-sans-khmer/600.css";
import "@fontsource/noto-sans-khmer/700.css";
import "./globals.css";
import { themeInitScript } from "@uplif/ui";
import { I18nProvider } from "@/lib/i18n";

const description = "Attendance, field sales, orders and stock for small shops, in apps your team can install on their phones.";

export const metadata: Metadata = {
  title: "UPLIF: Business management made simple",
  description,
  applicationName: "UPLIF",
  openGraph: { title: "UPLIF: Business management made simple", description, type: "website", siteName: "UPLIF" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1D5FD1" }, { media: "(prefers-color-scheme: dark)", color: "#111A2B" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
