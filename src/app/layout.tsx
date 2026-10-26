import { LOCALE } from "@/lib/format";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { TimeZoneSync } from "@/components/time-zone-sync";
import { getTheme } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Nest Ledger", template: "%s · Nest Ledger" },
  description: "Our household budget and spending.",
  appleWebApp: { capable: true, title: "Nest Ledger", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme cookie is read on the server so the first paint is already in the chosen theme.
  const theme = await getTheme();
  return (
    <html lang={LOCALE} className={inter.variable} data-scroll-behavior="smooth" data-theme={theme === "system" ? undefined : theme}
      data-private={(await cookies()).get("nl_private")?.value === "1" ? "" : undefined}>
      <body>{children}<TimeZoneSync current={(await cookies()).get("tz")?.value ?? null} /></body>
    </html>
  );
}
