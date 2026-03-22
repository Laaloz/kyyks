import type { Metadata, Viewport } from "next";

import { AppStateProvider } from "@/providers/app-state-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Rookiapp",
  description: "Coach-first training platform for building workout plans and tracking execution.",
  applicationName: "Rookiapp",
};

export const viewport: Viewport = {
  themeColor: "#f3f7fc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi">
      <body suppressHydrationWarning>
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-2xl focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white"
          href="#main-content"
        >
          Siirry sisältöön
        </a>
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
