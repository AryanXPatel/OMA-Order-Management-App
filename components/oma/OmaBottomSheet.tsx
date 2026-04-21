import React, { useContext, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { omaTypography } from "@/utils/typography";

type OmaBottomSheetProps = {
  actionLabel?: string;
  children: React.ReactNode;
  maxHeight?: number | `${number}%`;
  onActionPress?: () => void;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
};

export default function OmaBottomSheet({
  actionLabel,
  children,
  maxHeight = "74%",
  onActionPress,
  onClose,
  subtitle,
  title,
  visible,
}: OmaBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useContext(ThemeContext);
  const subtleColor = isDark ? colors.textSecondary : "rgba(255,255,255,0.68)";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "flex-end",
        },
        shell: {
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
          maxHeight,
          overflow: "hidden",
        },
        fill: {
          ...StyleSheet.absoluteFillObject,
        },
        card: {
          backgroundColor: isDark ? "rgba(20,20,23,0.92)" : "rgba(12,16,24,0.9)",
          borderTopLeftRadius: 34,
          borderTopRightRadius: 34,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.glassStrong,
          paddingBottom: Math.max(insets.bottom, 16),
        },
        handleWrap: {
          alignItems: "center",
          paddingTop: 12,
        },
        handle: {
          backgroundColor: "rgba(255,255,255,0.18)",
          borderRadius: 999,
          height: 5,
          width: 54,
        },
        header: {
          alignItems: "flex-start",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 22,
          paddingTop: 16,
          paddingBottom: 18,
        },
        title: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 20,
          letterSpacing: -0.5,
          marginBottom: subtitle ? 4 : 0,
        },
        subtitle: {
          color: subtleColor,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          maxWidth: 260,
        },
        headerAction: {
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          paddingLeft: 16,
        },
        headerActionLabel: {
          color: colors.accentGold,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        closeButton: {
          alignItems: "center",
          backgroundColor: colors.glass,
          borderRadius: 18,
          height: 36,
          justifyContent: "center",
          width: 36,
        },
        content: {
          paddingHorizontal: 22,
          paddingBottom: 4,
        },
      }),
    [
      colors.accentGold,
      colors.glass,
      colors.glassStrong,
      colors.overlay,
      insets.bottom,
      isDark,
      maxHeight,
      subtleColor,
      subtitle,
    ]
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable style={styles.shell}>
          <BlurView
            intensity={48}
            style={styles.fill}
            tint={isDark ? "dark" : "light"}
          />
          <View style={styles.card}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>

              <View style={styles.headerAction}>
                {actionLabel ? (
                  <TouchableOpacity activeOpacity={0.8} onPress={onActionPress}>
                    <Text style={styles.headerActionLabel}>{actionLabel}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <AppIcon color="#ffffff" name="close" size={18} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
