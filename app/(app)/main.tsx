import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeContext } from "../context/ThemeContext";
import type { AppColors } from "../context/ThemeContext";
import { useFeedback } from "../context/FeedbackContext";
import { omaTypography } from "../utils/typography";
import {
  apiCache,
  BACKEND_URL,
  fetchWithRetry,
  preloadData,
  wakeUpServer,
} from "../utils/apiManager";

type OrderRow = {
  sysTime: string;
  orderTime: string;
  user: string;
  orderComments: string;
  customerName: string;
  orderId: string;
  productName: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  source: string;
  approved: string;
  managerComments: string;
  dispatched: string;
  dispatchComments: string;
  dispatchTime: string;
};

type GroupedOrder = {
  orderId: string;
  customerName: string;
  user: string;
  source: string;
  createdAt: Date | null;
  totalAmount: number;
  status: "pending" | "approved" | "rejected" | "dispatched";
  approvedItems: number;
  dispatchedItems: number;
  itemCount: number;
};

type ActivityItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
  timeLabel: string;
};

type DashboardPayload = {
  groupedOrders: GroupedOrder[];
  totalCustomers: number;
  recentOrders: number;
  pendingApprovals: number;
  pendingDispatches: number;
  rejectedOrders: number;
  monthValue: number;
  monthOrders: number;
  completedOrders: number;
  averageOrderValue: number;
  openPipelineValue: number;
  currentOrder: GroupedOrder | null;
  recentActivities: ActivityItem[];
  lastUpdatedAt: string;
};

type OverlayName = "profile" | "search" | "notifications" | null;

type ShortcutItem = {
  id: string;
  label: string;
  hint: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  managerOnly?: boolean;
  keywords: string;
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
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
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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

const formatGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good Morning";
  }
  if (hour < 17) {
    return "Good Afternoon";
  }
  return "Good Evening";
};

