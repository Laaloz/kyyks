import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { AppStateProvider } from "@/providers/app-state-provider";

import "./globals.css";

const themeInitScript = `
(() => {
  const stateKey = "rooki-fit-state-v1";
  const sessionKey = "rooki-fit-session-v1";
  const themeColorByTheme = {
    light: "#f3f7fc",
    dark: "#08111f",
    mallu: "#fff1ef",
  };
  const applyTheme = (themeMode) => {
    const theme = themeMode === "dark" || themeMode === "mallu" ? themeMode : "light";
    const colorScheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = colorScheme;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeColorByTheme[theme]);
    }
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
  title: "rooki.fit",
  description: "Coach-first training platform for building workout plans and tracking execution.",
  applicationName: "rooki.fit",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
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
        <meta id="theme-color-meta" name="theme-color" content="#f3f7fc" />
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
