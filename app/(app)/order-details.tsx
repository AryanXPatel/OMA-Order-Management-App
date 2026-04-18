import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { router } from "expo-router";
import {
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useFeedback } from "@/context/FeedbackContext";
import { ThemeContext } from "@/context/ThemeContext";
import { omaTypography } from "@/utils/typography";
import { APP_VERSION } from "@/utils/appConfig";

type DetailTab = "details" | "logistics" | "notes";

type OrderLineItem = {
  productName: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  actualRowIndex: number;
  approved: string;
  rejected: boolean;
  dispatched: boolean;
  comments: string;
  dispatchTime: string;
};

type SelectedOrder = {
  orderId: string;
  date: string;
  customerName: string;
  user: string;
  source: string;
  items: OrderLineItem[];
  totalAmount: number;
  status: "pending" | "approved" | "rejected" | "dispatched";
  orderComments: string;
  managerComments: string;
  dispatchComments: string;
};

type NoteEntry = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
};

type TimelineEntry = {
  id: string;
  title: string;
  timeLabel: string;
  meta: string;
  state: "complete" | "pending" | "rejected";
};

type StatusPresentation = {
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const STATUS_PRESENTATION: Record<SelectedOrder["status"], StatusPresentation> = {
  pending: {
    label: "Pending review",
    shortLabel: "Pending",
    icon: "hourglass-outline",
    color: "#f59e0b",
  },
  approved: {
    label: "Approved for dispatch",
    shortLabel: "Approved",
    icon: "checkmark-circle-outline",
    color: "#0066FF",
  },
  rejected: {
    label: "Rejected in review",
    shortLabel: "Rejected",
    icon: "close-circle-outline",
    color: "#ef4444",
  },
  dispatched: {
    label: "Dispatched to customer",
    shortLabel: "Dispatched",
    icon: "paper-plane-outline",
    color: "#22c55e",
  },
};

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatIndianCurrency = (value: number) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
};

const formatDateLabel = (value: string) => {
  if (!value) {
    return "Unknown date";
  }

  const [datePart] = value.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);

  if (!day || !month || !year) {
    return value;
  }

  return `${day} ${monthLabels[month - 1]} ${year}`;
};

const formatDateTimeLabel = (value: string) => {
  if (!value) {
    return "Unknown time";
  }

  const [datePart, timePart = "", meridiem = ""] = value.trim().split(/\s+/);
  const [day, month, year] = datePart.split("/").map(Number);

  if (!day || !month || !year) {
    return value;
  }

  const displayDate = `${day} ${monthLabels[month - 1]} ${year}`;
  if (!timePart) {
    return displayDate;
  }

  return `${displayDate}, ${timePart}${meridiem ? ` ${meridiem}` : ""}`;
};

