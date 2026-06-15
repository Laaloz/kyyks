import type { Metadata } from "next";
import { Manrope, Schibsted_Grotesk } from "next/font/google";
import Script from "next/script";

import { APP_SESSION_STORAGE_KEY, APP_STATE_STORAGE_KEY } from "@/lib/app-state-storage";
import { THEME_CHROME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme-chrome";
import { AppStateProvider } from "@/providers/app-state-provider";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
});

const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted-grotesk",
  display: "swap",
});

const themeInitScript = `
(() => {
  const stateKey = "${APP_STATE_STORAGE_KEY}";
  const sessionKey = "${APP_SESSION_STORAGE_KEY}";
  const themeChrome = ${JSON.stringify(THEME_CHROME_COLORS)};
  const applyTheme = (themeMode) => {
    const theme = themeMode === "dark" || themeMode === "mallu" || themeMode === "camel" ? themeMode : "light";
    const chrome = themeChrome[theme] || themeChrome.light;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = chrome.colorScheme;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", chrome.themeColor);
    }
    const appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatusMeta) {
      appleStatusMeta.setAttribute("content", chrome.appleStatusBarStyle);
    }
  };

  // Aksenttiväri on laitekohtainen (localStorage). Sovella ennen hydraatiota.
  try {
    const accent = window.localStorage.getItem("accent-color");
    const dataAccent = accent === "blue" ? "sini" : accent === "copper" ? "kupari" : null;
    if (dataAccent) {
      document.documentElement.dataset.accent = dataAccent;
    } else {
      delete document.documentElement.dataset.accent;
    }
  } catch {}

  // Laitekohtainen teema-cache on DOM:n auktoriteetti: käytä sitä ensisijaisesti,
  // jotta ensipaint vastaa käyttäjän valintaa eikä vilahda väärää teemaa.
  try {
    const storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "mallu" || storedTheme === "camel") {
      applyTheme(storedTheme);
      return;
    }
  } catch {}

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
    title: "rooki.fit",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi" className={`${manrope.variable} ${schibstedGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <meta id="theme-color-meta" name="theme-color" content="#f3f4f0" />
        <meta id="apple-status-bar-style-meta" name="apple-mobile-web-app-status-bar-style" content="default" />
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
