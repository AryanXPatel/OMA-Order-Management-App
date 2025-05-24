import React, { createContext, useState, useEffect } from "react";
import { Appearance } from "react-native";

type ThemeContextType = {
  isDark: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  colors: typeof lightTheme;
};

const lightTheme = {
  background: "#ffffff",
  surface: "#f5f6fa",
  surfaceVariant: "rgba(245, 246, 250, 0.8)",
  primary: "#3498db",
  secondary: "#2ecc71",
  error: "#e74c3c",
  text: "#000000",
  textSecondary: "#666666",
  textPlaceholder: "rgba(0,0,0,0.4)",
  success: "#2ecc71",
  warning: "#f39c12",
};

const darkTheme = {
  background: "#1a1a1a",
  surface: "#252525",
  surfaceVariant: "rgba(50, 50, 50, 0.8)",
  primary: "#3498db",
  secondary: "#2ecc71",
  error: "#e74c3c",
  text: "#ffffff",
  textSecondary: "#bbbbbb",
  textPlaceholder: "rgba(255,255,255,0.4)",
  success: "#2ecc71",
  warning: "#f39c12",
};

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
