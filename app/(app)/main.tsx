import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
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

type OverlayName = "notifications" | "profile" | "search" | null;

type ShortcutItem = {
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  keywords: string;
  label: string;
  managerOnly?: boolean;
  route: Href;
};

type NotificationItem = {
  body: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  route: Href;
  time: string;
  title: string;
};

type QuickAction = {
  icon: keyof typeof Ionicons.glyphMap;
  id: string;
  label: string;
  route: Href;
};

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

const formatShortDateTime = (date: Date | null) => {
  if (!date) {
    return "No recent activity";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

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

const buildDashboardPayload = (rows: OrderRow[]) => {
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
    let description = `${order.orderId} for ${order.customerName}`;
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
    recentActivities,
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
      icon: "alert-circle-outline" as const,
    };
  }

  return {
    amountColor: colors.accentGold,
    chipBg: "rgba(234,179,8,0.18)",
    chipColor: colors.accentGold,
    description: "Waiting approval",
    icon: "shield-checkmark-outline" as const,
  };
};

const getActiveOrderMeta = (status: GroupedOrder["status"], colors: AppColors) => {
  switch (status) {
    case "approved":
      return {
        bg: "rgba(96,165,250,0.18)",
        color: colors.accentSky,
        label: "Processing",
      };
    case "dispatched":
      return {
        bg: "rgba(16,185,129,0.18)",
        color: colors.accentGreen,
        label: "Dispatched",
      };
    case "rejected":
      return {
        bg: "rgba(248,113,113,0.18)",
        color: colors.accentCoral,
        label: "Blocked",
      };
    default:
      return {
        bg: "rgba(234,179,8,0.18)",
        color: colors.accentGold,
        label: "In Review",
      };
  }
};

