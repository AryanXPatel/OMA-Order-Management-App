import React from "react";
import {
  Feather,
  Ionicons as ExpoIonicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";

type IconComponent =
  | typeof Feather
  | typeof ExpoIonicons
  | typeof MaterialIcons
  | typeof MaterialCommunityIcons;

type IconMapEntry = {
  component: IconComponent;
  iconName: string;
};

const iconMap = {
  add: { component: Feather, iconName: "plus" },
  "add-circle": { component: Feather, iconName: "plus-circle" },
  "add-circle-outline": { component: Feather, iconName: "plus-circle" },
  "albums-outline": { component: Feather, iconName: "layout" },
  "alert-circle-outline": { component: Feather, iconName: "alert-circle" },
  "apps-outline": { component: Feather, iconName: "grid" },
  "arrow-back": { component: Feather, iconName: "arrow-left" },
  "arrow-down-circle-outline": {
    component: Feather,
    iconName: "arrow-down-circle",
  },
  "arrow-forward": { component: Feather, iconName: "arrow-right" },
  "arrow-forward-outline": { component: Feather, iconName: "arrow-right" },
  "arrow-up-outline": { component: Feather, iconName: "arrow-up-right" },
  "barcode-outline": {
    component: MaterialCommunityIcons,
    iconName: "barcode",
  },
  "briefcase-outline": { component: Feather, iconName: "briefcase" },
  calendar: { component: Feather, iconName: "calendar" },
  "calendar-outline": { component: Feather, iconName: "calendar" },
  "call-outline": { component: Feather, iconName: "phone" },
  "cash-outline": { component: Feather, iconName: "dollar-sign" },
  "chatbubble-ellipses-outline": {
    component: Feather,
    iconName: "message-circle",
  },
  checkmark: { component: Feather, iconName: "check" },
  "checkmark-circle": { component: Feather, iconName: "check-circle" },
  "checkmark-circle-outline": {
    component: Feather,
    iconName: "check-circle",
  },
  "checkmark-done-circle-outline": {
    component: MaterialCommunityIcons,
    iconName: "check-decagram-outline",
  },
  "chevron-forward": { component: Feather, iconName: "chevron-right" },
  close: { component: Feather, iconName: "x" },
  "close-circle": { component: Feather, iconName: "x-circle" },
  "close-circle-outline": { component: Feather, iconName: "x-circle" },
  clipboard: { component: Feather, iconName: "clipboard" },
  "clipboard-outline": { component: Feather, iconName: "clipboard" },
  "cloud-offline-outline": { component: Feather, iconName: "cloud-off" },
  cube: { component: Feather, iconName: "box" },
  "cube-outline": { component: Feather, iconName: "box" },
  "document-text-outline": { component: Feather, iconName: "file-text" },
  "flash-outline": { component: Feather, iconName: "zap" },
  "git-compare-outline": {
    component: MaterialCommunityIcons,
    iconName: "compare-horizontal",
  },
  "globe-outline": { component: Feather, iconName: "globe" },
  home: { component: Feather, iconName: "home" },
  "home-outline": { component: Feather, iconName: "home" },
  "hourglass-outline": {
    component: MaterialCommunityIcons,
    iconName: "timer-sand",
  },
  "layers-outline": { component: Feather, iconName: "layers" },
  "location-outline": { component: Feather, iconName: "map-pin" },
  "lock-closed-outline": { component: Feather, iconName: "lock" },
  "log-out-outline": { component: Feather, iconName: "log-out" },
  "paper-plane-outline": { component: Feather, iconName: "send" },
  people: { component: Feather, iconName: "users" },
  "people-outline": { component: Feather, iconName: "users" },
  "person-outline": { component: Feather, iconName: "user" },
  "pricetag-outline": { component: Feather, iconName: "tag" },
  "pulse-outline": { component: Feather, iconName: "activity" },
  "receipt-outline": { component: Feather, iconName: "file-text" },
  remove: { component: Feather, iconName: "minus" },
  "scan-outline": {
    component: MaterialCommunityIcons,
    iconName: "qrcode-scan",
  },
  "search-outline": { component: Feather, iconName: "search" },
  "share-outline": { component: Feather, iconName: "share-2" },
  "shield-checkmark-outline": {
    component: MaterialCommunityIcons,
    iconName: "shield-check-outline",
  },
  "sparkles-outline": {
    component: MaterialCommunityIcons,
    iconName: "shimmer",
  },
  "stats-chart": { component: Feather, iconName: "bar-chart-2" },
  "stats-chart-outline": { component: Feather, iconName: "bar-chart-2" },
  time: { component: Feather, iconName: "clock" },
  "time-outline": { component: Feather, iconName: "clock" },
  "wallet-outline": {
    component: MaterialCommunityIcons,
    iconName: "wallet-outline",
  },
} as const satisfies Record<string, IconMapEntry>;

export type AppIconName = keyof typeof iconMap;

type AppIconProps = {
  absoluteStrokeWidth?: boolean;
  color?: string;
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  style?: unknown;
};

const fallbackIcon: IconMapEntry = {
  component: Feather,
  iconName: "alert-circle",
};

const AppIconComponent = ({ name, size = 24, color, style }: AppIconProps) => {
  const entry = iconMap[name] || fallbackIcon;
  const Component = entry.component;

  return (
    <Component
      color={color}
      name={entry.iconName}
      size={size}
      style={style as never}
    />
  );
};

export const AppIcon = Object.assign(AppIconComponent, {
  glyphMap: iconMap,
});

export default AppIcon;

