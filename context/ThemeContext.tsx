import React, { createContext, useState } from "react";

type ThemeContextType = {
  isDark: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  colors: typeof lightTheme;
};

const darkTheme = {
  background: "#121212",
  surface: "#1C1C1E",
  surfaceVariant: "#242426",
  appChrome: "#121212",
  appChromeMuted: "#242426",
  appChromeElevated: "#1C1C1E",
  glass: "rgba(255,255,255,0.06)",
  glassStrong: "rgba(255,255,255,0.10)",
  overlay: "rgba(0, 0, 0, 0.72)",
  primary: "#EAB308",
  secondary: "#10B981",
  error: "#f87171",
  text: "#ffffff",
  textSecondary: "#9CA3AF",
  textPlaceholder: "rgba(255,255,255,0.4)",
  success: "#10B981",
  warning: "#EAB308",
  card: "#1C1C1E",
  cardMuted: "#242426",
  border: "rgba(255,255,255,0.06)",
  shadow: "rgba(0, 0, 0, 0.45)",
  navBg: "rgba(44,44,46,0.9)",
  navActive: "rgba(255,255,255,0.1)",
  accentBlue: "#60A5FA",
  accentGold: "#EAB308",
  accentSky: "#60A5FA",
  accentIndigo: "#818CF8",
  accentCoral: "#F87171",
  accentOrange: "#FB923C",
  accentGreen: "#10B981",
  accentPurple: "#c084fc",
  accentRed: "#F87171",
};

const lightTheme = darkTheme;

export type AppColors = typeof darkTheme;

export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: "light",
  toggleTheme: () => {},
  colors: lightTheme,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
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


