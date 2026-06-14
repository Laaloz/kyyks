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
