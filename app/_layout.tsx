import { useEffect } from "react";
import { fetchWithRetry } from "./utils/apiManager";
import { Stack, useSegments } from "expo-router";
import { ThemeProvider } from "./context/ThemeContext";
import { FeedbackProvider } from "./context/FeedbackContext";
import { Dimensions } from "react-native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";

import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useContext } from "react";
import { ThemeContext } from "./context/ThemeContext";
import { View } from "react-native";
import OmaFloatingNav, {
  FLOATING_NAV_SPACE,
} from "./components/oma/OmaFloatingNav";

// Add dimension change listener
Dimensions.addEventListener("change", ({ window }) => {
  // This will fire when orientation changes
  // You can use this to update your global state if needed
});
function RootLayoutNav() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const segments = useSegments();
  const group = segments[0];
  const showFloatingNav = group === "(app)";

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
      } catch {
        console.log("API pre-warming failed, will retry on first data request");
      }
    };

    warmUpAPI();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? "#09111f" : "#f7f8f9" }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 260,
          backgroundColor: isDark ? "rgba(20, 33, 54, 0.45)" : "#eef2f6",
          opacity: isDark ? 0.6 : 1,
        }}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? "#09111f" : "#f7f8f9",
            paddingBottom: showFloatingNav ? FLOATING_NAV_SPACE : 0,
          },
        }}
      />
      <OmaFloatingNav />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

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
