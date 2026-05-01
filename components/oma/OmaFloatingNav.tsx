import React, { useContext, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Href, useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { omaTypography } from "@/utils/typography";

type NavItem = {
  activeIcon: keyof typeof Ionicons.glyphMap;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: Href;
  segments: string[];
};

const navItems: NavItem[] = [
  {
    icon: "albums-outline",
    activeIcon: "albums-outline",
    label: "Home",
    route: "/(app)/main",
    segments: ["main"],
  },
  {
    icon: "cube-outline",
    activeIcon: "cube",
    label: "Orders",
    route: "/(app)/my-orders",
    segments: ["my-orders", "process-orders", "order-details", "products"],
  },
  {
    icon: "people-outline",
    activeIcon: "people",
    label: "Clients",
    route: "/(app)/customers",
    segments: ["customers", "customer-summary"],
  },
  {
    icon: "cash-outline",
    activeIcon: "cash-outline",
    label: "Approvals",
    route: "/(app)/order-approval",
    segments: ["order-approval"],
  },
];

const floatingNavRoutes = new Set([
  "main",
  "my-orders",
  "process-orders",
  "order-approval",
  "customer-summary",
  "customers",
  "products",
]);

export const FLOATING_NAV_SPACE = 188;

export default function OmaFloatingNav() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { isDark } = useContext(ThemeContext);
  const leaf = segments[segments.length - 1];
  const group = segments[0];

  const showFloatingNav =
    group === "(app)" && typeof leaf === "string" && floatingNavRoutes.has(leaf);

  const mutedText = isDark
    ? "rgba(255,255,255,0.58)"
    : "rgba(255,255,255,0.66)";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 22),
          alignItems: "center",
          paddingHorizontal: 20,
          pointerEvents: "box-none",
        },
        row: {
          width: "100%",
          maxWidth: 374,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 10,
        },
        shell: {
          flex: 1,
          borderRadius: 32,
          overflow: "hidden",
        },
        shellBlur: {
          ...StyleSheet.absoluteFillObject,
        },
        shellCard: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(44,44,46,0.9)",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 14,
        },
        itemButton: {
          minWidth: 64,
          height: 56,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 10,
        },
        itemButtonActive: {
          backgroundColor: "rgba(255,255,255,0.14)",
        },
        itemLabel: {
          marginTop: 3,
          color: mutedText,
          fontSize: 10,
          fontFamily: omaTypography.bold,
        },
        itemLabelActive: {
          color: "#ffffff",
        },
        ctaButton: {
          width: 72,
          height: 72,
          borderRadius: 36,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          shadowColor: "#ffffff",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.16,
          shadowRadius: 22,
          elevation: 16,
        },
      }),
    [insets.bottom, mutedText]
  );

  if (!showFloatingNav) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.shell}>
          <BlurView
            intensity={78}
            style={styles.shellBlur}
            tint={isDark ? "dark" : "light"}
          />

          <View style={styles.shellCard}>
            {navItems.map((item) => {
              const isActive = item.segments.includes(String(leaf));
              const iconName = isActive ? item.activeIcon : item.icon;

              return (
                <Pressable
                  key={item.label}
                  android_ripple={{
                    color: "rgba(255,255,255,0.08)",
                    borderless: false,
                  }}
                  onPress={() => router.push(item.route)}
                  style={[
                    styles.itemButton,
                    isActive && styles.itemButtonActive,
                  ]}
                >
                  <Ionicons
                    color={isActive ? "#ffffff" : mutedText}
                    name={iconName}
                    size={22}
                    strokeWidth={1.8}
                  />
                  <Text
                    style={[
                      styles.itemLabel,
                      isActive && styles.itemLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          android_ripple={{ color: "rgba(17,17,17,0.08)", borderless: true }}
          onPress={() => router.push("/(app)/new-order")}
          style={styles.ctaButton}
        >
          <Ionicons color="#111111" name="add" size={32} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
