import { useEffect } from "react";
import { wakeUpServer } from "@/utils/apiManager";
import { Stack } from "expo-router";
import { ThemeProvider } from "@/context/ThemeContext";
import { FeedbackProvider } from "@/context/FeedbackContext";
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
import { ThemeContext } from "@/context/ThemeContext";
import { View } from "react-native";
import OmaFloatingNav from "@/components/oma/OmaFloatingNav";

// Add dimension change listener
Dimensions.addEventListener("change", ({ window }) => {
  // This will fire when orientation changes
  // You can use this to update your global state if needed
});
function RootLayoutNav() {
  const { colors, isDark } = useContext(ThemeContext);

  useEffect(() => {
    const warmUpAPI = async () => {
      try {
        console.log("Pre-warming API...");
        await wakeUpServer();
        console.log("API pre-warming complete");
      } catch {
        console.log("API pre-warming failed, will retry on first data request");
      }
    };

    warmUpAPI();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.appChrome }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 260,
          backgroundColor: isDark ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.04)",
          opacity: 1,
          pointerEvents: "none",
        }}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.appChrome,
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



