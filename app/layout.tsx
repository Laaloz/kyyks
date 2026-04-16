import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { APP_SESSION_STORAGE_KEY, APP_STATE_STORAGE_KEY } from "@/lib/app-state-storage";
import { AppStateProvider } from "@/providers/app-state-provider";

import "./globals.css";

const themeInitScript = `
(() => {
  const stateKey = "${APP_STATE_STORAGE_KEY}";
  const sessionKey = "${APP_SESSION_STORAGE_KEY}";
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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "rooki.fit",
  },
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
        <meta name="mobile-web-app-capable" content="yes" />
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <Script id="service-worker-register" strategy="afterInteractive">
          {`
            if ("serviceWorker" in navigator) {
              window.addEventListener("load", () => {
                navigator.serviceWorker.register("/sw.js").catch(() => {
                  // Best-effort registration for Android installability.
                });
              });
            }
          `}
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
