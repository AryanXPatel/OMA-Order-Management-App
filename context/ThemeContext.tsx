import React, { createContext, useState } from "react";
import { Appearance } from "react-native";

type ThemeContextType = {
  isDark: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  colors: typeof lightTheme;
};

const lightTheme = {
  background: "#f7f8f9",
  surface: "#ffffff",
  surfaceVariant: "#eef2f6",
  appChrome: "#111214",
  appChromeMuted: "#191b20",
  appChromeElevated: "#222327",
  glass: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.12)",
  overlay: "rgba(3, 7, 18, 0.56)",
  primary: "#0066FF",
  secondary: "#22c55e",
  error: "#ef4444",
  text: "#0c1a2e",
  textSecondary: "#667085",
  textPlaceholder: "rgba(12,26,46,0.35)",
  success: "#16a34a",
  warning: "#f59e0b",
  card: "#ffffff",
  cardMuted: "#f5f7fb",
  border: "#e7ecf3",
  shadow: "rgba(15, 23, 42, 0.08)",
  navBg: "rgba(44,44,46,0.92)",
  navActive: "rgba(255,255,255,0.1)",
  accentBlue: "#0066FF",
  accentGold: "#f6c64c",
  accentSky: "#63a5ff",
  accentIndigo: "#7a75ff",
  accentCoral: "#ff8a7a",
  accentOrange: "#fb923c",
  accentGreen: "#22c55e",
  accentPurple: "#a855f7",
  accentRed: "#ef4444",
};

const darkTheme = {
  background: "#0a0a0c",
  surface: "#141417",
  surfaceVariant: "#1b1c20",
  appChrome: "#0a0a0c",
  appChromeMuted: "#141417",
  appChromeElevated: "#1f1f23",
  glass: "rgba(255,255,255,0.06)",
  glassStrong: "rgba(255,255,255,0.10)",
  overlay: "rgba(0, 0, 0, 0.72)",
  primary: "#0066FF",
  secondary: "#4ade80",
  error: "#f87171",
  text: "#ffffff",
  textSecondary: "#98a2b3",
  textPlaceholder: "rgba(255,255,255,0.4)",
  success: "#4ade80",
  warning: "#fbbf24",
  card: "#101a2b",
  cardMuted: "#131f31",
  border: "#2b2c31",
  shadow: "rgba(0, 0, 0, 0.45)",
  navBg: "rgba(44,44,46,0.9)",
  navActive: "rgba(255,255,255,0.1)",
  accentBlue: "#0066FF",
  accentGold: "#f6c64c",
  accentSky: "#63a5ff",
  accentIndigo: "#7a75ff",
  accentCoral: "#ff8a7a",
  accentOrange: "#fb923c",
  accentGreen: "#4ade80",
  accentPurple: "#c084fc",
  accentRed: "#f87171",
};

export type AppColors = typeof lightTheme;

export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: "light",
  toggleTheme: () => {},
  colors: lightTheme,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<"light" | "dark">(
    Appearance.getColorScheme() || "light"
  );
  const isDark = theme === "dark";

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const colors = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;


