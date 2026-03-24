import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { AppStateProvider } from "@/providers/app-state-provider";

import "./globals.css";

const themeInitScript = `
(() => {
  const stateKey = "rookiapp-state-v3";
  const sessionKey = "rookiapp-session-v2";
  const applyTheme = (themeMode) => {
    const theme = themeMode === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  };

  try {
    const rawState = window.localStorage.getItem(stateKey);
    const rawSession = window.localStorage.getItem(sessionKey);
    if (!rawState || !rawSession) {
      applyTheme("light");
      return;
    }

    const state = JSON.parse(rawState);
    let parsedSession;
    try {
      parsedSession = JSON.parse(rawSession);
    } catch {
      parsedSession = { authenticatedUserId: rawSession, impersonatedUserId: null };
    }

    const activeUserId =
      typeof parsedSession?.impersonatedUserId === "string"
        ? parsedSession.impersonatedUserId
        : typeof parsedSession?.authenticatedUserId === "string"
          ? parsedSession.authenticatedUserId
          : null;

    const activeUser = Array.isArray(state?.users)
      ? state.users.find((user) => user?.id === activeUserId)
      : null;

    applyTheme(activeUser?.settings?.themeMode);
  } catch {
    applyTheme("light");
  }
})();
`;

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
    <html lang="fi" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
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
