import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Href, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import OmaBottomSheet from "@/components/oma/OmaBottomSheet";
import { ThemeContext } from "@/context/ThemeContext";
import type { AppColors } from "@/context/ThemeContext";
import { useFeedback } from "@/context/FeedbackContext";
import {
  apiCache,
  BACKEND_URL,
  fetchWithRetry,
  preloadData,
  wakeUpServer,
} from "@/utils/apiManager";
import { formatCompactOrderId } from "@/utils/orderDisplay";
import { omaTypography } from "@/utils/typography";

type OrderRow = {
  amount: string;
  approved: string;
  customerName: string;
  dispatchComments: string;
  dispatchTime: string;
  dispatched: string;
  managerComments: string;
  orderComments: string;
  orderId: string;
  orderTime: string;
  productName: string;
  quantity: string;
  rate: string;
  source: string;
  sysTime: string;
  unit: string;
  user: string;
};

type GroupedOrder = {
  approvedItems: number;
  createdAt: Date | null;
  customerName: string;
  dispatchedItems: number;
  itemCount: number;
  orderId: string;
  source: string;
  status: "pending" | "approved" | "rejected" | "dispatched";
  totalAmount: number;
  user: string;
};

type ActivityItem = {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  id: string;
  timeLabel: string;
  title: string;
};

type BackendActivityItem = {
  customer_name?: string;
  display_id?: string;
  entity_id?: string;
  event_id?: string;
  event_type?: string;
  message?: string;
  occurred_at?: string;
  severity?: string;
  title?: string;
};

type BackendActivityResponse = {
  activities?: BackendActivityItem[];
};

type DashboardPayload = {
  approvalOrders: GroupedOrder[];
  averageOrderValue: number;
  completedOrders: number;
  currentOrder: GroupedOrder | null;
  groupedOrders: GroupedOrder[];
  lastUpdatedAt: string;
  monthValue: number;
  openPipelineValue: number;
  pendingApprovals: number;
  pendingDeliveries: number;
  pendingDispatches: number;
  processingOrders: number;
  recentActivities: ActivityItem[];
  recentOrders: number;
  rejectedOrders: number;
  todayValue: number;
  totalCustomers: number;
};

type OverlayName = "notifications" | "profile" | null;

type NotificationItem = {
  body: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  route: Href;
  time: string;
  title: string;
};

const MAIN_NOTIFICATION_DISMISSED_KEY = "mainDismissedNotificationsV1";

const todayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  weekday: "short",
});