const toNumber = (amount: string) => {
  const parsed = Number.parseFloat((amount || "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
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
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
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

  const pendingApprovals = groupedOrders.filter(
    (order) => order.status === "pending" || order.status === "rejected"
  ).length;
  const pendingDispatches = groupedOrders.filter(
    (order) => order.status === "approved"
  ).length;
  const rejectedOrders = groupedOrders.filter(
    (order) => order.status === "rejected"
  ).length;
  const recentOrders = groupedOrders.filter(
    (order) => order.createdAt && order.createdAt >= sevenDaysAgo
  ).length;
  const completedOrders = groupedOrders.filter(
    (order) => order.status === "approved" || order.status === "dispatched"
  ).length;
  const monthOrders = groupedOrders.filter(
    (order) =>
      order.createdAt &&
      order.createdAt.getMonth() === currentMonth &&
      order.createdAt.getFullYear() === currentYear
  );
  const monthValue = monthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const averageOrderValue =
    groupedOrders.length > 0
      ? groupedOrders.reduce((sum, order) => sum + order.totalAmount, 0) /
        groupedOrders.length
      : 0;
  const openPipelineValue = groupedOrders
    .filter((order) => order.status !== "dispatched")
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const recentActivities: ActivityItem[] = groupedOrders.slice(0, 4).map((order) => {
    let title = "New order submitted";
    let description = `${order.orderId} for ${order.customerName}`;
    let icon: keyof typeof Ionicons.glyphMap = "document-text-outline";
    let iconColor = "#0066FF";

    if (order.status === "dispatched") {
      title = "Order dispatched";
      description = `${order.customerName} moved to fulfillment`;
      icon = "paper-plane-outline";
      iconColor = "#22c55e";
    } else if (order.status === "approved") {
      title = "Order approved";
      description = `${order.customerName} is ready for dispatch`;
      icon = "checkmark-circle-outline";
      iconColor = "#22c55e";
    } else if (order.status === "rejected") {
      title = "Order blocked";
      description = `${order.customerName} needs manager follow-up`;
      icon = "alert-circle-outline";
      iconColor = "#ef4444";
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
    groupedOrders,
    totalCustomers: uniqueCustomers.size,
    recentOrders,
    pendingApprovals,
    pendingDispatches,
    rejectedOrders,
    monthValue,
    monthOrders: monthOrders.length,
    completedOrders,
    averageOrderValue,
    openPipelineValue,
    currentOrder,
    recentActivities,
    lastUpdatedAt: new Date().toISOString(),
  };
};

const MetricCard = ({
  label,
  value,
  accentColor,
  colors,
}: {
  label: string;
  value: string;
  accentColor: string;
  colors: AppColors;
}) => {
  const styles = StyleSheet.create({
    card: {
      width: "48%",
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 1,
      shadowRadius: 24,
      elevation: 9,
    },
    arrow: {
      position: "absolute",
      top: 14,
      right: 14,
    },
    value: {
      color: colors.text,
      fontSize: 28,
      fontFamily: omaTypography.extrabold,
      letterSpacing: -0.8,
      marginBottom: 4,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: omaTypography.medium,
      lineHeight: 16,
      paddingRight: 18,
    },
  });

  return (
    <View style={styles.card}>
      <Ionicons
        color={accentColor}
        name="arrow-up-outline"
        size={16}
        style={styles.arrow}
      />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const QuickActionButton = ({
  label,
  icon,
  onPress,
  primary,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  colors: AppColors;
}) => {
  const styles = StyleSheet.create({
    wrapper: {
      alignItems: "center",
      width: "23%",
    },
    button: {
      width: 60,
      height: 60,
      borderRadius: 22,
      backgroundColor: primary ? "#111111" : colors.card,
      borderWidth: 1,
      borderColor: primary ? "#111111" : colors.border,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 1,
      shadowRadius: 22,
      elevation: 8,
      marginBottom: 10,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: omaTypography.semibold,
      textAlign: "center",
    },
  });

  return (
    <TouchableOpacity onPress={onPress} style={styles.wrapper}>
      <View style={styles.button}>
        <Ionicons
          color={primary ? "#ffffff" : colors.text}
          name={icon}
          size={22}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
};

export default function MainScreen() {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const greeting = useMemo(() => formatGreeting(), []);
  const monthLabel = useMemo(() => monthLabelFormatter.format(new Date()), []);
  const shellWidth = Math.min(width - 32, 380);

  const completionRate = useMemo(() => {
    if (!payload?.groupedOrders.length) {
      return 0;
    }

    return Math.round(
      (payload.completedOrders / payload.groupedOrders.length) * 100
    );
  }, [payload]);

  const quickActions = useMemo(() => {
    const base = [
      {
        id: "history",
        label: "History",
        icon: "time-outline" as const,
        route: "/(app)/my-orders",
        primary: true,
      },
      {
        id: "new",
        label: "New Order",
        icon: "document-text-outline" as const,
        route: "/(app)/new-order",
      },
      {
        id: "ledger",
        label: userRole === "Manager" ? "Ledger" : "Customers",
        icon: "wallet-outline" as const,
        route:
          userRole === "Manager" ? "/(app)/customer-summary" : "/(app)/customers",
      },
      {
        id: "catalog",
        label: "Catalog",
        icon: "scan-outline" as const,
        route: "/(app)/products",
      },
    ];

    return base;
  }, [userRole]);

  const metricCards = useMemo(() => {
    if (!payload) {
      return [];
    }

    return [
      {
        id: "completed",
        label: "Completed Orders",
        value: String(payload.completedOrders),
        accentColor: colors.accentBlue,
      },
      {
        id: "approvals",
        label: "Pending Approvals",
        value: String(payload.pendingApprovals),
        accentColor: colors.accentOrange,
      },
      {
        id: "dispatches",
        label: "Ready for Dispatch",
        value: String(payload.pendingDispatches),
        accentColor: colors.accentGreen,
      },
      {
        id: "customers",
        label: "Active Customers",
        value: String(payload.totalCustomers),
        accentColor: colors.accentPurple,
      },
      {
        id: "avg",
        label: "Avg Order Value",
        value: `₹${formatIndianCurrency(payload.averageOrderValue)}`,
        accentColor: colors.accentBlue,
      },
      {
        id: "recent",
        label: "Orders in 7 Days",
        value: String(payload.recentOrders),
        accentColor: colors.accentOrange,
      },
    ];
  }, [colors, payload]);

  const searchShortcuts = useMemo<ShortcutItem[]>(() => {
    return [
      {
        id: "home",
        label: "Dashboard",
        hint: "Overview, metrics, and activity",
        route: "/(app)/main",
        icon: "home-outline",
        primary: true,
        keywords: "home dashboard metrics activity revenue",
      },
      {
        id: "new-order",
        label: "New Order",
        hint: "Create a fresh sales order",
        route: "/(app)/new-order",
        icon: "document-text-outline",
        keywords: "new order create sales order",
      },
      {
        id: "process",
        label: "Process Orders",
        hint: "Dispatch and fulfillment queue",
        route: "/(app)/process-orders",
        icon: "clipboard-outline",
        keywords: "process dispatch fulfillment queue",
      },
      {
        id: "products",
        label: "Products",
        hint: "Browse product catalog",
        route: "/(app)/products",
        icon: "cube-outline",
        keywords: "products catalog sku items",
      },
      {
        id: "customers",
        label: "Customers",
        hint: "Contacts and order history",
        route: "/(app)/customers",
        icon: "people-outline",
        keywords: "customers clients ledger history contacts",
      },
      {
        id: "orders",
        label: "My Orders",
        hint: "Search submitted orders",
        route: "/(app)/my-orders",
        icon: "receipt-outline",
        keywords: "orders history submitted order status",
      },
      {
        id: "analytics",
        label: "Analytics",
        hint: "Performance snapshots",
        route: "/(app)/analytics",
        icon: "stats-chart-outline",
        keywords: "analytics stats charts insights",
      },
      {
        id: "approvals",
        label: "Approvals",
        hint: "Manager review queue",
        route: "/(app)/order-approval",
        icon: "shield-checkmark-outline",
        keywords: "manager approval pending blocked",
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

  const notificationItems = useMemo(() => {
    if (!payload) {
      return [];
    }

    const items = [];

    if (userRole === "Manager" && payload.pendingApprovals > 0) {
      items.push({
        id: "approvals",
        title: "Executive Approvals",
        body: `${payload.pendingApprovals} orders need your authorization.`,
        time: "Action needed",
        icon: "shield-checkmark-outline" as const,
        color: colors.accentRed,
        bg: isDark ? "rgba(239,68,68,0.10)" : "#fff1f2",
        route: "/(app)/order-approval",
      });
    }

    if (payload.pendingDispatches > 0) {
      items.push({
        id: "dispatches",
        title: "Dispatch Queue",
        body: `${payload.pendingDispatches} approved orders are ready to move.`,
        time: "Fulfillment",
        icon: "cube-outline" as const,
        color: colors.accentBlue,
        bg: isDark ? "rgba(0,102,255,0.10)" : "#eef5ff",
        route: "/(app)/process-orders",
      });
    }

    if (payload.rejectedOrders > 0) {
      items.push({
        id: "blocked",
        title: "Blocked Orders",
        body: `${payload.rejectedOrders} rejected orders need follow-up.`,
        time: "Review",
        icon: "alert-circle-outline" as const,
        color: colors.accentOrange,
        bg: isDark ? "rgba(251,146,60,0.10)" : "#fff7ed",
        route: "/(app)/order-approval",
      });
    }

    items.push({
      id: "recent",
      title: "Recent Activity",
      body: `${payload.recentOrders} orders landed in the last 7 days.`,
      time: "Live feed",
      icon: "checkmark-circle-outline" as const,
      color: colors.accentGreen,
      bg: isDark ? "rgba(34,197,94,0.10)" : "#ecfdf3",
      route: "/(app)/my-orders",
    });

    return items;
  }, [colors, isDark, payload, userRole]);

  const profileActions = useMemo(
    () => [
      {
        id: "theme",
        label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: isDark ? "sunny-outline" : "moon-outline",
        onPress: () => {
          toggleTheme();
          setActiveOverlay(null);
        },
      },
      {
        id: "history",
        label: "My Orders",
        icon: "time-outline",
        onPress: () => {
          setActiveOverlay(null);
          router.push("/(app)/my-orders");
        },
      },
      {
        id: "clients",
        label: "Customers",
        icon: "people-outline",
        onPress: () => {
          setActiveOverlay(null);
          router.push("/(app)/customers");
        },
      },
      {
        id: "logout",
        label: "Sign Out",
        icon: "log-out-outline",
        onPress: async () => {
          setActiveOverlay(null);
          await AsyncStorage.multiRemove(["userRole", "lastLogin"]);
          router.replace("/(auth)/login");
        },
      },
    ],
    [isDark, toggleTheme]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          paddingBottom: 32,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 300,
          backgroundColor: isDark ? "rgba(0,102,255,0.08)" : "#eef2f6",
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: insets.top + 12,
          paddingHorizontal: 24,
          paddingBottom: 8,
        },
        profileButton: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          flexShrink: 1,
        },
        avatar: {
          width: 52,
          height: 52,
          borderRadius: 26,
          borderWidth: 3,
          borderColor: colors.card,
          backgroundColor: isDark ? colors.surfaceVariant : "#dcecff",
          justifyContent: "center",
          alignItems: "center",
        },
        avatarText: {
          color: colors.primary,
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 3,
        },
        headerTitle: {
          color: colors.text,
          fontSize: 17,
          fontFamily: omaTypography.extrabold,
        },
        iconActions: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginLeft: 16,
        },
        iconButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 8,
        },
        notificationDot: {
          position: "absolute",
          top: 11,
          right: 11,
          width: 9,
          height: 9,
          borderRadius: 4.5,
          backgroundColor: colors.accentRed,
          borderWidth: 2,
          borderColor: colors.card,
        },
        heroCard: {
          marginHorizontal: 24,
          marginTop: 10,
          backgroundColor: colors.card,
          borderRadius: 32,
          padding: 26,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 36,
          elevation: 12,
          overflow: "hidden",
        },
        heroBlur: {
          position: "absolute",
          top: -40,
          right: -30,
          width: 190,
          height: 190,
          borderRadius: 95,
          backgroundColor: isDark ? "rgba(0,102,255,0.12)" : "#e9f1ff",
        },
        heroTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        },
        heroLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        heroChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isDark ? "rgba(34,197,94,0.18)" : "#d6f5df",
          backgroundColor: isDark ? "rgba(34,197,94,0.10)" : "#eefcf2",
        },
        heroChipText: {
          color: colors.accentGreen,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        heroValue: {
          color: colors.text,
          fontSize: 40,
          letterSpacing: -1.8,
          fontFamily: omaTypography.extrabold,
        },
        heroSubtext: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        heroDivider: {
          marginTop: 22,
          paddingTop: 18,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        rowBetween: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        smallLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        smallValue: {
          color: colors.text,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        progressTrack: {
          marginTop: 10,
          height: 6,
          borderRadius: 999,
          backgroundColor: colors.cardMuted,
          overflow: "hidden",
        },
        progressBar: {
          height: "100%",
          borderRadius: 999,
          backgroundColor: "#111111",
        },
        heroFootnote: {
          marginTop: 10,
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
          textAlign: "right",
        },
        section: {
          paddingHorizontal: 24,
          marginTop: 28,
        },
        sectionTitle: {
          color: colors.text,
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
          marginBottom: 16,
        },
        sectionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        },
        sectionAction: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        quickActionsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
        },
        actionCard: {
          backgroundColor: colors.card,
          borderRadius: 24,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
          marginBottom: 12,
        },
        actionCardDark: {
          backgroundColor: "#111111",
          borderColor: "#111111",
        },
        actionRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        },
        actionIcon: {
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${colors.accentBlue}14`,
        },
        actionIconDark: {
          backgroundColor: "rgba(255,255,255,0.10)",
        },
        actionCardTitle: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.extrabold,
          marginBottom: 2,
        },
        actionCardTitleDark: {
          color: "#ffffff",
        },
        actionCardBody: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 17,
          fontFamily: omaTypography.medium,
          paddingRight: 6,
        },
        actionCardBodyDark: {
          color: "rgba(255,255,255,0.68)",
        },
        actionChevron: {
          marginLeft: "auto",
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.cardMuted,
          alignItems: "center",
          justifyContent: "center",
        },
        actionChevronDark: {
          backgroundColor: "rgba(255,255,255,0.10)",
        },
        metricsGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        },
        activeOrderCard: {
          backgroundColor: colors.card,
          borderRadius: 32,
          padding: 22,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 10,
        },
        activeTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 22,
        },
        activeEyebrow: {
          color: colors.textSecondary,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        activeId: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
        },
        activeStatusChip: {
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 7,
        },
        activeStatusText: {
          color: "#ffffff",
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        activeMeta: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 24,
        },
        activeMetaLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        activeMetaValue: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.bold,
        },
        activeMetaSub: {
          marginTop: 4,
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
        },
        timelineShell: {
          position: "relative",
          paddingTop: 4,
        },
        timelineTrack: {
          position: "absolute",
          top: 18,
          left: 16,
          right: 16,
          height: 3,
          borderRadius: 999,
          backgroundColor: colors.cardMuted,
        },
        timelineProgress: {
          position: "absolute",
          top: 18,
          left: 16,
          height: 3,
          borderRadius: 999,
          backgroundColor: "#111111",
        },
        timelineRow: {
          flexDirection: "row",
          justifyContent: "space-between",
        },
        timelineItem: {
          width: "33%",
          alignItems: "center",
        },
        timelineDot: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#111111",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        },
        timelineDotPending: {
          backgroundColor: colors.card,
          borderWidth: 4,
          borderColor: colors.cardMuted,
        },
        timelineTitle: {
          marginTop: 12,
          color: colors.text,
          fontSize: 10,
          fontFamily: omaTypography.bold,
        },
        timelineSub: {
          marginTop: 4,
          color: colors.textSecondary,
          fontSize: 10,
          textAlign: "center",
          fontFamily: omaTypography.medium,
        },
        activityItem: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        activityLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          flex: 1,
          paddingRight: 12,
        },
        activityIcon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        activityTitle: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        activityBody: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
        },
        activityTime: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
        },
        footerHint: {
          marginTop: 18,
          paddingHorizontal: 24,
          textAlign: "center",
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        centered: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 32,
        },
        loadingText: {
          marginTop: 14,
          color: colors.textSecondary,
          fontSize: 14,
          fontFamily: omaTypography.medium,
          textAlign: "center",
        },
        overlayBackdrop: {
          flex: 1,
          backgroundColor: "rgba(9,17,31,0.34)",
        },
        profileModalCard: {
          position: "absolute",
          top: insets.top + 82,
          left: 24,
          width: Math.min(width - 48, 270),
          backgroundColor: colors.card,
          borderRadius: 26,
          padding: 10,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 32,
          elevation: 16,
        },
        profileHeader: {
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          marginBottom: 6,
        },
        profileName: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.extrabold,
          marginBottom: 3,
        },
        profileEmail: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        roleChip: {
          marginTop: 10,
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 10,
          backgroundColor: isDark ? "rgba(0,102,255,0.10)" : "#eef5ff",
          borderWidth: 1,
          borderColor: isDark ? "rgba(0,102,255,0.20)" : "#dbe8ff",
        },
        roleChipText: {
          color: colors.primary,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
        },
        overlayAction: {
          height: 48,
          borderRadius: 14,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 12,
        },
        overlayActionText: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
        },
        searchModalCard: {
          position: "absolute",
          top: insets.top + 12,
          alignSelf: "center",
          width: shellWidth,
          maxHeight: "76%",
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 24 },
          shadowOpacity: 1,
          shadowRadius: 40,
          elevation: 18,
          overflow: "hidden",
        },
        searchInputRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        searchInput: {
          flex: 1,
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.bold,
          paddingHorizontal: 12,
          paddingVertical: 12,
        },
        searchSection: {
          padding: 14,
        },
        searchSectionTitle: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 10,
        },
        searchShortcutGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        },
        searchShortcut: {
          width: "48%",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 14,
          marginBottom: 10,
        },
        searchShortcutDark: {
          backgroundColor: "#111111",
          borderColor: "#111111",
        },
        searchShortcutIcon: {
          width: 28,
          height: 28,
          borderRadius: 10,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDark ? colors.surfaceVariant : "#eef2f6",
          marginBottom: 10,
        },
        searchShortcutLabel: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
          marginBottom: 3,
        },
        searchShortcutHint: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
          lineHeight: 15,
        },
        searchResultItem: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        searchResultLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          flex: 1,
          paddingRight: 10,
        },
        searchResultIcon: {
          width: 40,
          height: 40,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : "#eef2f6",
        },
        searchResultTitle: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
          marginBottom: 2,
        },
        searchResultHint: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
        },
        notificationsModalCard: {
          position: "absolute",
          top: insets.top + 72,
          right: 24,
          width: Math.min(width - 48, 320),
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 32,
          elevation: 16,
          overflow: "hidden",
        },
        notificationsHeader: {
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        notificationsTitle: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
        },
        notificationsAction: {
          color: colors.primary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        notificationsBody: {
          paddingHorizontal: 10,
          paddingBottom: 12,
          gap: 6,
        },
        notificationCard: {
          borderRadius: 20,
          padding: 14,
        },
        notificationRow: {
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
        },
        notificationIcon: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        },
        notificationTitle: {
          color: colors.text,
          fontSize: 12,
          fontFamily: omaTypography.bold,
          marginBottom: 2,
        },
        notificationBody: {
          color: colors.textSecondary,
          fontSize: 11,
          lineHeight: 15,
          fontFamily: omaTypography.medium,
        },
        notificationTime: {
          color: colors.textSecondary,
          fontSize: 10,
          marginTop: 6,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        },
      }),
    [colors, insets.top, isDark, shellWidth, width]
  );

  if (loading && !payload) {
    return (
      <View style={styles.container}>
        <View style={styles.topGlow} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>
            Loading the new OMA dashboard...
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
          <Ionicons
            color={colors.textSecondary}
            name="cloud-offline-outline"
            size={44}
          />
          <Text style={styles.loadingText}>
            Dashboard data is unavailable right now.
          </Text>
        </View>
      </View>
    );
  }

  const activeOrderProgress =
    payload.currentOrder?.status === "dispatched"
      ? 1
      : payload.currentOrder?.status === "approved"
      ? 0.66
      : 0.33;

  const activeOrderStatusColor =
    payload.currentOrder?.status === "dispatched"
      ? colors.accentGreen
      : payload.currentOrder?.status === "approved"
      ? colors.accentBlue
      : payload.currentOrder?.status === "rejected"
      ? colors.accentRed
      : colors.accentOrange;

  const activeOrderStatusLabel =
    payload.currentOrder?.status === "dispatched"
      ? "Dispatched"
      : payload.currentOrder?.status === "approved"
      ? "Processing"
      : payload.currentOrder?.status === "rejected"
      ? "Blocked"
      : "In Review";

  const unreadNotificationCount = notificationItems.length;

  return (
    <View style={styles.container}>
      <View style={styles.topGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDashboard(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() =>
              setActiveOverlay((current) =>
                current === "profile" ? null : "profile"
              )
            }
            style={styles.profileButton}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(userRole || "O").slice(0, 1).toUpperCase()}
              </Text>
            </View>

            <View>
              <Text style={styles.eyebrow}>{greeting}</Text>
              <Text style={styles.headerTitle}>
                {userRole === "Manager" ? "Manager Dashboard" : "Sales Workspace"}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.iconActions}>
            <TouchableOpacity
              onPress={() =>
                setActiveOverlay((current) =>
                  current === "search" ? null : "search"
                )
              }
              style={styles.iconButton}
            >
              <Ionicons color={colors.text} name="search-outline" size={18} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                setActiveOverlay((current) =>
                  current === "notifications" ? null : "notifications"
                )
              }
              style={styles.iconButton}
            >
              <Ionicons
                color={colors.text}
                name="notifications-outline"
                size={18}
              />
              {unreadNotificationCount > 0 && <View style={styles.notificationDot} />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroBlur} />
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>{monthLabel}</Text>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>{completionRate}% complete</Text>
            </View>
          </View>

          <Text style={styles.heroValue}>
            ₹{formatIndianCurrency(payload.monthValue)}
          </Text>
          <Text style={styles.heroSubtext}>Monthly booked revenue</Text>

          <View style={styles.heroDivider}>
            <View style={styles.rowBetween}>
              <Text style={styles.smallLabel}>Open pipeline</Text>
              <Text style={styles.smallValue}>{completionRate}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${Math.max(8, completionRate)}%` },
                ]}
              />
            </View>
            <Text style={styles.heroFootnote}>
              ₹{formatIndianCurrency(payload.openPipelineValue)} still in active
              pipeline
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action) => (
              <QuickActionButton
                key={action.id}
                colors={colors}
                icon={action.icon}
                label={action.label}
                onPress={() => router.push(action.route)}
                primary={action.primary}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Hub</Text>

          <TouchableOpacity
            onPress={() => router.push("/(app)/process-orders")}
            style={styles.actionCard}
          >
            <View style={styles.actionRow}>
              <View style={styles.actionIcon}>
                <Ionicons
                  color={colors.accentBlue}
                  name="clipboard-outline"
                  size={20}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionCardTitle}>Pending sign-offs</Text>
                <Text style={styles.actionCardBody}>
                  {payload.pendingDispatches} approved orders are waiting for dispatch.
                </Text>
              </View>
              <View style={styles.actionChevron}>
                <Ionicons
                  color={colors.textSecondary}
                  name="chevron-forward"
                  size={16}
                />
              </View>
            </View>
          </TouchableOpacity>

          {userRole === "Manager" && (
            <TouchableOpacity
              onPress={() => router.push("/(app)/order-approval")}
              style={[styles.actionCard, styles.actionCardDark]}
            >
              <View style={styles.actionRow}>
                <View style={[styles.actionIcon, styles.actionIconDark]}>
                  <Ionicons
                    color={colors.accentRed}
                    name="shield-checkmark-outline"
                    size={20}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.actionCardTitle, styles.actionCardTitleDark]}
                  >
                    Executive approvals
                  </Text>
                  <Text
                    style={[styles.actionCardBody, styles.actionCardBodyDark]}
                  >
                    {payload.pendingApprovals} orders need manager review right now.
                  </Text>
                </View>
                <View
                  style={[styles.actionChevron, styles.actionChevronDark]}
                >
                  <Ionicons color="#ffffff" name="chevron-forward" size={16} />
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <Text style={styles.sectionAction}>Live snapshot</Text>
          </View>

          <View style={styles.metricsGrid}>
            {metricCards.map((metric) => (
              <MetricCard
                key={metric.id}
                accentColor={metric.accentColor}
                colors={colors}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </View>
        </View>

        {payload.currentOrder && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Order</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/my-orders")}>
                <Text style={styles.sectionAction}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activeOrderCard}>
              <View style={styles.activeTop}>
                <View>
                  <Text style={styles.activeEyebrow}>Order ID</Text>
                  <Text style={styles.activeId}>{payload.currentOrder.orderId}</Text>
                </View>

                <View
                  style={[
                    styles.activeStatusChip,
                    { backgroundColor: activeOrderStatusColor },
                  ]}
                >
                  <Text style={styles.activeStatusText}>
                    {activeOrderStatusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.activeMeta}>
                <View>
                  <Text style={styles.activeMetaLabel}>Customer</Text>
                  <Text style={styles.activeMetaValue}>
                    {payload.currentOrder.customerName}
                  </Text>
                  <Text style={styles.activeMetaSub}>
                    ₹{formatIndianCurrency(payload.currentOrder.totalAmount)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.activeMetaLabel}>Updated</Text>
                  <Text style={styles.activeMetaValue}>
                    {formatTimeAgo(payload.currentOrder.createdAt)}
                  </Text>
                  <Text style={styles.activeMetaSub}>
                    {payload.currentOrder.dispatchedItems}/
                    {payload.currentOrder.itemCount} items shipped
                  </Text>
                </View>
              </View>

              <View style={styles.timelineShell}>
                <View style={styles.timelineTrack} />
                <View
                  style={[
                    styles.timelineProgress,
                    { width: `${Math.max(20, activeOrderProgress * 100 - 7)}%` },
                  ]}
                />

                <View style={styles.timelineRow}>
                  {[
                    {
                      id: "drafted",
                      label: "Drafted",
                      active: true,
                      sub: formatShortDateTime(payload.currentOrder.createdAt),
                      color: "#111111",
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
                          ? colors.accentOrange
                          : "#111111",
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
                          !step.active && styles.timelineDotPending,
                          step.active && { backgroundColor: step.color },
                        ]}
                      >
                        {step.active ? (
                          <Ionicons color="#ffffff" name="checkmark" size={14} />
                        ) : (
                          <View
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: colors.textPlaceholder,
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
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activities</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/my-orders")}>
              <Text style={styles.sectionAction}>See all</Text>
            </TouchableOpacity>
          </View>

          {payload.recentActivities.map((activity, index) => (
            <View
              key={activity.id}
              style={[
                styles.activityItem,
                index === payload.recentActivities.length - 1 && {
                  borderBottomWidth: 0,
                },
              ]}
            >
              <View style={styles.activityLeft}>
                <View style={styles.activityIcon}>
                  <Ionicons
                    color={activity.iconColor}
                    name={activity.icon}
                    size={18}
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

        <Text style={styles.footerHint}>
          Last login: {formatShortDateTime(parseIndianDate(lastLogin || ""))} ·
          Last sync {formatTimeAgo(parseIndianDate(payload.lastUpdatedAt))}
        </Text>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setActiveOverlay(null)}
        transparent
        visible={activeOverlay === "profile"}
      >
        <Pressable
          onPress={() => setActiveOverlay(null)}
          style={styles.overlayBackdrop}
        >
          <Pressable style={styles.profileModalCard}>
            <View style={styles.profileHeader}>
              <Text style={styles.profileName}>{userRole} Workspace</Text>
              <Text style={styles.profileEmail}>oma.local.session</Text>
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>
                  {userRole === "Manager" ? "Senior Manager" : "Sales User"}
                </Text>
              </View>
            </View>

            {profileActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                onPress={action.onPress}
                style={styles.overlayAction}
              >
                <Ionicons color={colors.textSecondary} name={action.icon} size={18} />
                <Text style={styles.overlayActionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setActiveOverlay(null)}
        transparent
        visible={activeOverlay === "search"}
      >
        <Pressable
          onPress={() => setActiveOverlay(null)}
          style={styles.overlayBackdrop}
        >
          <Pressable style={styles.searchModalCard}>
            <View style={styles.searchInputRow}>
              <Ionicons color={colors.primary} name="search-outline" size={20} />
              <TextInput
                autoFocus
                onChangeText={setSearchQuery}
                placeholder="Search screens, flows, or actions..."
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
                value={searchQuery}
              />
              <TouchableOpacity onPress={() => setActiveOverlay(null)}>
                <Ionicons
                  color={colors.textSecondary}
                  name="close-circle-outline"
                  size={20}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!searchQuery.trim() ? (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>Quick Actions</Text>
                  <View style={styles.searchShortcutGrid}>
                    {searchShortcuts.slice(0, 4).map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => {
                          setActiveOverlay(null);
                          router.push(item.route);
                        }}
                        style={[
                          styles.searchShortcut,
                          item.primary && styles.searchShortcutDark,
                        ]}
                      >
                        <View style={styles.searchShortcutIcon}>
                          <Ionicons
                            color={item.primary ? "#111111" : colors.text}
                            name={item.icon}
                            size={18}
                          />
                        </View>
                        <Text
                          style={[
                            styles.searchShortcutLabel,
                            item.primary && { color: "#ffffff" },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={[
                            styles.searchShortcutHint,
                            item.primary && { color: "rgba(255,255,255,0.72)" },
                          ]}
                        >
                          {item.hint}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>Results</Text>
                  {filteredSearchShortcuts.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        setActiveOverlay(null);
                        setSearchQuery("");
                        router.push(item.route);
                      }}
                      style={styles.searchResultItem}
                    >
                      <View style={styles.searchResultLeft}>
                        <View style={styles.searchResultIcon}>
                          <Ionicons color={colors.text} name={item.icon} size={18} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultTitle}>{item.label}</Text>
                          <Text style={styles.searchResultHint}>{item.hint}</Text>
                        </View>
                      </View>
                      <Ionicons
                        color={colors.textSecondary}
                        name="chevron-forward"
                        size={16}
                      />
                    </TouchableOpacity>
                  ))}
                  {filteredSearchShortcuts.length === 0 && (
                    <View style={{ paddingVertical: 24 }}>
                      <Text style={styles.loadingText}>
                        No matches for "{searchQuery}".
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setActiveOverlay(null)}
        transparent
        visible={activeOverlay === "notifications"}
      >
        <Pressable
          onPress={() => setActiveOverlay(null)}
          style={styles.overlayBackdrop}
        >
          <Pressable style={styles.notificationsModalCard}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setActiveOverlay(null)}>
                <Text style={styles.notificationsAction}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.notificationsBody}>
              {notificationItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => {
                    setActiveOverlay(null);
                    router.push(item.route);
                  }}
                  style={[styles.notificationCard, { backgroundColor: item.bg }]}
                >
                  <View style={styles.notificationRow}>
                    <View style={styles.notificationIcon}>
                      <Ionicons color={item.color} name={item.icon} size={16} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notificationTitle}>{item.title}</Text>
                      <Text style={styles.notificationBody}>{item.body}</Text>
                      <Text style={styles.notificationTime}>{item.time}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
