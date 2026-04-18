import React, { useContext, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Href, useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { omaTypography } from "@/utils/typography";

type NavItem = {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: Href;
  segment: string;
};

const navItems: NavItem[] = [
  {
    icon: "home-outline",
    activeIcon: "home",
    label: "Home",
    route: "/(app)/main",
    segment: "main",
  },
  {
    icon: "clipboard-outline",
    activeIcon: "clipboard",
    label: "Process",
    route: "/(app)/process-orders",
    segment: "process-orders",
  },
  {
    icon: "cube-outline",
    activeIcon: "cube",
    label: "Catalog",
    route: "/(app)/products",
    segment: "products",
  },
  {
    icon: "add",
    activeIcon: "add",
    label: "New",
    route: "/(app)/new-order",
    segment: "new-order",
  },
  {
    icon: "people-outline",
    activeIcon: "people",
    label: "Clients",
    route: "/(app)/customers",
    segment: "customers",
  },
  {
    icon: "stats-chart-outline",
    activeIcon: "stats-chart",
    label: "Stats",
    route: "/(app)/analytics",
    segment: "analytics",
  },
];

const floatingNavRoutes = new Set([
  "main",
  "process-orders",
  "products",
  "new-order",
  "customers",
  "my-orders",
  "analytics",
  "order-approval",
  "customer-summary",
]);

export const FLOATING_NAV_SPACE = 120;

export default function OmaFloatingNav() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { theme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const group = segments[0];
  const leaf = segments[segments.length - 1];

  const showFloatingNav =
    group === "(app)" && typeof leaf === "string" && floatingNavRoutes.has(leaf);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 12),
          alignItems: "center",
          paddingHorizontal: 16,
        },
        shell: {
          width: "100%",
          maxWidth: 420,
          borderRadius: 30,
          paddingHorizontal: 10,
          paddingVertical: 9,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.navBg,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: isDark ? "#000000" : colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: isDark ? 0.35 : 1,
          shadowRadius: isDark ? 24 : 30,
          elevation: 18,
        },
        activeItem: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 22,
          paddingHorizontal: 13,
          paddingVertical: 11,
          backgroundColor: colors.navActive,
        },
        activeIconBubble: {
          width: 22,
          height: 22,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.background : "#ffffff",
        },
        activeLabel: {
          color: isDark ? colors.background : "#ffffff",
          fontSize: 12,
          fontFamily: omaTypography.bold,
          letterSpacing: 0.2,
        },
        itemButton: {
          width: 40,
          height: 40,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
        },
      }),
    [colors, insets.bottom, isDark]
  );

  if (!showFloatingNav) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.shell}>
        {navItems.map((item) => {
          const isActive = item.segment === leaf;
          const iconName = isActive ? item.activeIcon : item.icon;

          if (isActive) {
            return (
              <View key={item.segment} style={styles.activeItem}>
                <View style={styles.activeIconBubble}>
                  <Ionicons
                    color={isDark ? colors.text : "#111111"}
                    name={iconName}
                    size={13}
                  />
                </View>
                <Text style={styles.activeLabel}>{item.label}</Text>
              </View>
            );
          }

          return (
            <Pressable
              key={item.segment}
              android_ripple={{ color: "rgba(0,102,255,0.12)", borderless: true }}
              onPress={() => router.push(item.route)}
              style={styles.itemButton}
            >
              <Ionicons color={colors.textSecondary} name={iconName} size={20} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


