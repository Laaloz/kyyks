export type AppThemeMode = "light" | "dark" | "mallu" | "camel";

export const THEME_CHROME_COLORS: Record<
  AppThemeMode,
  {
    themeColor: string;
    colorScheme: "light" | "dark";
    appleStatusBarStyle: "default" | "black-translucent";
  }
> = {
  light: {
    themeColor: "#f3f4f0",
    colorScheme: "light",
    appleStatusBarStyle: "default",
  },
  dark: {
    themeColor: "#0f1311",
    colorScheme: "dark",
    appleStatusBarStyle: "black-translucent",
  },
  mallu: {
    themeColor: "#f8efec",
    colorScheme: "light",
    appleStatusBarStyle: "default",
  },
  camel: {
    themeColor: "#f6f0e4",
    colorScheme: "light",
    appleStatusBarStyle: "default",
  },
};

export function resolveThemeMode(themeMode: string | null | undefined): AppThemeMode {
  return themeMode === "dark" || themeMode === "mallu" || themeMode === "camel" ? themeMode : "light";
}

// Sovella teema heti documentElementiin (data-theme + color-scheme + selaimen
// chrome-värit). Käytetään sekä reaktiivisesti tilasta että optimistisesti
// suoraan käyttäjän valinnasta, jolloin vaihto näkyy ilman palvelinkutsun viivettä.
export function applyThemeToDocument(themeMode: string | null | undefined) {
  if (typeof document === "undefined") {
    return;
  }

  const mode = resolveThemeMode(themeMode);
  const chrome = THEME_CHROME_COLORS[mode];
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = chrome.colorScheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chrome.themeColor);
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", chrome.appleStatusBarStyle);
}
