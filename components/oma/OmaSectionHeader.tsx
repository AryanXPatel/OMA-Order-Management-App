import React, { useContext, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { omaTypography } from "@/utils/typography";

type OmaSectionHeaderProps = {
  actionLabel?: string;
  onActionPress?: () => void;
  title: string;
};

export default function OmaSectionHeader({
  actionLabel,
  onActionPress,
  title,
}: OmaSectionHeaderProps) {
  const { colors, isDark } = useContext(ThemeContext);
  const subtleColor = isDark ? colors.textSecondary : "rgba(255,255,255,0.62)";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 16,
        },
        titleWrap: {
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
        },
        title: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 18,
          letterSpacing: -0.4,
        },
        action: {
          alignItems: "center",
          flexDirection: "row",
          gap: 6,
        },
        actionLabel: {
          color: subtleColor,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
      }),
    [subtleColor]
  );

  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        <AppIcon color={subtleColor} name="chevron-forward" size={16} />
      </View>

      {actionLabel ? (
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!onActionPress}
          onPress={onActionPress}
          style={styles.action}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <AppIcon
            color={subtleColor}
            name="ellipsis-horizontal"
            size={16}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