const parseIndianDate = (dateStr: string) => {
  if (!dateStr) {
    return null;
  }

  const [datePart, timePart = "", meridiem = ""] = dateStr.trim().split(/\s+/);
  const [day, month, year] = datePart.split("/").map(Number);

  if (!day || !month || !year) {
    const fallback = new Date(dateStr);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  let hours = 0;
  let minutes = 0;

  if (timePart.includes(":")) {
    const [hourPart, minutePart] = timePart.split(":").map(Number);
    hours = hourPart || 0;
    minutes = minutePart || 0;
  }

  const normalizedMeridiem = meridiem.toUpperCase();
  if (normalizedMeridiem === "PM" && hours < 12) {
    hours += 12;
  }
  if (normalizedMeridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatIndianCurrency = (value: number) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)}`;
  }
};

const formatTimeAgo = (date: Date | null) => {
  if (!date) {
    return "Unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const activityVisuals: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; iconColor: string }
> = {
  "approval.approved": {
    icon: "checkmark-circle-outline",
    iconColor: "#10B981",
  },
  "approval.rejected": {
    icon: "alert-circle-outline",
    iconColor: "#F87171",
  },
  "dispatch.completed": {
    icon: "paper-plane-outline",
    iconColor: "#10B981",
  },
  "invoice.issued": {
    icon: "receipt-outline",
    iconColor: "#60A5FA",
  },
  "ledger.invoice_posted": {
    icon: "receipt-outline",
    iconColor: "#60A5FA",
  },
  "ledger.payment_received": {
    icon: "cash-outline",
    iconColor: "#10B981",
  },
  "order.cancelled": {
    icon: "close-circle-outline",
    iconColor: "#F87171",
  },
  "order.created": {
    icon: "document-text-outline",
    iconColor: "#60A5FA",
  },
  "queue.attention": {
    icon: "alert-circle-outline",
    iconColor: "#FACC15",
  },
};

const getActivityVisual = (activity: BackendActivityItem) => {
  if (activity.event_type && activityVisuals[activity.event_type]) {
    return activityVisuals[activity.event_type];
  }

  if (activity.severity === "danger") {
    return { icon: "alert-circle-outline" as const, iconColor: "#F87171" };
  }
  if (activity.severity === "warning") {
    return { icon: "alert-circle-outline" as const, iconColor: "#FACC15" };
  }
  if (activity.severity === "success") {
    return { icon: "checkmark-circle-outline" as const, iconColor: "#10B981" };
  }

  return { icon: "pulse-outline" as const, iconColor: "#60A5FA" };
};

const normalizeBackendActivities = (
  activities: BackendActivityItem[] = []
): ActivityItem[] =>
  activities
    .filter((activity) => activity.event_id && activity.occurred_at)
    .map((activity) => {
      const visual = getActivityVisual(activity);
      const occurredAt = activity.occurred_at
        ? new Date(activity.occurred_at)
        : null;
      const validDate =
        occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null;
      const fallbackDescription = [
        activity.display_id || formatCompactOrderId(activity.entity_id),
        activity.customer_name,
      ]
        .filter(Boolean)
        .join(" for ");

      return {
        id: activity.event_id || `${activity.event_type}-${activity.entity_id}`,
        icon: visual.icon,
        iconColor: visual.iconColor,
        title: activity.title || "Recent activity",
        description:
          activity.message || fallbackDescription || "Latest OMA activity",
        timeLabel: formatTimeAgo(validDate),
      };
    });

const toNumber = (amount: string) => {
  const parsed = Number.parseFloat((amount || "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isSameDay = (a: Date | null, b: Date) => {
  if (!a) {
    return false;
  }

  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
};

const deriveOrderStatus = (rows: OrderRow[]) => {
  const anyRejected = rows.some(
    (row) => row.approved === "N" || row.approved === "R"
  );
  const allApproved = rows.every((row) => row.approved === "Y");
  const allDispatched = rows.every((row) => row.dispatched === "Y");

  if (anyRejected) {
    return "rejected" as const;
  }
  if (allDispatched) {
    return "dispatched" as const;
  }
  if (allApproved) {
    return "approved" as const;
  }
  return "pending" as const;
};

const buildDashboardPayload = (
  rows: OrderRow[],
  recentActivityOverride: ActivityItem[] = []
) => {
  const groupedOrderMap: Record<string, OrderRow[]> = {};
  const uniqueCustomers = new Set<string>();
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  rows.forEach((row) => {
    if (!row.orderId) {
      return;
    }

    groupedOrderMap[row.orderId] ??= [];
    groupedOrderMap[row.orderId].push(row);

    if (row.customerName) {
      uniqueCustomers.add(row.customerName);
    }
  });

  const groupedOrders: GroupedOrder[] = Object.entries(groupedOrderMap)
    .map(([orderId, orderRows]) => {
      const first = orderRows[0];

      return {
        orderId,
        customerName: first.customerName,
        user: first.user,
        source: first.source,
        createdAt: parseIndianDate(first.orderTime || first.sysTime),
        totalAmount: orderRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
        status: deriveOrderStatus(orderRows),
        approvedItems: orderRows.filter((row) => row.approved === "Y").length,
        dispatchedItems: orderRows.filter((row) => row.dispatched === "Y").length,
        itemCount: orderRows.length,
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  const recentOrders = groupedOrders.filter(
    (order) => order.createdAt && order.createdAt >= sevenDaysAgo
  ).length;
  const pendingApprovals = groupedOrders.filter(
    (order) => order.status === "pending" || order.status === "rejected"
  ).length;
  const pendingDispatches = groupedOrders.filter(
    (order) => order.status === "approved"
  ).length;
  const rejectedOrders = groupedOrders.filter(
    (order) => order.status === "rejected"
  ).length;
  const completedOrders = groupedOrders.filter(
    (order) => order.status === "approved" || order.status === "dispatched"
  ).length;
  const processingOrders = groupedOrders.filter(
    (order) => order.status === "approved"
  ).length;
  const pendingDeliveries = groupedOrders.filter(
    (order) => order.status !== "dispatched"
  ).length;
  const todayValue = groupedOrders
    .filter((order) => isSameDay(order.createdAt, now))
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const monthValue = groupedOrders
    .filter(
      (order) =>
        order.createdAt &&
        order.createdAt.getMonth() === now.getMonth() &&
        order.createdAt.getFullYear() === now.getFullYear()
    )
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const averageOrderValue =
    groupedOrders.length > 0
      ? groupedOrders.reduce((sum, order) => sum + order.totalAmount, 0) /
        groupedOrders.length
      : 0;
  const openPipelineValue = groupedOrders
    .filter((order) => order.status !== "dispatched")
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const recentActivities: ActivityItem[] = groupedOrders.slice(0, 5).map((order) => {
    let title = "New order submitted";
    let description = `${formatCompactOrderId(order.orderId)} for ${order.customerName}`;
    let icon: keyof typeof Ionicons.glyphMap = "document-text-outline";
    let iconColor = "#60A5FA";

    if (order.status === "approved") {
      title = "Order approved";
      description = `${order.customerName} is moving to dispatch`;
      icon = "checkmark-circle-outline";
      iconColor = "#10B981";
    } else if (order.status === "rejected") {
      title = "Order blocked";
      description = `${order.customerName} requires follow-up`;
      icon = "alert-circle-outline";
      iconColor = "#F87171";
    } else if (order.status === "dispatched") {
      title = "Order dispatched";
      description = `${order.customerName} moved to fulfillment`;
      icon = "paper-plane-outline";
      iconColor = "#10B981";
    }

    return {
      id: order.orderId,
      icon,
      iconColor,
      title,
      description,
      timeLabel: formatTimeAgo(order.createdAt),
    };
  });

  const currentOrder =
    groupedOrders.find(
      (order) => order.status === "approved" || order.status === "pending"
    ) ||
    groupedOrders.find((order) => order.status !== "dispatched") ||
    groupedOrders[0] ||
    null;

  return {
    approvalOrders: groupedOrders.filter(
      (order) => order.status === "pending" || order.status === "rejected"
    ),
    averageOrderValue,
    completedOrders,
    currentOrder,
    groupedOrders,
    lastUpdatedAt: new Date().toISOString(),
    monthValue,
    openPipelineValue,
    pendingApprovals,
    pendingDeliveries,
    pendingDispatches,
    processingOrders,
    recentActivities: recentActivityOverride.length
      ? recentActivityOverride
      : recentActivities,
    recentOrders,
    rejectedOrders,
    todayValue,
    totalCustomers: uniqueCustomers.size,
  };
};

const getApprovalMeta = (order: GroupedOrder, colors: AppColors) => {
  if (order.status === "rejected") {
    return {
      amountColor: colors.accentCoral,
      chipBg: "rgba(248,113,113,0.18)",
      chipColor: colors.accentCoral,
      description: "Requires manager follow-up",
      icon: "file-clock-outline" as const,
    };
  }

  return {
    amountColor: colors.accentGold,
    chipBg: "rgba(234,179,8,0.18)",
    chipColor: colors.accentGold,
    description: "Waiting approval",
    icon: "file-clock-outline" as const,
  };
};

function SectionHeading({
  actionLabel,
  icon,
  onActionPress,
  title,
}: {
  actionLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onActionPress?: () => void;
  title: string;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 16,
        paddingHorizontal: 4,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
        {icon ? (
          <Ionicons
            color="rgba(255,255,255,0.62)"
            name={icon}
            size={20}
            strokeWidth={2.5}
          />
        ) : null}
        <Text
          style={{
            color: "#ffffff",
            fontFamily: omaTypography.bold,
            fontSize: 22,
            letterSpacing: -0.6,
          }}
        >
          {title}
        </Text>
        <Ionicons color="#71717a" name="chevron-forward" size={22} strokeWidth={2.5} />
      </View>

      {actionLabel ? (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={onActionPress}
          style={{ alignItems: "center", flexDirection: "row", gap: 8 }}
        >
          <Text
            style={{
              color:
                actionLabel === "See all"
                  ? "rgba(255,255,255,0.62)"
                  : "#ffffff",
              fontFamily: omaTypography.semibold,
              fontSize: 14,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : (
        <Ionicons color="#52525b" name="ellipsis-horizontal" size={20} />
      )}
    </View>
  );
}

function RecentOrderCard({
  colors,
  onPress,
  order,
}: {
  colors: AppColors;
  onPress: () => void;
  order: GroupedOrder;
}) {
  const status =
    order.status === "approved"
      ? {
          color: colors.accentGreen,
          icon: "checkmark-circle-outline" as const,
          label: "Credit Approved",
        }
      : order.status === "rejected"
      ? {
          color: colors.accentCoral,
          icon: "alert-circle-outline" as const,
          label: "Needs Approval",
        }
      : {
          color: colors.accentSky,
          icon: "cube-outline" as const,
          label: "Processing Dispatch",
        };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.appChromeElevated,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.04)",
      marginRight: 14,
      padding: 20,
      width: 240,
    },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    badge: {
      backgroundColor: "rgba(39,39,42,0.5)",
      borderRadius: 6,
      color: "#a1a1aa",
      fontFamily: omaTypography.semibold,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 15,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    time: {
      color: "#71717a",
      fontFamily: omaTypography.medium,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 15,
      marginLeft: 8,
    },
    customer: {
      color: "#ffffff",
      fontFamily: omaTypography.semibold,
      fontSize: 18,
      letterSpacing: -0.5,
      lineHeight: 22,
      marginBottom: 4,
    },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      marginBottom: 18,
    },
    statusText: {
      fontFamily: omaTypography.semibold,
      fontSize: 13,
      includeFontPadding: false,
      letterSpacing: -0.3,
      lineHeight: 16,
    },
    metrics: {
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.04)",
      gap: 10,
      paddingTop: 12,
    },
    metricRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    metricLabel: {
      color: "#a1a1aa",
      fontFamily: omaTypography.medium,
      fontSize: 14,
      letterSpacing: -0.3,
    },
    metricValue: {
      color: "#ffffff",
      fontFamily: omaTypography.semibold,
      fontSize: 14,
      letterSpacing: -0.3,
    },
  });

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.badge}>
          {formatCompactOrderId(order.orderId)}
        </Text>
        <Text numberOfLines={1} style={styles.time}>
          {formatTimeAgo(order.createdAt)}
        </Text>
      </View>

      <Text ellipsizeMode="tail" numberOfLines={2} style={styles.customer}>
        {order.customerName}
      </Text>

      <View style={styles.statusRow}>
        <Ionicons color={status.color} name={status.icon} size={14} />
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.label}
        </Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Total Amount</Text>
          <Text style={styles.metricValue}>₹{formatIndianCurrency(order.totalAmount)}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Order Size</Text>
          <Text style={styles.metricValue}>
            {order.itemCount} Item{order.itemCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MainScreen() {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<
    string[]
  >([]);

  const displayName = userRole === "Manager" ? "Alex Carter" : "Sales Workspace";
  const displayRole = userRole === "Manager" ? "Owner" : "User";
  const isDesktop = width >= 900;
  const todayLabel = todayFormatter.format(new Date()).toUpperCase();

  useEffect(() => {
    let mounted = true;

    const loadDismissedNotifications = async () => {
      try {
        const storedIds = await AsyncStorage.getItem(
          MAIN_NOTIFICATION_DISMISSED_KEY
        );

        if (!storedIds || !mounted) {
          return;
        }

        const parsedIds = JSON.parse(storedIds);

        if (Array.isArray(parsedIds)) {
          setDismissedNotificationIds(
            parsedIds.filter((id): id is string => typeof id === "string")
          );
        }
      } catch {
        if (mounted) {
          setDismissedNotificationIds([]);
        }
      }
    };

    loadDismissedNotifications();

    return () => {
      mounted = false;
    };
  }, []);

  const persistDismissedNotifications = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    setDismissedNotificationIds(uniqueIds);

    try {
      await AsyncStorage.setItem(
        MAIN_NOTIFICATION_DISMISSED_KEY,
        JSON.stringify(uniqueIds)
      );
    } catch {
      // Local read state is non-critical; the dashboard data remains live.
    }
  }, []);

  const loadDashboard = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const storedRole = await AsyncStorage.getItem("userRole");

        if (!storedRole) {
          router.replace("/(auth)/login");
          return;
        }

        setUserRole(storedRole);

        const cachedPayload = apiCache.get("dashboardPayload");
        if (!forceRefresh && cachedPayload) {
          setPayload(cachedPayload);
          setLoading(false);
          return;
        }

        await wakeUpServer();
        await preloadData();

        const activityUrl = `${BACKEND_URL}/api/activity/recent?limit=5${
          forceRefresh ? "&refresh=1" : ""
        }`;
        const [orderResult, activityResult] = await Promise.allSettled([
          fetchWithRetry<{ values?: string[][] }>(
            `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
            {},
            2,
            1500
          ),
          fetchWithRetry<BackendActivityResponse>(activityUrl, {}, 1, 1000),
        ]);

        if (orderResult.status === "rejected") {
          throw orderResult.reason;
        }

        const response = orderResult.value;
        const backendActivities =
          activityResult.status === "fulfilled"
            ? normalizeBackendActivities(activityResult.value.data?.activities)
            : [];

        const rows: OrderRow[] = (response.data?.values || []).map((row: string[]) => ({
          sysTime: row[0] || "",
          orderTime: row[1] || "",
          user: row[2] || "",
          orderComments: row[3] || "",
          customerName: row[4] || "",
          orderId: row[5] || "",
          productName: row[6] || "",
          quantity: row[7] || "",
          unit: row[8] || "",
          rate: row[9] || "",
          amount: row[10] || "",
          source: row[11] || "",
          approved: row[12] || "",
          managerComments: row[13] || "",
          dispatched: row[14] || "",
          dispatchComments: row[15] || "",
          dispatchTime: row[16] || "",
        }));

        const nextPayload = buildDashboardPayload(rows, backendActivities);
        setPayload(nextPayload);
        apiCache.set("dashboardPayload", nextPayload);
      } catch (error: any) {
        showFeedback({
          type: "error",
          title: "Dashboard Error",
          message:
            error?.message ||
            "Could not load the dashboard. Pull down to retry.",
          autoDismiss: true,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showFeedback]
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const notificationItems = useMemo<NotificationItem[]>(() => {
    if (!payload) {
      return [];
    }

    const items: NotificationItem[] = [];

    if (payload.pendingApprovals > 0) {
      items.push({
        id: `approvals-${payload.pendingApprovals}`,
        title: "Approvals waiting",
        body: `${payload.pendingApprovals} orders need attention.`,
        color: colors.accentGold,
        icon: "shield-checkmark-outline",
        route: "/(app)/order-approval",
        time: "Action required",
      });
    }

    if (payload.pendingDispatches > 0) {
      items.push({
        id: `dispatch-${payload.pendingDispatches}`,
        title: "Dispatch queue",
        body: `${payload.pendingDispatches} approved orders are ready to move.`,
        color: colors.accentSky,
        icon: "cube-outline",
        route: "/(app)/process-orders",
        time: "Fulfillment",
      });
    }

    return items;
  }, [colors.accentGold, colors.accentSky, payload]);

  const dismissedNotificationSet = useMemo(
    () => new Set(dismissedNotificationIds),
    [dismissedNotificationIds]
  );

  const activeNotifications = useMemo(
    () =>
      notificationItems.filter(
        (item) => !dismissedNotificationSet.has(item.id)
      ),
    [dismissedNotificationSet, notificationItems]
  );

  const visibleNotifications = useMemo(
    () => activeNotifications.slice(0, 3),
    [activeNotifications]
  );

  const notificationCount = activeNotifications.length;

  const markAllNotificationsRead = useCallback(() => {
    void persistDismissedNotifications([
      ...dismissedNotificationIds,
      ...notificationItems.map((item) => item.id),
    ]);
  }, [
    dismissedNotificationIds,
    notificationItems,
    persistDismissedNotifications,
  ]);

  const handleNotificationPress = useCallback(
    (item: NotificationItem) => {
      setActiveOverlay(null);
      void persistDismissedNotifications([
        ...dismissedNotificationIds,
        item.id,
      ]);
      router.push(item.route);
    },
    [dismissedNotificationIds, persistDismissedNotifications]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.appChrome,
          flex: 1,
        },
        scrollContent: {
          alignItems: "center",
          paddingBottom: isDesktop ? 112 : 188,
          width: "100%",
        },
        header: {
          alignItems: "center",
          alignSelf: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          maxWidth: isDesktop ? 1120 : 414,
          paddingBottom: isDesktop ? 18 : 8,
          paddingHorizontal: isDesktop ? 32 : 24,
          paddingTop: isDesktop ? Math.max(insets.top, 0) + 32 : Math.max(insets.top, 0) + 56,
          width: "100%",
        },
        profileButton: {
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
        },
        avatar: {
          width: 38,
          height: 38,
          borderRadius: 19,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        avatarText: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 16,
        },
        roleLabel: {
          color: "#a1a1aa",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginBottom: 1,
        },
        roleRow: {
          alignItems: "center",
          flexDirection: "row",
          gap: 6,
        },
        nameText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 17,
          letterSpacing: -0.3,
        },
        utilityPillWrap: {
          borderRadius: 999,
        },
        utilityPill: {
          alignItems: "center",
          backgroundColor: colors.appChromeMuted,
          borderRadius: 999,
          flexDirection: "row",
          gap: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        utilityPillButton: {
          alignItems: "center",
          justifyContent: "center",
          minHeight: 28,
          minWidth: 28,
          position: "relative",
        },
        titleSection: {
          marginTop: isDesktop ? 0 : 24,
          paddingHorizontal: isDesktop ? 0 : 20,
        },
        section: {
          marginTop: 32,
          paddingHorizontal: isDesktop ? 0 : 20,
        },
        contentShell: {
          alignSelf: "center",
          flexDirection: isDesktop ? "row" : "column",
          flexWrap: isDesktop ? "wrap" : "nowrap",
          gap: isDesktop ? 32 : 0,
          maxWidth: isDesktop ? 1120 : 414,
          paddingHorizontal: isDesktop ? 32 : 0,
          width: "100%",
        },
        desktopPrimaryPanel: {
          marginTop: 0,
          width: "58%",
        },
        desktopSidePanel: {
          marginTop: 0,
          width: "38%",
        },
        desktopFullPanel: {
          marginTop: 0,
          width: "100%",
        },
        desktopCatalogPanel: {
          marginTop: 0,
          width: "38%",
        },
        dashboardCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 20,
        },
        dateLabel: {
          color: colors.accentGold,
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 16,
          textTransform: "uppercase",
        },
        metricRow: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 20,
          paddingLeft: 14,
          position: "relative",
        },
        metricBar: {
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: 999,
        },
        metricLabel: {
          fontFamily: omaTypography.medium,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 24,
        },
        metricSub: {
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          marginTop: 3,
        },
        metricValue: {
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
          opacity: 0.9,
        },
        mutedHeader: {
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 16,
          marginTop: 32,
          textTransform: "uppercase",
        },
        approvalsCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          overflow: "hidden",
          padding: 8,
        },
        approvalRow: {
          alignItems: "flex-start",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          flexDirection: "row",
          gap: 16,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        approvalIconWrap: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        },
        approvalTitleRow: {
          alignItems: "flex-start",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 2,
        },
        approvalClient: {
          color: "#ffffff",
          flex: 1,
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
          minWidth: 0,
        },
        approvalAmount: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          marginLeft: 12,
        },
        approvalDescription: {
          fontFamily: omaTypography.medium,
          fontSize: 13,
          letterSpacing: -0.3,
          lineHeight: 17,
        },
        approvalFooterRow: {
          alignItems: "flex-start",
          flexDirection: "row",
          gap: 16,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        approvalFooterIconWrap: {
          alignItems: "center",
          borderRadius: 14,
          height: 28,
          justifyContent: "center",
          marginTop: 2,
          width: 28,
        },
        approvalFooterContent: {
          height: 28,
          justifyContent: "center",
          marginTop: 2,
          minWidth: 0,
        },
        approvalFooterText: {
          color: "#71717a",
          fontFamily: omaTypography.medium,
          fontSize: 15,
          letterSpacing: -0.3,
        },
        orderRail: {
          paddingBottom: 24,
        },
        activityCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          overflow: "hidden",
          padding: 8,
        },
        activityRow: {
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          flexDirection: "row",
          gap: 16,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        activityLeft: {
          alignItems: "center",
          flexDirection: "row",
          gap: 16,
          flex: 1,
        },
        activityIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        activityTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.medium,
          fontSize: 15,
          letterSpacing: -0.3,
          marginBottom: 2,
        },
        activityBody: {
          color: "#71717a",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          letterSpacing: -0.3,
        },
        centered: {
          alignItems: "center",
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 32,
        },
        loadingText: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 14,
          lineHeight: 20,
          marginTop: 14,
          textAlign: "center",
        },
        sheetHero: {
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 22,
          marginBottom: 18,
          padding: 18,
        },
        sheetHeroTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 17,
          marginBottom: 4,
        },
        sheetHeroBody: {
          color: "rgba(255,255,255,0.6)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
        },
        actionRow: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 18,
          flexDirection: "row",
          gap: 12,
          marginBottom: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        actionLabel: {
          color: "#ffffff",
          flex: 1,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        notificationCard: {
          alignItems: "center",
          borderTopColor: "rgba(255,255,255,0.08)",
          borderTopWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 64,
          paddingVertical: 14,
        },
        notificationCardFirst: {
          borderTopWidth: 0,
          paddingTop: 2,
        },
        notificationIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        notificationContent: {
          flex: 1,
          minWidth: 0,
        },
        notificationTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 19,
          marginBottom: 3,
        },
        notificationBody: {
          color: "rgba(255,255,255,0.58)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          letterSpacing: -0.2,
          lineHeight: 18,
          marginBottom: 4,
        },
        notificationTime: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        notificationActionText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          letterSpacing: -0.15,
        },
        notificationMoreText: {
          color: "rgba(255,255,255,0.48)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 2,
          textAlign: "center",
        },
        notificationMarkButton: {
          alignItems: "center",
          alignSelf: "stretch",
          backgroundColor: "#ffffff",
          borderRadius: 18,
          justifyContent: "center",
          marginTop: 14,
          minHeight: 46,
        },
        notificationMarkText: {
          color: "#111111",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          letterSpacing: -0.2,
        },
        notificationBadge: {
          alignItems: "center",
          backgroundColor: colors.accentRed,
          borderColor: colors.appChromeMuted,
          borderRadius: 8,
          borderWidth: 2,
          height: 16,
          justifyContent: "center",
          minWidth: 16,
          paddingHorizontal: 4,
          position: "absolute",
          right: -7,
          top: -5,
        },
        notificationBadgeText: {
          color: "#111111",
          fontFamily: omaTypography.bold,
          fontSize: 10,
          lineHeight: 12,
        },
        notificationEmpty: {
          alignItems: "center",
          justifyContent: "center",
          minHeight: 148,
          paddingHorizontal: 12,
          paddingVertical: 24,
        },
        notificationEmptyTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 22,
          marginTop: 12,
          textAlign: "center",
        },
        notificationEmptyBody: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 6,
          textAlign: "center",
        },
      }),
    [colors, insets.top, isDesktop]
  );

  if (loading && !payload) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.loadingText}>
            Loading the latest dashboard design...
          </Text>
        </View>
      </View>
    );
  }

  if (!payload || !userRole) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Ionicons color="rgba(255,255,255,0.42)" name="cloud-offline-outline" size={44} />
          <Text style={styles.loadingText}>
            Dashboard data is unavailable right now.
          </Text>
        </View>
      </View>
    );
  }

  const approvalPreview = payload.approvalOrders.slice(0, 2);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={["#ffffff"]}
            onRefresh={() => loadDashboard(true)}
            refreshing={refreshing}
            tintColor="#ffffff"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => setActiveOverlay("profile")}
            style={styles.profileButton}
          >
            <Image
              source={{ uri: "https://i.pravatar.cc/150?img=11" }}
              style={styles.avatar}
            />
            <View>
              <View style={styles.roleRow}>
                <Text style={styles.roleLabel}>{displayRole}</Text>
                <Ionicons
                  color="rgba(255,255,255,0.48)"
                  name="chevron-down"
                  size={14}
                />
              </View>
              <Text style={styles.nameText}>{displayName}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.utilityPillWrap}>
            <View style={styles.utilityPill}>
              {userRole === "Manager" ? (
                <TouchableOpacity
                  accessibilityLabel="Open analytics"
                  accessibilityRole="button"
                  activeOpacity={0.86}
                  hitSlop={{ bottom: 10, left: 8, right: 8, top: 10 }}
                  onPress={() => router.push("/(app)/analytics")}
                  style={styles.utilityPillButton}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.75)"
                    name="stats-chart-outline"
                    size={18}
                    strokeWidth={2.2}
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                accessibilityLabel={
                  notificationCount
                    ? `Open notifications, ${notificationCount} unread`
                    : "Open notifications"
                }
                accessibilityRole="button"
                activeOpacity={0.86}
                hitSlop={{ bottom: 10, left: 8, right: 8, top: 10 }}
                onPress={() => setActiveOverlay("notifications")}
                style={styles.utilityPillButton}
              >
                <Ionicons
                  color="rgba(255,255,255,0.82)"
                  name="notifications-outline"
                  size={18}
                  strokeWidth={2.2}
                />
                {notificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.contentShell}>
        <View style={[styles.titleSection, isDesktop && styles.desktopPrimaryPanel]}>
          <SectionHeading title="Dashboard" />

          <View style={styles.dashboardCard}>
            <Text style={styles.dateLabel}>{todayLabel}</Text>

            <View style={[styles.metricRow, { marginBottom: 0 }]}>
              <View
                style={[
                  styles.metricBar,
                  { backgroundColor: colors.accentGold },
                ]}
              />
              <Text style={[styles.metricLabel, { color: colors.accentGold }]}>
                Today's Revenue
              </Text>
              <Text style={[styles.metricValue, { color: colors.accentGold }]}>
                ₹{formatIndianCurrency(payload.todayValue)}
              </Text>
            </View>

            <Text style={styles.mutedHeader}>Active Pipeline</Text>

            <View style={[styles.metricRow, { marginBottom: 16 }]}>
              <View
                style={[
                  styles.metricBar,
                  { backgroundColor: colors.accentSky },
                ]}
              />
              <View>
                <Text style={[styles.metricLabel, { color: colors.accentSky }]}>
                  Orders Processing
                </Text>
                <Text style={[styles.metricSub, { color: "rgba(96,165,250,0.72)" }]}>
                  Warehouse fulfillment
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.accentSky }]}>
                {payload.processingOrders}
              </Text>
            </View>

            <View style={[styles.metricRow, { marginBottom: 0 }]}>
              <View
                style={[
                  styles.metricBar,
                  { backgroundColor: colors.accentCoral },
                ]}
              />
              <Text style={[styles.metricLabel, { color: colors.accentCoral }]}>
                Pending Deliveries
              </Text>
              <Text style={[styles.metricValue, { color: colors.accentCoral }]}>
                {payload.pendingDeliveries}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { marginTop: 32 }, isDesktop && styles.desktopSidePanel]}>
          <SectionHeading title="Approvals" />
          <View style={styles.approvalsCard}>
            {approvalPreview.length > 0 ? (
              approvalPreview.map((order, index) => {
                const meta = getApprovalMeta(order, colors);
                return (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    key={order.orderId}
                    onPress={() => router.push("/(app)/order-approval")}
                    style={styles.approvalRow}
                  >
                    <View
                      style={[
                        styles.approvalIconWrap,
                        {
                          backgroundColor: meta.chipBg,
                          borderColor: `${meta.chipColor}4D`,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Ionicons
                        color={meta.chipColor}
                        name={meta.icon}
                        size={14}
                        strokeWidth={2.5}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.approvalTitleRow}>
                        <Text
                          ellipsizeMode="tail"
                          numberOfLines={1}
                          style={styles.approvalClient}
                        >
                          {order.customerName}
                        </Text>
                        <Text
                          style={styles.approvalAmount}
                        >
                          ₹{formatIndianCurrency(order.totalAmount)}
                        </Text>
                      </View>
                      <Text
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        style={[
                          styles.approvalDescription,
                          { color: meta.amountColor },
                        ]}
                      >
                        {meta.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={[styles.approvalRow, { borderBottomWidth: 0 }]}>
                <View
                  style={[
                    styles.approvalIconWrap,
                    { backgroundColor: "rgba(16,185,129,0.18)" },
                    { borderColor: "rgba(16,185,129,0.3)", borderWidth: 1 },
                  ]}
                >
                  <Ionicons
                    color={colors.accentGreen}
                    name="checkmark-circle-outline"
                    size={14}
                    strokeWidth={2.5}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={styles.approvalClient}
                  >
                    No approvals pending
                  </Text>
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[
                      styles.approvalDescription,
                      { color: "rgba(255,255,255,0.48)" },
                    ]}
                  >
                    The manager queue is currently clear.
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push("/(app)/order-approval")}
              style={styles.approvalFooterRow}
            >
              <View style={styles.approvalFooterIconWrap}>
                <Ionicons
                  color="#71717a"
                  name="chevron-forward-circle-outline"
                  size={20}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.approvalFooterContent}>
                <Text style={styles.approvalFooterText}>
                  {payload.pendingApprovals > 0
                    ? `View ${payload.pendingApprovals} more pending`
                    : "Queue is clear"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, { marginTop: 32 }, isDesktop && styles.desktopFullPanel]}>
          <SectionHeading
            actionLabel="Recent"
            onActionPress={() => router.push("/(app)/my-orders")}
            title="My Orders"
          />

          <ScrollView
            contentContainerStyle={styles.orderRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {payload.groupedOrders.slice(0, 6).map((order) => (
              <RecentOrderCard
                colors={colors}
                key={order.orderId}
                onPress={() => router.push("/(app)/my-orders")}
                order={order}
              />
            ))}
          </ScrollView>
        </View>

        <View style={[styles.section, { marginTop: 32 }, isDesktop && styles.desktopPrimaryPanel]}>
          <SectionHeading
            actionLabel="See all"
            icon="pulse-outline"
            onActionPress={() => router.push("/(app)/my-orders")}
            title="Recent Activity"
          />

          <View style={styles.activityCard}>
            {payload.recentActivities.map((activity, index) => (
              <View
                key={activity.id}
                style={[
                  styles.activityRow,
                  index === payload.recentActivities.length - 1 && {
                    borderBottomWidth: 0,
                  },
                ]}
              >
                <View style={styles.activityLeft}>
                  <View
                    style={[
                      styles.activityIconWrap,
                      {
                        backgroundColor: `${activity.iconColor}20`,
                        borderColor: `${activity.iconColor}4D`,
                      },
                    ]}
                  >
                    <Ionicons
                      color={activity.iconColor}
                      name={activity.icon}
                      size={16}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={styles.activityTitle}
                    >
                      {activity.title}
                    </Text>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={styles.activityBody}
                    >
                      {activity.timeLabel} - {activity.description}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, { marginTop: 32, paddingBottom: 24 }, isDesktop && styles.desktopCatalogPanel]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push("/(app)/products")}
            style={{
              backgroundColor: colors.appChromeElevated,
              borderColor: "rgba(255,255,255,0.04)",
              borderRadius: 24,
              borderWidth: 1,
              overflow: "hidden",
              padding: 24,
            }}
          >
            <View
              style={{
                pointerEvents: "none",
                position: "absolute",
                bottom: 0,
                right: 0,
                top: 0,
                width: 128,
                backgroundColor: "rgba(96,165,250,0.08)",
              }}
            />
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontFamily: omaTypography.bold,
                  fontSize: 20,
                  letterSpacing: -0.4,
                }}
              >
                Product Catalog
              </Text>
              <Ionicons
                color="#71717a"
                name="chevron-forward"
                size={20}
              />
            </View>
            <Text
              style={{
                color: "#a1a1aa",
                fontFamily: omaTypography.medium,
                fontSize: 14,
                letterSpacing: -0.3,
                lineHeight: 19,
                maxWidth: 200,
              }}
            >
              Manage inventory, pricing, and 142 active SKUs.
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>

      <OmaBottomSheet
        maxHeight="56%"
        onClose={() => setActiveOverlay(null)}
        subtitle={
          notificationCount
            ? `${notificationCount} unread order alert${notificationCount === 1 ? "" : "s"}.`
            : "No unread order alerts."
        }
        title="Notifications"
        visible={activeOverlay === "notifications"}
      >
        {visibleNotifications.length > 0 ? (
          <>
            {visibleNotifications.map((item, index) => (
              <TouchableOpacity
                accessibilityLabel={`Open ${item.title}`}
                accessibilityRole="button"
                activeOpacity={0.86}
                key={item.id}
                onPress={() => handleNotificationPress(item)}
                style={[
                  styles.notificationCard,
                  index === 0 && styles.notificationCardFirst,
                ]}
              >
                <View
                  style={[
                    styles.notificationIconWrap,
                    { backgroundColor: `${item.color}20` },
                  ]}
                >
                  <Ionicons color={item.color} name={item.icon} size={16} />
                </View>
                <View style={styles.notificationContent}>
                  <Text numberOfLines={1} style={styles.notificationTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={2} style={styles.notificationBody}>
                    {item.body}
                  </Text>
                  <Text numberOfLines={1} style={styles.notificationTime}>
                    {item.time}
                  </Text>
                </View>
                <Text style={styles.notificationActionText}>Open</Text>
              </TouchableOpacity>
            ))}

            {notificationCount > visibleNotifications.length ? (
              <Text style={styles.notificationMoreText}>
                {notificationCount - visibleNotifications.length} more order
                alerts.
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityLabel="Mark all main notifications as read"
              accessibilityRole="button"
              activeOpacity={0.88}
              onPress={markAllNotificationsRead}
              style={styles.notificationMarkButton}
            >
              <Text style={styles.notificationMarkText}>Mark all read</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.notificationEmpty}>
            <Ionicons
              color={colors.accentGreen}
              name="checkmark-circle-outline"
              size={34}
            />
            <Text style={styles.notificationEmptyTitle}>No unread alerts</Text>
            <Text style={styles.notificationEmptyBody}>
              New approvals or dispatch pressure will appear here.
            </Text>
          </View>
        )}
      </OmaBottomSheet>

      <OmaBottomSheet
        maxHeight="58%"
        onClose={() => setActiveOverlay(null)}
        subtitle="Workspace controls and quick exits."
        title="Workspace"
        visible={activeOverlay === "profile"}
      >
        <View style={styles.sheetHero}>
          <Text style={styles.sheetHeroTitle}>{displayName}</Text>
          <Text style={styles.sheetHeroBody}>
            {displayRole} session using the redesigned OMA workspace.
          </Text>
        </View>

        {[
          {
            id: "analytics",
            label: "Open analytics",
            icon: "stats-chart-outline" as const,
            hidden: userRole !== "Manager",
            onPress: () => {
              setActiveOverlay(null);
              router.push("/(app)/analytics");
            },
          },
          {
            id: "customers",
            label: "Open clients",
            icon: "people-outline" as const,
            hidden: false,
            onPress: () => {
              setActiveOverlay(null);
              router.push("/(app)/customers");
            },
          },
          {
            id: "theme",
            label: isDark ? "Switch to light mode" : "Switch to dark mode",
            icon: isDark ? "sunny-outline" : "moon-outline",
            hidden: false,
            onPress: () => {
              toggleTheme();
              setActiveOverlay(null);
            },
          },
          {
            id: "logout",
            label: "Sign out",
            icon: "log-out-outline" as const,
            hidden: false,
            onPress: async () => {
              setActiveOverlay(null);
              await AsyncStorage.multiRemove([
                "userRole",
                "username",
                "lastLogin",
              ]);
              router.replace("/(auth)/login");
            },
          },
        ]
          .filter((action) => !action.hidden)
          .map((action) => (
            <TouchableOpacity
              activeOpacity={0.86}
              key={action.id}
              onPress={action.onPress}
              style={styles.actionRow}
            >
              <Ionicons
                color="#ffffff"
                name={action.icon as keyof typeof Ionicons.glyphMap}
                size={16}
              />
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Ionicons
                color="rgba(255,255,255,0.34)"
                name="chevron-forward"
                size={16}
              />
            </TouchableOpacity>
          ))}
      </OmaBottomSheet>
    </View>
  );
}