const getSourceLabel = (source: string) => {
  switch ((source || "").trim().toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "Phone";
    case "email":
      return "Email";
    default:
      return source || "App";
  }
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export default function OrderDetailsScreen() {
  const { colors, theme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeSurfaceColor = colors.navActive;
  const activeContentColor = isDark ? colors.background : colors.card;
  const activeAccentMuted = hexToRgba(activeContentColor, isDark ? 0.12 : 0.16);

  const [order, setOrder] = useState<SelectedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>("details");

  const shellWidth = Math.min(width - 32, 460);

  useEffect(() => {
    const loadOrderDetails = async () => {
      try {
        const storedOrder = await AsyncStorage.getItem("selectedOrder");

        if (!storedOrder) {
          showFeedback({
            type: "error",
            title: "Order not found",
            message: "The selected order could not be loaded.",
            actionText: "Go Back",
            onAction: () => router.back(),
            autoDismiss: false,
          });
          return;
        }

        setOrder(JSON.parse(storedOrder));
      } catch (error) {
        console.error("Failed to load order details", error);
        showFeedback({
          type: "error",
          title: "Data load error",
          message: "Could not load order details. Please try again.",
          actionText: "Go Back",
          onAction: () => router.back(),
          autoDismiss: false,
        });
      } finally {
        setLoading(false);
      }
    };

    loadOrderDetails();
  }, [showFeedback]);

  const shareOrder = useCallback(async () => {
    if (!order) {
      return;
    }

    const status = STATUS_PRESENTATION[order.status];

    let message = `ORDER ${order.orderId}\n`;
    message += `Customer: ${order.customerName}\n`;
    message += `Date: ${formatDateTimeLabel(order.date)}\n`;
    message += `Status: ${status.label}\n`;
    message += `Source: ${getSourceLabel(order.source)}\n`;
    message += `Created by: ${order.user || "User"}\n\n`;

    if (order.orderComments || order.managerComments || order.dispatchComments) {
      message += "NOTES\n";
      if (order.orderComments) {
        message += `- O.NOTE: ${order.orderComments}\n`;
      }
      if (order.managerComments) {
        message += `- M.NOTE: ${order.managerComments}\n`;
      }
      if (order.dispatchComments) {
        message += `- D.NOTE: ${order.dispatchComments}\n`;
      }
      message += "\n";
    }

    message += "LINE ITEMS\n";
    order.items.forEach((item, index) => {
      const itemStatus = item.dispatched
        ? "Dispatched"
        : item.approved === "Y"
        ? "Approved"
        : item.approved === "N"
        ? "Rejected"
        : "Pending";

      message += `${index + 1}. ${item.productName}\n`;
      message += `   Qty: ${item.quantity} ${item.unit}\n`;
      message += `   Rate: Rs ${item.rate}\n`;
      message += `   Amount: Rs ${item.amount}\n`;
      message += `   Status: ${itemStatus}\n`;

      if (item.dispatchTime) {
        message += `   Dispatch time: ${item.dispatchTime}\n`;
      }

      if (item.comments) {
        message += `   Note: ${item.comments}\n`;
      }

      message += "\n";
    });

    message += `Total: Rs ${formatIndianCurrency(order.totalAmount)}\n`;
    message += `Order Management App v${APP_VERSION}`;

    try {
      await Share.share({
        title: `Order ${order.orderId}`,
        message,
      });
    } catch {
      showFeedback({
        type: "error",
        title: "Share failed",
        message: "Could not share order details from this device.",
        autoDismiss: true,
      });
    }
  }, [order, showFeedback]);

  const notes = useMemo<NoteEntry[]>(() => {
    if (!order) {
      return [];
    }

    return [
      {
        id: "order-note",
        label: "O.NOTE",
        icon: "document-text-outline",
        text: order.orderComments,
      },
      {
        id: "manager-note",
        label: "M.NOTE",
        icon: "chatbubble-ellipses-outline",
        text: order.managerComments,
      },
      {
        id: "dispatch-note",
        label: "D.NOTE",
        icon: "paper-plane-outline",
        text: order.dispatchComments,
      },
    ].filter((entry) => entry.text);
  }, [order]);

  const lineItemNotes = useMemo(
    () =>
      (order?.items || [])
        .filter((item) => item.comments)
        .map((item, index) => ({
          id: `line-note-${item.actualRowIndex || index}`,
          title: item.productName,
          text: item.comments,
          dispatchTime: item.dispatchTime,
        })),
    [order]
  );

  const dispatchedCount = useMemo(
    () => (order?.items || []).filter((item) => item.dispatched).length,
    [order]
  );

  const approvedCount = useMemo(
    () => (order?.items || []).filter((item) => item.approved === "Y").length,
    [order]
  );

  const firstDispatchTime = useMemo(
    () => order?.items.find((item) => item.dispatchTime)?.dispatchTime || "",
    [order]
  );

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (!order) {
      return [];
    }

    const dispatchSummary =
      dispatchedCount > 0
        ? `${dispatchedCount}/${order.items.length} line items dispatched`
        : "No dispatch activity recorded yet";

    return [
      {
        id: "submitted",
        title: "Order submitted",
        timeLabel: formatDateTimeLabel(order.date),
        meta: `${order.items.length} line items created for ${order.customerName}`,
        state: "complete",
      },
      {
        id: "review",
        title:
          order.status === "rejected"
            ? "Manager rejected the order"
            : order.status === "pending"
            ? "Manager review pending"
            : "Manager approved the order",
        timeLabel:
          order.status === "pending"
            ? "Awaiting review"
            : order.managerComments
            ? "Manager note available"
            : STATUS_PRESENTATION[order.status].shortLabel,
        meta:
          order.managerComments ||
          (order.status === "pending"
            ? "Approval notes will appear here once the order is reviewed."
            : `${approvedCount}/${order.items.length} line items approved`),
        state:
          order.status === "pending"
            ? "pending"
            : order.status === "rejected"
            ? "rejected"
            : "complete",
      },
      {
        id: "dispatch",
        title:
          order.status === "rejected" && dispatchedCount === 0
            ? "Dispatch stopped"
            : dispatchedCount === 0
            ? "Pending dispatch"
            : dispatchedCount === order.items.length
            ? "Order dispatched"
            : "Dispatch in progress",
        timeLabel:
          firstDispatchTime ||
          (dispatchedCount > 0 ? dispatchSummary : "Not dispatched yet"),
        meta:
          order.dispatchComments ||
          (order.status === "rejected"
            ? "The order was closed before dispatch could begin."
            : dispatchSummary),
        state:
          order.status === "rejected" && dispatchedCount === 0
            ? "rejected"
            : dispatchedCount > 0
            ? "complete"
            : "pending",
      },
      {
        id: "complete",
        title:
          order.status === "dispatched"
            ? "Order completed"
            : order.status === "rejected"
            ? "Order closed"
            : "Completion pending",
        timeLabel:
          order.status === "dispatched"
            ? "Ready for customer delivery"
            : order.status === "rejected"
            ? "Closed in review"
            : "Waiting for fulfillment",
        meta:
          order.status === "dispatched"
            ? `${order.items.length} line items moved through dispatch`
            : order.status === "rejected"
            ? "Rejection kept the order from moving forward."
            : "This stage will update when dispatch is fully recorded.",
        state:
          order.status === "dispatched"
            ? "complete"
            : order.status === "rejected"
            ? "rejected"
            : "pending",
      },
    ];
  }, [approvedCount, dispatchedCount, firstDispatchTime, order]);

  const noteCount = notes.length + lineItemNotes.length;
  const status = order ? STATUS_PRESENTATION[order.status] : null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 300,
          backgroundColor: isDark ? "rgba(0,102,255,0.08)" : "#eef2f6",
        },
        headerShell: {
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        iconButton: {
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 22,
          elevation: 8,
        },
        headerTitleWrap: {
          flex: 1,
          alignItems: "center",
          paddingHorizontal: 12,
        },
        headerEyebrow: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 3,
        },
        headerTitle: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.extrabold,
        },
        scrollContent: {
          paddingBottom: 34,
        },
        heroShell: {
          alignSelf: "center",
          paddingTop: 6,
        },
        heroCard: {
          overflow: "hidden",
          borderRadius: 30,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 32,
          elevation: 12,
        },
        heroGlow: {
          position: "absolute",
          top: -48,
          right: -28,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: status
            ? hexToRgba(status.color, isDark ? 0.16 : 0.12)
            : colors.cardMuted,
        },
        heroTopRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        },
        heroStatusPill: {
          borderRadius: 17,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        heroStatusText: {
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        heroEyebrow: {
          color: colors.textSecondary,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 6,
        },
        heroOrderId: {
          color: colors.text,
          fontSize: 24,
          letterSpacing: -0.9,
          fontFamily: omaTypography.extrabold,
        },
        heroCustomer: {
          color: colors.text,
          fontSize: 18,
          lineHeight: 24,
          fontFamily: omaTypography.extrabold,
          marginTop: 10,
          marginBottom: 12,
        },
        heroTotal: {
          color: colors.text,
          fontSize: 36,
          letterSpacing: -1.8,
          fontFamily: omaTypography.extrabold,
        },
        heroSubtext: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        heroMetaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 18,
        },
        heroMetaPill: {
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: colors.cardMuted,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        heroMetaText: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        stickyTabsShell: {
          backgroundColor: colors.background,
          paddingTop: 14,
          paddingBottom: 10,
        },
        tabsCard: {
          alignSelf: "center",
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 6,
          flexDirection: "row",
          gap: 6,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 10,
        },
        tabButton: {
          flex: 1,
          minHeight: 48,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        activeTabButton: {
          backgroundColor: activeSurfaceColor,
        },
        tabText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        activeTabText: {
          color: activeContentColor,
        },
        tabCountBubble: {
          minWidth: 20,
          height: 20,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.cardMuted,
        },
        activeTabCountBubble: {
          backgroundColor: activeAccentMuted,
        },
        tabCountText: {
          color: colors.text,
          fontSize: 10,
          fontFamily: omaTypography.extrabold,
        },
        activeTabCountText: {
          color: activeContentColor,
        },
        contentShell: {
          alignSelf: "center",
          gap: 16,
        },
        sectionCard: {
          borderRadius: 28,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 10,
        },
        sectionTitle: {
          color: colors.text,
          fontSize: 17,
          fontFamily: omaTypography.extrabold,
          marginBottom: 14,
        },
        infoGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 14,
        },
        infoCell: {
          width: "48%",
        },
        infoLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        infoValue: {
          color: colors.text,
          fontSize: 14,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
        },
        itemCard: {
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 12,
        },
        itemTopRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        },
        itemName: {
          color: colors.text,
          fontSize: 15,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
        },
        itemSubline: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        itemStatusPill: {
          borderRadius: 14,
          borderWidth: 1,
          paddingHorizontal: 10,
          paddingVertical: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
        },
        itemStatusText: {
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        itemMetricsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        },
        itemMetric: {
          flex: 1,
        },
        itemMetricLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        itemMetricValue: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.extrabold,
        },
        itemNote: {
          marginTop: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 12,
        },
        itemNoteText: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
        },
        totalRow: {
          marginTop: 4,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        totalLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
        },
        totalValue: {
          color: colors.text,
          fontSize: 22,
          letterSpacing: -0.8,
          fontFamily: omaTypography.extrabold,
        },
        logisticsAccentCard: {
          overflow: "hidden",
          borderRadius: 28,
          backgroundColor: "#111111",
          padding: 20,
        },
        logisticsGlow: {
          position: "absolute",
          top: -40,
          right: -10,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: status ? hexToRgba(status.color, 0.24) : "rgba(255,255,255,0.08)",
        },
        logisticsEyebrow: {
          color: "rgba(255,255,255,0.62)",
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 8,
        },
        logisticsTitle: {
          color: "#ffffff",
          fontSize: 22,
          letterSpacing: -0.8,
          fontFamily: omaTypography.extrabold,
        },
        logisticsBody: {
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
          marginTop: 8,
          marginBottom: 16,
        },
        logisticsStatsRow: {
          flexDirection: "row",
          gap: 10,
        },
        logisticsStatCard: {
          flex: 1,
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.08)",
          padding: 14,
        },
        logisticsStatLabel: {
          color: "rgba(255,255,255,0.62)",
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 6,
        },
        logisticsStatValue: {
          color: "#ffffff",
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        timelineItem: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 18,
        },
        timelineDotWrap: {
          width: 26,
          alignItems: "center",
        },
        timelineLine: {
          width: 2,
          flex: 1,
          marginTop: 6,
          backgroundColor: colors.border,
        },
        timelineDot: {
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          alignItems: "center",
          justifyContent: "center",
        },
        timelineContent: {
          flex: 1,
          paddingTop: 1,
        },
        timelineTitle: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
          marginBottom: 3,
        },
        timelineTime: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        },
        timelineMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
        },
        noteCard: {
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        noteHeader: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        },
        noteLabel: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.extrabold,
        },
        noteBody: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
        },
        emptyState: {
          alignSelf: "center",
          borderRadius: 28,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 24,
          paddingVertical: 30,
          alignItems: "center",
          marginTop: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 10,
        },
        emptyTitle: {
          color: colors.text,
          fontSize: 17,
          fontFamily: omaTypography.extrabold,
          marginTop: 14,
          marginBottom: 6,
        },
        emptyBody: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
          textAlign: "center",
        },
      }),
    [
      activeAccentMuted,
      activeContentColor,
      activeSurfaceColor,
      colors,
      insets.top,
      isDark,
      status,
    ]
  );

  const renderDetailsTab = () => {
    if (!order || !status) {
      return null;
    }

    return (
      <View style={[styles.contentShell, { width: shellWidth }]}>
        <View style={[styles.sectionCard, { width: shellWidth }]}>
          <Text style={styles.sectionTitle}>Order summary</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Customer</Text>
              <Text style={styles.infoValue}>{order.customerName}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>{formatDateLabel(order.date)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Source</Text>
              <Text style={styles.infoValue}>{getSourceLabel(order.source)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Submitted by</Text>
              <Text style={styles.infoValue}>{order.user || "User"}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Line items</Text>
              <Text style={styles.infoValue}>{order.items.length}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Order status</Text>
              <Text style={styles.infoValue}>{status.shortLabel}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.sectionCard, { width: shellWidth }]}>
          <Text style={styles.sectionTitle}>Line items</Text>

          {order.items.map((item, index) => {
            const itemStatus = item.dispatched
              ? STATUS_PRESENTATION.dispatched
              : item.approved === "Y"
              ? STATUS_PRESENTATION.approved
              : item.approved === "N"
              ? STATUS_PRESENTATION.rejected
              : STATUS_PRESENTATION.pending;

            return (
              <View key={`${item.actualRowIndex}-${index}`} style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.productName}</Text>
                    <Text style={styles.itemSubline}>
                      Qty {item.quantity} {item.unit} x Rs {item.rate}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.itemStatusPill,
                      {
                        backgroundColor: hexToRgba(
                          itemStatus.color,
                          isDark ? 0.16 : 0.1
                        ),
                        borderColor: hexToRgba(itemStatus.color, 0.18),
                      },
                    ]}
                  >
                    <Ionicons color={itemStatus.color} name={itemStatus.icon} size={14} />
                    <Text style={[styles.itemStatusText, { color: itemStatus.color }]}>
                      {itemStatus.shortLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemMetricsRow}>
                  <View style={styles.itemMetric}>
                    <Text style={styles.itemMetricLabel}>Amount</Text>
                    <Text style={styles.itemMetricValue}>Rs {item.amount}</Text>
                  </View>
                  <View style={styles.itemMetric}>
                    <Text style={styles.itemMetricLabel}>Dispatch</Text>
                    <Text style={styles.itemMetricValue}>
                      {item.dispatchTime || (item.dispatched ? "Recorded" : "Pending")}
                    </Text>
                  </View>
                </View>

                {item.comments ? (
                  <View style={styles.itemNote}>
                    <Text style={styles.itemNoteText}>{item.comments}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Order total</Text>
            <Text style={styles.totalValue}>Rs {formatIndianCurrency(order.totalAmount)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderLogisticsTab = () => {
    if (!order || !status) {
      return null;
    }

    return (
      <View style={[styles.contentShell, { width: shellWidth }]}>
        <View style={[styles.logisticsAccentCard, { width: shellWidth }]}>
          <View style={styles.logisticsGlow} />
          <Text style={styles.logisticsEyebrow}>Shipment readiness</Text>
          <Text style={styles.logisticsTitle}>{status.label}</Text>
          <Text style={styles.logisticsBody}>
            Track approval, dispatch movement, and fulfillment notes from the live
            OMA order record.
          </Text>

          <View style={styles.logisticsStatsRow}>
            <View style={styles.logisticsStatCard}>
              <Text style={styles.logisticsStatLabel}>Approved</Text>
              <Text style={styles.logisticsStatValue}>
                {approvedCount}/{order.items.length}
              </Text>
            </View>
            <View style={styles.logisticsStatCard}>
              <Text style={styles.logisticsStatLabel}>Dispatched</Text>
              <Text style={styles.logisticsStatValue}>
                {dispatchedCount}/{order.items.length}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.sectionCard, { width: shellWidth }]}>
          <Text style={styles.sectionTitle}>Execution timeline</Text>

          {timelineEntries.map((entry, index) => {
            const dotColor =
              entry.state === "rejected"
                ? STATUS_PRESENTATION.rejected.color
                : entry.state === "complete"
                ? status.color
                : colors.cardMuted;

            return (
              <View key={entry.id} style={styles.timelineItem}>
                <View style={styles.timelineDotWrap}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor:
                          entry.state === "complete" || entry.state === "rejected"
                            ? dotColor
                            : colors.card,
                        borderColor:
                          entry.state === "pending" ? colors.border : dotColor,
                      },
                    ]}
                  >
                    {entry.state === "complete" || entry.state === "rejected" ? (
                      <Ionicons color="#ffffff" name="checkmark" size={10} />
                    ) : (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: colors.textSecondary,
                        }}
                      />
                    )}
                  </View>

                  {index < timelineEntries.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>

                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>{entry.title}</Text>
                  <Text style={styles.timelineTime}>{entry.timeLabel}</Text>
                  <Text style={styles.timelineMeta}>{entry.meta}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderNotesTab = () => {
    const hasNotes = noteCount > 0;

    if (!hasNotes) {
      return (
        <View style={[styles.emptyState, { width: shellWidth }]}>
          <Ionicons
            color={colors.textSecondary}
            name="chatbubble-ellipses-outline"
            size={34}
          />
          <Text style={styles.emptyTitle}>No notes on this order.</Text>
          <Text style={styles.emptyBody}>
            Order, manager, and dispatch comments will appear here when the backend
            has recorded them.
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.contentShell, { width: shellWidth }]}>
        {notes.map((note) => (
          <View key={note.id} style={[styles.noteCard, { width: shellWidth }]}>
            <View style={styles.noteHeader}>
              <Ionicons color={colors.primary} name={note.icon} size={18} />
              <Text style={styles.noteLabel}>{note.label}</Text>
            </View>
            <Text style={styles.noteBody}>{note.text}</Text>
          </View>
        ))}

        {lineItemNotes.map((note) => (
          <View key={note.id} style={[styles.noteCard, { width: shellWidth }]}>
            <View style={styles.noteHeader}>
              <Ionicons color={colors.primary} name="cube-outline" size={18} />
              <Text style={styles.noteLabel}>{note.title}</Text>
            </View>
            <Text style={styles.noteBody}>{note.text}</Text>
            {note.dispatchTime ? (
              <Text style={[styles.noteBody, { marginTop: 10 }]}>
                Dispatch time: {note.dispatchTime}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topGlow} />
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.headerShell}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons color={colors.text} name="arrow-back" size={20} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>Order history</Text>
            <Text style={styles.headerTitle}>Order details</Text>
          </View>
          <View style={styles.iconButton} />
        </View>
        <LoadingIndicator message="Loading order details..." />
      </View>
    );
  }

  if (!order || !status) {
    return (
      <View style={styles.container}>
        <View style={styles.topGlow} />
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.headerShell}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons color={colors.text} name="arrow-back" size={20} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>Order history</Text>
            <Text style={styles.headerTitle}>Order details</Text>
          </View>
          <View style={styles.iconButton} />
        </View>
        <View style={[styles.emptyState, { width: shellWidth }]}>
          <Ionicons color={colors.textSecondary} name="cloud-offline-outline" size={34} />
          <Text style={styles.emptyTitle}>Order details unavailable.</Text>
          <Text style={styles.emptyBody}>
            Return to order history and open the order again to reload the detail
            payload.
          </Text>
        </View>
      </View>
    );
  }

  const tabs: {
    id: DetailTab;
    label: string;
    count?: number;
  }[] = [
    { id: "details", label: "Summary" },
    { id: "logistics", label: "Logistics" },
    { id: "notes", label: "Notes", count: noteCount },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topGlow} />
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <View style={styles.headerShell}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons color={colors.text} name="arrow-back" size={20} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Order history</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {order.orderId}
          </Text>
        </View>

        <TouchableOpacity onPress={shareOrder} style={styles.iconButton}>
          <Ionicons color={colors.text} name="share-outline" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <View style={[styles.heroShell, { width: shellWidth }]}>
          <View style={[styles.heroCard, { width: shellWidth }]}>
            <View style={styles.heroGlow} />

            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroEyebrow}>Live order profile</Text>
                <Text style={styles.heroOrderId}>{order.orderId}</Text>
              </View>

              <View
                style={[
                  styles.heroStatusPill,
                  {
                    backgroundColor: hexToRgba(status.color, isDark ? 0.16 : 0.1),
                    borderColor: hexToRgba(status.color, 0.18),
                  },
                ]}
              >
                <Ionicons color={status.color} name={status.icon} size={14} />
                <Text style={[styles.heroStatusText, { color: status.color }]}>
                  {status.shortLabel}
                </Text>
              </View>
            </View>

            <Text style={styles.heroCustomer}>{order.customerName}</Text>
            <Text style={styles.heroTotal}>Rs {formatIndianCurrency(order.totalAmount)}</Text>
            <Text style={styles.heroSubtext}>
              {order.items.length} line items in this order history record.
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaPill}>
                <Ionicons color={colors.textSecondary} name="calendar-outline" size={14} />
                <Text style={styles.heroMetaText}>{formatDateLabel(order.date)}</Text>
              </View>
              <View style={styles.heroMetaPill}>
                <Ionicons color={colors.textSecondary} name="globe-outline" size={14} />
                <Text style={styles.heroMetaText}>{getSourceLabel(order.source)}</Text>
              </View>
              <View style={styles.heroMetaPill}>
                <Ionicons color={colors.textSecondary} name="paper-plane-outline" size={14} />
                <Text style={styles.heroMetaText}>
                  {dispatchedCount}/{order.items.length} dispatched
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.stickyTabsShell}>
          <View style={[styles.tabsCard, { width: shellWidth }]}>
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[styles.tabButton, isActive && styles.activeTabButton]}
                >
                  <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                    {tab.label}
                  </Text>
                  {typeof tab.count === "number" ? (
                    <View
                      style={[
                        styles.tabCountBubble,
                        isActive && styles.activeTabCountBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabCountText,
                          isActive && styles.activeTabCountText,
                        ]}
                      >
                        {tab.count}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {activeTab === "details"
          ? renderDetailsTab()
          : activeTab === "logistics"
          ? renderLogisticsTab()
          : renderNotesTab()}
      </ScrollView>
    </View>
  );
}


