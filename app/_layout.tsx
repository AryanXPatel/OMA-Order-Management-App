import { useEffect } from "react";
import { wakeUpServer } from "@/utils/apiManager";
import { Stack } from "expo-router";
import { ThemeProvider } from "@/context/ThemeContext";
import { FeedbackProvider } from "@/context/FeedbackContext";
import { View } from "react-native";
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
import OmaFloatingNav from "@/components/oma/OmaFloatingNav";

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
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.appChrome,
        flex: 1,
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={{
          backgroundColor: colors.appChrome,
          flex: 1,
          width: "100%",
        }}
      >
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



