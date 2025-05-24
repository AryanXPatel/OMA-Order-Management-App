import { useEffect } from "react";
import { fetchWithRetry } from "./utils/apiManager";
import { Stack } from "expo-router";
import { ThemeProvider } from "./context/ThemeContext";
import { FeedbackProvider } from "./context/FeedbackContext";
import { Dimensions, useWindowDimensions } from "react-native";

import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useContext } from "react";
import { ThemeContext } from "./context/ThemeContext";
import { View } from "react-native";

// Add dimension change listener
Dimensions.addEventListener("change", ({ window }) => {
  // This will fire when orientation changes
  // You can use this to update your global state if needed
});
function RootLayoutNav() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  useEffect(() => {
    const warmUpAPI = async () => {
      try {
        console.log("Pre-warming API...");
        // Make a simple request to wake up the server - replace with any endpoint that exists
        await fetchWithRetry(
          "https://oma-demo-server.onrender.com/api/sheets/warmup",
          {},
          2,
          2000
        ).catch(() =>
          console.log("API warming failed, will retry on first data request")
        );
        console.log("API pre-warming complete");
      } catch (error) {
        console.log("API pre-warming failed, will retry on first data request");
      }
    };

    warmUpAPI();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? "#1a1a1a" : "#ffffff" }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
          },
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <RootLayoutNav />
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