function SectionHeading({
  actionLabel,
  onActionPress,
  title,
}: {
  actionLabel?: string;
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
        paddingHorizontal: 2,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
        <Text
          style={{
            color: "#ffffff",
            fontFamily: omaTypography.bold,
            fontSize: 19,
            letterSpacing: -0.5,
          }}
        >
          {title}
        </Text>
        <Ionicons color="rgba(255,255,255,0.4)" name="chevron-forward" size={17} />
      </View>

      {actionLabel ? (
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={onActionPress}
          style={{ alignItems: "center", flexDirection: "row", gap: 8 }}
        >
          <Text
            style={{
              color: "#ffffff",
              fontFamily: omaTypography.semibold,
              fontSize: 13,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : (
        <Ionicons color="rgba(255,255,255,0.32)" name="ellipsis-horizontal" size={18} />
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
      padding: 18,
      width: 240,
    },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    badge: {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderRadius: 8,
      color: "#c4c5cc",
      fontFamily: omaTypography.bold,
      fontSize: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    time: {
      color: "rgba(255,255,255,0.34)",
      fontFamily: omaTypography.medium,
      fontSize: 12,
    },
    customer: {
      color: "#ffffff",
      fontFamily: omaTypography.bold,
      fontSize: 20,
      letterSpacing: -0.6,
      lineHeight: 24,
      marginBottom: 7,
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
    },
    metrics: {
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.05)",
      gap: 10,
      paddingTop: 14,
    },
    metricRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    metricLabel: {
      color: "rgba(255,255,255,0.55)",
      fontFamily: omaTypography.medium,
      fontSize: 14,
    },
    metricValue: {
      color: "#ffffff",
      fontFamily: omaTypography.bold,
      fontSize: 14,
    },
  });

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.badge}>#ORD-{order.orderId}</Text>
        <Text style={styles.time}>{formatTimeAgo(order.createdAt)}</Text>
      </View>

      <Text numberOfLines={2} style={styles.customer}>
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

function MetricChip({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
        marginRight: 12,
        padding: 16,
        width: 160,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: `${color}20`,
          borderRadius: 14,
          height: 30,
          justifyContent: "center",
          marginBottom: 14,
          width: 30,
        }}
      >
        <Ionicons color={color} name={icon} size={15} />
      </View>
      <Text
        style={{
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 20,
          letterSpacing: -0.8,
          marginBottom: 6,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function QuickActionChip({
  action,
  onPress,
}: {
  action: QuickAction;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
        flexDirection: "row",
        gap: 10,
        marginRight: 10,
        paddingHorizontal: 14,
        paddingVertical: 11,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 12,
          height: 28,
          justifyContent: "center",
          width: 28,
        }}
      >
        <Ionicons color="#ffffff" name={action.icon} size={14} />
      </View>
      <Text
        style={{
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        }}
      >
        {action.label}
      </Text>
    </TouchableOpacity>
  );
}

export default function MainScreen() {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const displayName = userRole === "Manager" ? "Alex Carter" : "Sales Workspace";
  const displayRole = userRole === "Manager" ? "Manager" : "User";
  const todayLabel = todayFormatter.format(new Date()).toUpperCase();

  const loadDashboard = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const [storedRole, storedLastLogin] = await Promise.all([
          AsyncStorage.getItem("userRole"),
          AsyncStorage.getItem("lastLogin"),
        ]);

        if (!storedRole) {
          router.replace("/(auth)/login");
          return;
        }

        setUserRole(storedRole);
        setLastLogin(storedLastLogin);

        const cachedPayload = apiCache.get("dashboardPayload");
        if (!forceRefresh && cachedPayload) {
          setPayload(cachedPayload);
          setLoading(false);
          return;
        }

        await wakeUpServer();
        await preloadData();

        const response = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
          {},
          2,
          1500
        );

        const rows: OrderRow[] = (response.data?.values || []).map((row) => ({
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

        const nextPayload = buildDashboardPayload(rows);
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

  const quickActions = useMemo<QuickAction[]>(() => {
    if (userRole === "Manager") {
      return [
        {
          id: "new-order",
          label: "New Order",
          icon: "document-text-outline",
          route: "/(app)/new-order",
        },
        {
          id: "process",
          label: "Dispatch",
          icon: "clipboard-outline",
          route: "/(app)/process-orders",
        },
        {
          id: "catalog",
          label: "Catalog",
          icon: "cube-outline",
          route: "/(app)/products",
        },
        {
          id: "ledger",
          label: "Ledger",
          icon: "wallet-outline",
          route: "/(app)/customer-summary",
        },
      ];
    }

    return [
      {
        id: "new-order",
        label: "New Order",
        icon: "document-text-outline",
        route: "/(app)/new-order",
      },
      {
        id: "history",
        label: "History",
        icon: "time-outline",
        route: "/(app)/my-orders",
      },
      {
        id: "customers",
        label: "Customers",
        icon: "people-outline",
        route: "/(app)/customers",
      },
      {
        id: "catalog",
        label: "Catalog",
        icon: "cube-outline",
        route: "/(app)/products",
      },
    ];
  }, [userRole]);

  const searchShortcuts = useMemo<ShortcutItem[]>(() => {
    return [
      {
        id: "home",
        label: "Dashboard",
        hint: "Overview, metrics, and activity",
        route: "/(app)/main",
        icon: "home-outline",
        keywords: "home dashboard overview revenue",
      },
      {
        id: "new-order",
        label: "New Order",
        hint: "Create a fresh sales order",
        route: "/(app)/new-order",
        icon: "document-text-outline",
        keywords: "new order create draft",
      },
      {
        id: "process",
        label: "Process Orders",
        hint: "Dispatch and fulfillment queue",
        route: "/(app)/process-orders",
        icon: "clipboard-outline",
        keywords: "dispatch process fulfillment queue",
      },
      {
        id: "products",
        label: "Products",
        hint: "Browse product catalog",
        route: "/(app)/products",
        icon: "cube-outline",
        keywords: "products catalog sku item",
      },
      {
        id: "customers",
        label: "Customers",
        hint: "Contacts and account history",
        route: "/(app)/customers",
        icon: "people-outline",
        keywords: "customers clients contacts history",
      },
      {
        id: "orders",
        label: "My Orders",
        hint: "Search submitted orders",
        route: "/(app)/my-orders",
        icon: "receipt-outline",
        keywords: "orders history submitted status",
      },
      {
        id: "analytics",
        label: "Analytics",
        hint: "Performance snapshots",
        route: "/(app)/analytics",
        icon: "stats-chart-outline",
        keywords: "analytics stats charts insights",
        managerOnly: true,
      },
      {
        id: "approvals",
        label: "Approvals",
        hint: "Manager review queue",
        route: "/(app)/order-approval",
        icon: "shield-checkmark-outline",
        keywords: "manager approval blocked pending",
        managerOnly: true,
      },
    ].filter((item) => !item.managerOnly || userRole === "Manager");
  }, [userRole]);

  const filteredSearchShortcuts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return searchShortcuts;
    }

    return searchShortcuts.filter((item) =>
      `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(query)
    );
  }, [searchQuery, searchShortcuts]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    if (!payload) {
      return [];
    }

    const items: NotificationItem[] = [];

    if (payload.pendingApprovals > 0) {
      items.push({
        id: "approvals",
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
        id: "dispatch",
        title: "Dispatch queue",
        body: `${payload.pendingDispatches} approved orders are ready to move.`,
        color: colors.accentSky,
        icon: "cube-outline",
        route: "/(app)/process-orders",
        time: "Fulfillment",
      });
    }

    if (payload.currentOrder) {
      items.push({
        id: "active",
        title: "Active order",
        body: `${payload.currentOrder.orderId} is still moving through the workflow.`,
        color: colors.accentGreen,
        icon: "time-outline",
        route: "/(app)/my-orders",
        time: formatTimeAgo(payload.currentOrder.createdAt),
      });
    }

    return items;
  }, [colors.accentGold, colors.accentGreen, colors.accentSky, payload]);

  const metricCards = useMemo(() => {
    if (!payload) {
      return [];
    }

    return [
      {
        id: "customers",
        label: "Active Customers",
        value: String(payload.totalCustomers),
        icon: "people-outline" as const,
        color: colors.accentSky,
      },
      {
        id: "average",
        label: "Avg Order Value",
        value: `₹${formatIndianCurrency(payload.averageOrderValue)}`,
        icon: "cash-outline" as const,
        color: colors.accentGold,
      },
      {
        id: "pipeline",
        label: "Open Pipeline",
        value: `₹${formatIndianCurrency(payload.openPipelineValue)}`,
        icon: "pulse-outline" as const,
        color: colors.accentGreen,
      },
      {
        id: "recent",
        label: "Orders in 7 Days",
        value: String(payload.recentOrders),
        icon: "time-outline" as const,
        color: colors.accentCoral,
      },
    ];
  }, [colors, payload]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.appChrome,
          flex: 1,
        },
        scrollContent: {
          paddingBottom: 36,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 260,
          backgroundColor: "rgba(255,255,255,0.02)",
        },
        header: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 24,
          paddingTop: insets.top + 12,
          paddingBottom: 8,
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
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
        },
        avatarText: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 16,
        },
        roleLabel: {
          color: "rgba(255,255,255,0.46)",
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
          fontFamily: omaTypography.bold,
          fontSize: 17,
          letterSpacing: -0.3,
        },
        utilityPillWrap: {
          borderRadius: 26,
          overflow: "hidden",
        },
        utilityPillFill: {
          ...StyleSheet.absoluteFillObject,
        },
        utilityPillHighlight: {
          position: "absolute",
          top: 1,
          left: 14,
          right: 14,
          height: 16,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        utilityPill: {
          alignItems: "center",
          backgroundColor: "rgba(52,52,56,0.56)",
          borderRadius: 26,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
          flexDirection: "row",
          gap: 18,
          height: 52,
          paddingHorizontal: 16,
        },
        titleSection: {
          marginTop: 20,
          paddingHorizontal: 24,
        },
        section: {
          marginTop: 24,
          paddingHorizontal: 24,
        },
        searchCard: {
          alignItems: "center",
          backgroundColor: colors.appChromeElevated,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          flexDirection: "row",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
        },
        searchText: {
          color: "rgba(255,255,255,0.54)",
          flex: 1,
          fontFamily: omaTypography.medium,
          fontSize: 15,
        },
        actionRail: {
          paddingTop: 16,
          paddingBottom: 2,
        },
        dashboardCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          paddingHorizontal: 18,
          paddingVertical: 20,
        },
        dateLabel: {
          color: colors.accentGold,
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 1.1,
          marginBottom: 16,
          textTransform: "uppercase",
        },
        divider: {
          height: 1,
          backgroundColor: "rgba(255,255,255,0.1)",
          marginBottom: 16,
        },
        metricRow: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 18,
          paddingLeft: 14,
          position: "relative",
        },
        metricBar: {
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: 999,
        },
        metricLabel: {
          fontFamily: omaTypography.medium,
          fontSize: 17,
          letterSpacing: -0.2,
        },
        metricSub: {
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginTop: 3,
        },
        metricValue: {
          fontFamily: omaTypography.bold,
          fontSize: 15,
        },
        mutedHeader: {
          color: "rgba(255,255,255,0.36)",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 1.1,
          marginBottom: 18,
          marginTop: 8,
          textTransform: "uppercase",
        },
        approvalsCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          overflow: "hidden",
          paddingHorizontal: 4,
        },
        approvalRow: {
          alignItems: "flex-start",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          gap: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        approvalIconWrap: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        },
        approvalTitleRow: {
          alignItems: "flex-start",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3,
        },
        approvalClient: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 17,
          letterSpacing: -0.3,
        },
        approvalAmount: {
          fontFamily: omaTypography.bold,
          fontSize: 15,
          marginLeft: 12,
        },
        approvalDescription: {
          fontFamily: omaTypography.medium,
          fontSize: 13,
          letterSpacing: -0.1,
        },
        approvalFooterRow: {
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 16,
        },
        approvalFooterText: {
          color: "rgba(255,255,255,0.36)",
          fontFamily: omaTypography.semibold,
          fontSize: 15,
        },
        metricRail: {
          paddingBottom: 2,
        },
        orderRail: {
          paddingBottom: 4,
        },
        spotlightCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          padding: 18,
        },
        spotlightHeader: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 18,
        },
        spotlightEyebrow: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.bold,
          fontSize: 11,
          letterSpacing: 0.9,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        spotlightTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 18,
          letterSpacing: -0.4,
        },
        spotlightStatus: {
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 7,
        },
        spotlightStatusText: {
          fontFamily: omaTypography.bold,
          fontSize: 12,
        },
        spotlightMetaRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 18,
        },
        spotlightMetaLabel: {
          color: "rgba(255,255,255,0.44)",
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 5,
          textTransform: "uppercase",
        },
        spotlightMetaValue: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          maxWidth: 160,
        },
        spotlightMetaSub: {
          color: "rgba(255,255,255,0.52)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginTop: 4,
        },
        timelineCard: {
          backgroundColor: "rgba(255,255,255,0.04)",
          borderRadius: 18,
          padding: 16,
        },
        timelineTrack: {
          position: "absolute",
          top: 28,
          left: 30,
          right: 30,
          height: 3,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        timelineProgress: {
          position: "absolute",
          top: 28,
          left: 30,
          height: 3,
          borderRadius: 999,
          backgroundColor: "#ffffff",
        },
        timelineRow: {
          flexDirection: "row",
          justifyContent: "space-between",
        },
        timelineItem: {
          alignItems: "center",
          width: "33%",
        },
        timelineDot: {
          alignItems: "center",
          borderRadius: 14,
          height: 28,
          justifyContent: "center",
          width: 28,
          zIndex: 1,
        },
        timelineTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          marginTop: 11,
        },
        timelineSub: {
          color: "rgba(255,255,255,0.5)",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          lineHeight: 14,
          marginTop: 4,
          paddingHorizontal: 6,
          textAlign: "center",
        },
        activityCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          overflow: "hidden",
          paddingHorizontal: 4,
        },
        activityRow: {
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        activityLeft: {
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          flex: 1,
          paddingRight: 12,
        },
        activityIconWrap: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
        },
        activityTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 4,
        },
        activityBody: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        activityTime: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.medium,
          fontSize: 11,
        },
        footerHint: {
          color: "rgba(255,255,255,0.44)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 18,
          marginTop: 24,
          paddingHorizontal: 24,
          textAlign: "center",
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
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 18,
          flexDirection: "row",
          gap: 12,
          marginBottom: 12,
          padding: 14,
        },
        notificationIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        notificationTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 3,
        },
        notificationBody: {
          color: "rgba(255,255,255,0.6)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
          marginBottom: 8,
        },
        notificationTime: {
          color: "rgba(255,255,255,0.4)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
        searchInputCard: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 18,
          flexDirection: "row",
          gap: 12,
          marginBottom: 18,
          paddingHorizontal: 16,
          paddingVertical: 14,
        },
        searchInput: {
          color: "#ffffff",
          flex: 1,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          paddingVertical: 0,
        },
        sheetLabel: {
          color: "rgba(255,255,255,0.46)",
          fontFamily: omaTypography.bold,
          fontSize: 11,
          letterSpacing: 1,
          marginBottom: 12,
          textTransform: "uppercase",
        },
        searchGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        },
        searchCardResult: {
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          marginBottom: 12,
          minHeight: 120,
          padding: 14,
          width: "48%",
        },
        searchCardIconWrap: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 12,
          height: 28,
          justifyContent: "center",
          marginBottom: 12,
          width: 28,
        },
        searchCardTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 5,
        },
        searchCardHint: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        searchRowResult: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: 18,
          flexDirection: "row",
          gap: 12,
          marginBottom: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        searchRowIcon: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 14,
          height: 34,
          justifyContent: "center",
          width: 34,
        },
        searchRowTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 3,
        },
        searchRowHint: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 16,
        },
      }),
    [colors, insets.top]
  );

  if (loading && !payload) {
    return (
      <View style={styles.container}>
        <View style={styles.topGlow} />
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
        <View style={styles.topGlow} />
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
  const activeOrderMeta = payload.currentOrder
    ? getActiveOrderMeta(payload.currentOrder.status, colors)
    : null;
  const activeOrderProgress =
    payload.currentOrder?.status === "dispatched"
      ? 1
      : payload.currentOrder?.status === "approved"
      ? 0.66
      : 0.33;

  return (
    <View style={styles.container}>
      <View style={styles.topGlow} />

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
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
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
            <BlurView
              intensity={74}
              style={styles.utilityPillFill}
              tint={isDark ? "dark" : "light"}
            />
            <View pointerEvents="none" style={styles.utilityPillHighlight} />
            <View style={styles.utilityPill}>
              {userRole === "Manager" ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => router.push("/(app)/analytics")}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.75)"
                    name="stats-chart-outline"
                    size={18}
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => setActiveOverlay("notifications")}
              >
                <Ionicons
                  color="rgba(255,255,255,0.82)"
                  name="notifications-outline"
                  size={18}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.titleSection}>
          <SectionHeading title="Dashboard" />
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setActiveOverlay("search")}
            style={styles.searchCard}
          >
            <Ionicons color={colors.accentGold} name="search-outline" size={18} />
            <Text style={styles.searchText}>
              Search screens, actions, orders, and customers...
            </Text>
            <Ionicons
              color="rgba(255,255,255,0.36)"
              name="chevron-forward"
              size={16}
            />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.actionRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {quickActions.map((action) => (
              <QuickActionChip
                action={action}
                key={action.id}
                onPress={() => router.push(action.route)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.dashboardCard}>
            <Text style={styles.dateLabel}>{todayLabel}</Text>
            <View style={styles.divider} />

            <View style={styles.metricRow}>
              <View
                style={[
                  styles.metricBar,
                  { backgroundColor: colors.accentGold },
                ]}
              />
              <Text style={[styles.metricLabel, { color: colors.accentGold }]}>
                Today&apos;s Revenue
              </Text>
              <Text style={[styles.metricValue, { color: colors.accentGold }]}>
                ₹{formatIndianCurrency(payload.todayValue)}
              </Text>
            </View>

            <Text style={styles.mutedHeader}>Active Pipeline</Text>

            <View style={styles.metricRow}>
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

        <View style={styles.section}>
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
                    style={[
                      styles.approvalRow,
                      index === approvalPreview.length - 1 &&
                        payload.approvalOrders.length <= 2 && {
                          borderBottomWidth: 0,
                        },
                    ]}
                  >
                    <View
                      style={[
                        styles.approvalIconWrap,
                        { backgroundColor: meta.chipBg },
                      ]}
                    >
                      <Ionicons color={meta.chipColor} name={meta.icon} size={15} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.approvalTitleRow}>
                        <Text style={styles.approvalClient}>{order.customerName}</Text>
                        <Text
                          style={[
                            styles.approvalAmount,
                            { color: meta.amountColor },
                          ]}
                        >
                          ₹{formatIndianCurrency(order.totalAmount)}
                        </Text>
                      </View>
                      <Text
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
                  ]}
                >
                  <Ionicons
                    color={colors.accentGreen}
                    name="checkmark-circle-outline"
                    size={15}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.approvalClient}>No approvals pending</Text>
                  <Text
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
              <Ionicons
                color="rgba(255,255,255,0.36)"
                name="chevron-forward"
                size={18}
              />
              <Text style={styles.approvalFooterText}>
                {payload.pendingApprovals > 0
                  ? `View ${payload.pendingApprovals} more pending`
                  : "Queue is clear"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading actionLabel="Live" title="Key Metrics" />
          <ScrollView
            contentContainerStyle={styles.metricRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {metricCards.map((metric) => (
              <MetricChip
                color={metric.color}
                icon={metric.icon}
                key={metric.id}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
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

        {payload.currentOrder && activeOrderMeta ? (
          <View style={styles.section}>
            <SectionHeading
              actionLabel="See all"
              onActionPress={() => router.push("/(app)/my-orders")}
              title="Active Order"
            />

            <View style={styles.spotlightCard}>
              <View style={styles.spotlightHeader}>
                <View>
                  <Text style={styles.spotlightEyebrow}>Order ID</Text>
                  <Text style={styles.spotlightTitle}>
                    {payload.currentOrder.orderId}
                  </Text>
                </View>

                <View
                  style={[
                    styles.spotlightStatus,
                    { backgroundColor: activeOrderMeta.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.spotlightStatusText,
                      { color: activeOrderMeta.color },
                    ]}
                  >
                    {activeOrderMeta.label}
                  </Text>
                </View>
              </View>

              <View style={styles.spotlightMetaRow}>
                <View>
                  <Text style={styles.spotlightMetaLabel}>Customer</Text>
                  <Text style={styles.spotlightMetaValue}>
                    {payload.currentOrder.customerName}
                  </Text>
                  <Text style={styles.spotlightMetaSub}>
                    ₹{formatIndianCurrency(payload.currentOrder.totalAmount)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.spotlightMetaLabel}>Updated</Text>
                  <Text style={styles.spotlightMetaValue}>
                    {formatTimeAgo(payload.currentOrder.createdAt)}
                  </Text>
                  <Text style={styles.spotlightMetaSub}>
                    {payload.currentOrder.dispatchedItems}/
                    {payload.currentOrder.itemCount} items shipped
                  </Text>
                </View>
              </View>

              <View style={styles.timelineCard}>
                <View style={styles.timelineTrack} />
                <View
                  style={[
                    styles.timelineProgress,
                    { width: `${Math.max(18, activeOrderProgress * 100 - 8)}%` },
                  ]}
                />
                <View style={styles.timelineRow}>
                  {[
                    {
                      id: "drafted",
                      label: "Drafted",
                      active: true,
                      sub: formatShortDateTime(payload.currentOrder.createdAt),
                      color: "#ffffff",
                    },
                    {
                      id: "approved",
                      label: "Approved",
                      active:
                        payload.currentOrder.status === "approved" ||
                        payload.currentOrder.status === "dispatched",
                      sub:
                        payload.currentOrder.status === "pending"
                          ? "Waiting review"
                          : `${payload.currentOrder.approvedItems} line items`,
                      color:
                        payload.currentOrder.status === "pending"
                          ? colors.accentGold
                          : "#ffffff",
                    },
                    {
                      id: "shipped",
                      label: "Shipped",
                      active: payload.currentOrder.status === "dispatched",
                      sub:
                        payload.currentOrder.status === "dispatched"
                          ? `${payload.currentOrder.dispatchedItems}/${payload.currentOrder.itemCount} done`
                          : "Queued",
                      color: colors.accentGreen,
                    },
                  ].map((step) => (
                    <View key={step.id} style={styles.timelineItem}>
                      <View
                        style={[
                          styles.timelineDot,
                          {
                            backgroundColor: step.active
                              ? step.color
                              : "rgba(255,255,255,0.06)",
                            borderWidth: step.active ? 0 : 1,
                            borderColor: "rgba(255,255,255,0.12)",
                          },
                        ]}
                      >
                        {step.active ? (
                          <Ionicons color="#111111" name="checkmark" size={13} />
                        ) : (
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: "rgba(255,255,255,0.44)",
                            }}
                          />
                        )}
                      </View>
                      <Text style={styles.timelineTitle}>{step.label}</Text>
                      <Text style={styles.timelineSub}>{step.sub}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeading
            actionLabel="See all"
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
                  <View style={styles.activityIconWrap}>
                    <Ionicons
                      color={activity.iconColor}
                      name={activity.icon}
                      size={16}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>{activity.title}</Text>
                    <Text style={styles.activityBody}>{activity.description}</Text>
                  </View>
                </View>
                <Text style={styles.activityTime}>{activity.timeLabel}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footerHint}>
          Last login: {formatShortDateTime(parseIndianDate(lastLogin || ""))} ·
          Last sync {formatTimeAgo(parseIndianDate(payload.lastUpdatedAt))}
        </Text>
      </ScrollView>

      <OmaBottomSheet
        maxHeight="72%"
        onClose={() => {
          setActiveOverlay(null);
          setSearchQuery("");
        }}
        subtitle="Find screens, flows, and actions without leaving the home context."
        title="Search Workspace"
        visible={activeOverlay === "search"}
      >
        <View style={styles.searchInputCard}>
          <Ionicons color={colors.accentGold} name="search-outline" size={18} />
          <TextInput
            autoFocus
            onChangeText={setSearchQuery}
            placeholder="Search screens, orders, customers..."
            placeholderTextColor="rgba(255,255,255,0.42)"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setSearchQuery("")}
            >
              <Ionicons
                color="rgba(255,255,255,0.42)"
                name="close-circle-outline"
                size={18}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {!searchQuery.trim() ? (
          <>
            <Text style={styles.sheetLabel}>Quick Actions</Text>
            <View style={styles.searchGrid}>
              {searchShortcuts.slice(0, 6).map((item) => (
                <TouchableOpacity
                  activeOpacity={0.88}
                  key={item.id}
                  onPress={() => {
                    setActiveOverlay(null);
                    router.push(item.route);
                  }}
                  style={styles.searchCardResult}
                >
                  <View style={styles.searchCardIconWrap}>
                    <Ionicons color="#ffffff" name={item.icon} size={15} />
                  </View>
                  <Text style={styles.searchCardTitle}>{item.label}</Text>
                  <Text style={styles.searchCardHint}>{item.hint}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sheetLabel}>Results</Text>
            {filteredSearchShortcuts.map((item) => (
              <TouchableOpacity
                activeOpacity={0.88}
                key={item.id}
                onPress={() => {
                  setActiveOverlay(null);
                  setSearchQuery("");
                  router.push(item.route);
                }}
                style={styles.searchRowResult}
              >
                <View style={styles.searchRowIcon}>
                  <Ionicons color="#ffffff" name={item.icon} size={15} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchRowTitle}>{item.label}</Text>
                  <Text style={styles.searchRowHint}>{item.hint}</Text>
                </View>
                <Ionicons
                  color="rgba(255,255,255,0.34)"
                  name="chevron-forward"
                  size={16}
                />
              </TouchableOpacity>
            ))}
            {filteredSearchShortcuts.length === 0 ? (
              <View style={styles.sheetHero}>
                <Text style={styles.sheetHeroTitle}>No matches found</Text>
                <Text style={styles.sheetHeroBody}>
                  Try searching for orders, customers, approvals, analytics, or
                  dispatch.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </OmaBottomSheet>

      <OmaBottomSheet
        maxHeight="56%"
        onClose={() => setActiveOverlay(null)}
        subtitle="Latest queue pressure and dashboard events."
        title="Notifications"
        visible={activeOverlay === "notifications"}
      >
        {notificationItems.length > 0 ? (
          notificationItems.map((item) => (
            <TouchableOpacity
              activeOpacity={0.86}
              key={item.id}
              onPress={() => {
                setActiveOverlay(null);
                router.push(item.route);
              }}
              style={styles.notificationCard}
            >
              <View
                style={[
                  styles.notificationIconWrap,
                  { backgroundColor: `${item.color}20` },
                ]}
              >
                <Ionicons color={item.color} name={item.icon} size={16} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationBody}>{item.body}</Text>
                <Text style={styles.notificationTime}>{item.time}</Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.sheetHero}>
            <Text style={styles.sheetHeroTitle}>No notifications yet</Text>
            <Text style={styles.sheetHeroBody}>
              This feed will show new approvals, dispatch pressure, and recent order
              events.
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
            {displayRole} session using the latest mobile dashboard shell.
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
              <Ionicons color="#ffffff" name={action.icon} size={16} />
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
