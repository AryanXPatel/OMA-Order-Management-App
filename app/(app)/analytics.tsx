import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import OmaFloatingNav, {
  FLOATING_NAV_SPACE,
} from "../components/oma/OmaFloatingNav";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useFeedback } from "../context/FeedbackContext";
import { ThemeContext } from "../context/ThemeContext";
import {
  apiCache,
  BACKEND_URL,
  fetchWithRetry,
  preloadData,
  wakeUpServer,
} from "../utils/apiManager";
import { omaTypography } from "../utils/typography";

type Timeframe = "MTD" | "QTD" | "YTD";
type ViewMode = "financial" | "team" | "ops";

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
  dispatchAt: Date | null;
  totalAmount: number;
  status: "pending" | "approved" | "rejected" | "dispatched";
  itemCount: number;
  approvedItems: number;
  dispatchedItems: number;
  cycleHours: number | null;
};

type AnalyticsPayload = {
  groupedOrders: GroupedOrder[];
  lastUpdatedAt: string;
};

type SummaryMetrics = {
  orderCount: number;
  totalValue: number;
  openValue: number;
  approvedValue: number;
  dispatchedValue: number;
  pendingValue: number;
  blockedValue: number;
  completedOrders: number;
  pendingApprovals: number;
  pendingDispatches: number;
  rejectedOrders: number;
  activeCustomers: number;
  activeReps: number;
  averageOrderValue: number;
  dispatchRate: number;
  completionRate: number;
  approvalRate: number;
  blockedRate: number;
  avgDispatchHours: number | null;
};

type RepInsight = {
  name: string;
  totalAmount: number;
  orderCount: number;
  dispatchedCount: number;
  approvedCount: number;
  share: number;
  relativeLead: number;
};

type SourceInsight = {
  label: string;
  totalAmount: number;
  orderCount: number;
  share: number;
};

type ActivityInsight = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "green" | "orange" | "red";
};

type ToneKey = "blue" | "green" | "orange" | "red";

type TrendPoint = {
  label: string;
  value: number;
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
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

const toNumber = (amount: string) => {
  const parsed = Number.parseFloat((amount || "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
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

const formatCurrencyLabel = (value: number) => `₹${formatIndianCurrency(value)}`;

const formatRatio = (value: number) => `${Math.round(value)}%`;

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

const formatDuration = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) {
    return "No dispatch";
  }

  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingAfterDays = totalMinutes % (24 * 60);
  const displayHours = Math.floor(remainingAfterDays / 60);
  const minutes = remainingAfterDays % 60;

  if (days > 0) {
    return `${days}d ${displayHours}h`;
  }
  if (displayHours > 0) {
    return `${displayHours}h ${minutes}m`;
  }
  return `${minutes}m`;
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

const buildGroupedOrders = (rows: OrderRow[]) => {
  const groupedOrderMap: Record<string, OrderRow[]> = {};

  rows.forEach((row) => {
    if (!row.orderId) {
      return;
    }

    groupedOrderMap[row.orderId] ??= [];
    groupedOrderMap[row.orderId].push(row);
  });

  return Object.entries(groupedOrderMap)
    .map(([orderId, orderRows]) => {
      const first = orderRows[0];
      const createdAt = parseIndianDate(first.orderTime || first.sysTime);

      const dispatchDates = orderRows
        .map((row) => parseIndianDate(row.dispatchTime))
        .filter((date): date is Date => Boolean(date));
      const dispatchAt =
        dispatchDates.sort((a, b) => b.getTime() - a.getTime())[0] || null;

      const cycleHours =
        createdAt && dispatchAt
          ? Math.max(0, (dispatchAt.getTime() - createdAt.getTime()) / 36e5)
          : null;

      return {
        orderId,
        customerName: first.customerName || "Unknown customer",
        user: first.user || "Unassigned",
        source: first.source || "Direct",
        createdAt,
        dispatchAt,
        totalAmount: orderRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
        status: deriveOrderStatus(orderRows),
        itemCount: orderRows.length,
        approvedItems: orderRows.filter((row) => row.approved === "Y").length,
        dispatchedItems: orderRows.filter((row) => row.dispatched === "Y").length,
        cycleHours,
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
};

const hydrateGroupedOrders = (orders: GroupedOrder[]) =>
  orders.map((order) => ({
    ...order,
    createdAt: order.createdAt ? new Date(order.createdAt) : null,
    dispatchAt: order.dispatchAt ? new Date(order.dispatchAt) : null,
  }));

const getQuarter = (date: Date) => Math.floor(date.getMonth() / 3);

const filterOrdersByTimeframe = (orders: GroupedOrder[], timeframe: Timeframe) => {
  const now = new Date();

  return orders.filter((order) => {
    if (!order.createdAt) {
      return false;
    }

    const createdAt = order.createdAt;

    if (timeframe === "MTD") {
      return (
        createdAt.getMonth() === now.getMonth() &&
        createdAt.getFullYear() === now.getFullYear()
      );
    }

    if (timeframe === "QTD") {
      return (
        createdAt.getFullYear() === now.getFullYear() &&
        getQuarter(createdAt) === getQuarter(now)
      );
    }

    return createdAt.getFullYear() === now.getFullYear();
  });
};

const buildSummaryMetrics = (orders: GroupedOrder[]): SummaryMetrics => {
  const customers = new Set<string>();
  const reps = new Set<string>();

  let totalValue = 0;
  let openValue = 0;
  let approvedValue = 0;
  let dispatchedValue = 0;
  let pendingValue = 0;
  let blockedValue = 0;
  let completedOrders = 0;
  let pendingApprovals = 0;
  let pendingDispatches = 0;
  let rejectedOrders = 0;

  const dispatchHours = orders
    .map((order) => order.cycleHours)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  orders.forEach((order) => {
    totalValue += order.totalAmount;

    if (order.customerName) {
      customers.add(order.customerName);
    }
    if (order.user) {
      reps.add(order.user);
    }

    if (order.status !== "dispatched") {
      openValue += order.totalAmount;
    }

    if (order.status === "approved") {
      approvedValue += order.totalAmount;
      pendingDispatches += 1;
      completedOrders += 1;
    } else if (order.status === "dispatched") {
      dispatchedValue += order.totalAmount;
      completedOrders += 1;
    } else if (order.status === "pending") {
      pendingValue += order.totalAmount;
      pendingApprovals += 1;
    } else if (order.status === "rejected") {
      blockedValue += order.totalAmount;
      rejectedOrders += 1;
      pendingApprovals += 1;
    }
  });

  const orderCount = orders.length || 0;

  return {
    orderCount,
    totalValue,
    openValue,
    approvedValue,
    dispatchedValue,
    pendingValue,
    blockedValue,
    completedOrders,
    pendingApprovals,
    pendingDispatches,
    rejectedOrders,
    activeCustomers: customers.size,
    activeReps: reps.size,
    averageOrderValue: orderCount > 0 ? totalValue / orderCount : 0,
    dispatchRate: orderCount > 0 ? (orders.filter((order) => order.status === "dispatched").length / orderCount) * 100 : 0,
    completionRate: orderCount > 0 ? (completedOrders / orderCount) * 100 : 0,
    approvalRate: orderCount > 0 ? (pendingDispatches / orderCount) * 100 : 0,
    blockedRate: orderCount > 0 ? (rejectedOrders / orderCount) * 100 : 0,
    avgDispatchHours:
      dispatchHours.length > 0
        ? dispatchHours.reduce((sum, value) => sum + value, 0) / dispatchHours.length
        : null,
  };
};

const buildRepInsights = (orders: GroupedOrder[]): RepInsight[] => {
  const repMap = new Map<
    string,
    { totalAmount: number; orderCount: number; dispatchedCount: number; approvedCount: number }
  >();

  orders.forEach((order) => {
    const key = order.user || "Unassigned";
    const current =
      repMap.get(key) || {
        totalAmount: 0,
        orderCount: 0,
        dispatchedCount: 0,
        approvedCount: 0,
      };

    current.totalAmount += order.totalAmount;
    current.orderCount += 1;
    if (order.status === "dispatched") {
      current.dispatchedCount += 1;
    }
    if (order.status === "approved" || order.status === "dispatched") {
      current.approvedCount += 1;
    }

    repMap.set(key, current);
  });

  const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const topAmount = Math.max(...Array.from(repMap.values()).map((item) => item.totalAmount), 0);

  return Array.from(repMap.entries())
    .map(([name, value]) => ({
      name,
      totalAmount: value.totalAmount,
      orderCount: value.orderCount,
      dispatchedCount: value.dispatchedCount,
      approvedCount: value.approvedCount,
      share: totalAmount > 0 ? value.totalAmount / totalAmount : 0,
      relativeLead: topAmount > 0 ? value.totalAmount / topAmount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const normalizeSourceLabel = (source: string) => {
  if (!source) {
    return "Direct";
  }

  const normalized = source.trim().toLowerCase();
  if (normalized === "whatsapp") {
    return "WhatsApp";
  }
  if (normalized === "email") {
    return "Email";
  }
  if (normalized === "phone") {
    return "Phone";
  }
  return source;
};

const buildSourceInsights = (orders: GroupedOrder[]): SourceInsight[] => {
  const sourceMap = new Map<string, { totalAmount: number; orderCount: number }>();

  orders.forEach((order) => {
    const key = normalizeSourceLabel(order.source);
    const current = sourceMap.get(key) || { totalAmount: 0, orderCount: 0 };

    current.totalAmount += order.totalAmount;
    current.orderCount += 1;

    sourceMap.set(key, current);
  });

  const totalOrders = orders.length;

  return Array.from(sourceMap.entries())
    .map(([label, value]) => ({
      label,
      totalAmount: value.totalAmount,
      orderCount: value.orderCount,
      share: totalOrders > 0 ? value.orderCount / totalOrders : 0,
    }))
    .sort((a, b) => b.orderCount - a.orderCount);
};

const buildActivityInsights = (orders: GroupedOrder[]): ActivityInsight[] =>
  orders.slice(0, 4).map((order) => {
    if (order.status === "dispatched") {
      return {
        id: order.orderId,
        title: "Order dispatched",
        detail: `${order.customerName} moved to dispatch`,
        timeLabel: formatTimeAgo(order.dispatchAt || order.createdAt),
        icon: "paper-plane-outline",
        tone: "green",
      };
    }

    if (order.status === "approved") {
      return {
        id: order.orderId,
        title: "Approval cleared",
        detail: `${order.customerName} is ready to move`,
        timeLabel: formatTimeAgo(order.createdAt),
        icon: "checkmark-circle-outline",
        tone: "blue",
      };
    }

    if (order.status === "rejected") {
      return {
        id: order.orderId,
        title: "Executive follow-up",
        detail: `${order.customerName} needs a manager response`,
        timeLabel: formatTimeAgo(order.createdAt),
        icon: "alert-circle-outline",
        tone: "red",
      };
    }

    return {
      id: order.orderId,
      title: "New order in flow",
      detail: `${order.customerName} entered the queue`,
      timeLabel: formatTimeAgo(order.createdAt),
      icon: "document-text-outline",
      tone: "orange",
    };
  });

const buildTrendSeries = (
  orders: GroupedOrder[],
  timeframe: Timeframe,
  mode: ViewMode
): TrendPoint[] => {
  const now = new Date();

  if (timeframe === "MTD") {
    const days = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (5 - index));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    return days.map((bucketStart) => {
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(23, 59, 59, 999);

      const bucketOrders = orders.filter((order) => {
        if (!order.createdAt) {
          return false;
        }
        return order.createdAt >= bucketStart && order.createdAt <= bucketEnd;
      });

      return {
        label: weekdayFormatter.format(bucketStart),
        value: getSeriesValue(bucketOrders, mode),
      };
    });
  }

  const quarterStartMonth = getQuarter(now) * 3;
  const monthBuckets =
    timeframe === "QTD"
      ? Array.from(
          { length: now.getMonth() - quarterStartMonth + 1 },
          (_, index) => new Date(now.getFullYear(), quarterStartMonth + index, 1)
        )
      : Array.from(
          { length: now.getMonth() + 1 },
          (_, index) => new Date(now.getFullYear(), index, 1)
        );

  return monthBuckets.map((date) => {

    const bucketOrders = orders.filter((order) => {
      if (!order.createdAt) {
        return false;
      }

      return (
        order.createdAt.getMonth() === date.getMonth() &&
        order.createdAt.getFullYear() === date.getFullYear()
      );
    });

    return {
      label: monthLabelFormatter.format(date),
      value: getSeriesValue(bucketOrders, mode),
    };
  });
};

const getSeriesValue = (orders: GroupedOrder[], mode: ViewMode) => {
  if (mode === "financial") {
    return orders.reduce((sum, order) => sum + order.totalAmount, 0);
  }

  if (mode === "team") {
    return orders.length;
  }

  return orders.filter((order) => order.status === "dispatched").length;
};

const buildSparklinePath = (points: TrendPoint[]) => {
  if (!points.length) {
    return "";
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 150 : (index / (points.length - 1)) * 300;
      const y = 66 - ((point.value - min) / range) * 48;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

const getSparklineMarker = (points: TrendPoint[]) => {
  if (!points.length) {
    return { x: 150, y: 66 };
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const lastValue = points[points.length - 1]?.value || 0;

  return {
    x: points.length === 1 ? 150 : 300,
    y: 66 - ((lastValue - min) / range) * 48,
  };
};

const buildSparklineArea = (path: string) => {
  if (!path) {
    return "";
  }
  return `${path} L 300 80 L 0 80 Z`;
};

const formatLastUpdated = (isoString: string | null) => {
  if (!isoString) {
    return "Not synced";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "Not synced";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const timeframeLabelMap: Record<Timeframe, string> = {
  MTD: "Month to date",
  QTD: "Quarter to date",
  YTD: "Year to date",
};

const viewToneMap: Record<ViewMode, { accent: string; fillStart: string; fillEnd: string }> = {
  financial: {
    accent: "#22c55e",
    fillStart: "rgba(34,197,94,0.34)",
    fillEnd: "rgba(34,197,94,0)",
  },
  team: {
    accent: "#67e8f9",
    fillStart: "rgba(103,232,249,0.30)",
    fillEnd: "rgba(103,232,249,0)",
  },
  ops: {
    accent: "#fb923c",
    fillStart: "rgba(251,146,60,0.32)",
    fillEnd: "rgba(251,146,60,0)",
  },
};

const toneStyles: Record<ToneKey, { bg: string; text: string; dot: string }> = {
  blue: { bg: "rgba(0,102,255,0.12)", text: "#0066FF", dot: "#0066FF" },
  green: { bg: "rgba(34,197,94,0.14)", text: "#16a34a", dot: "#22c55e" },
  orange: { bg: "rgba(251,146,60,0.14)", text: "#ea580c", dot: "#fb923c" },
  red: { bg: "rgba(239,68,68,0.12)", text: "#dc2626", dot: "#ef4444" },
};

export default function AnalyticsScreen() {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [timeframe, setTimeframe] = useState<Timeframe>("QTD");
  const [view, setView] = useState<ViewMode>("financial");
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isWideLayout = width >= 420;

  const loadAnalytics = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const cachedPayload = apiCache.get("analyticsPayload") as AnalyticsPayload | null;
        if (!forceRefresh && cachedPayload?.groupedOrders) {
          setPayload({
            ...cachedPayload,
            groupedOrders: hydrateGroupedOrders(cachedPayload.groupedOrders),
          });
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

        const nextPayload: AnalyticsPayload = {
          groupedOrders: buildGroupedOrders(rows),
          lastUpdatedAt: new Date().toISOString(),
        };

        setPayload(nextPayload);
        apiCache.set("analyticsPayload", nextPayload);
      } catch (error: any) {
        showFeedback({
          type: "error",
          title: "Analytics Error",
          message:
            error?.message || "Could not load analytics. Pull down to retry.",
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
      loadAnalytics();
    }, [loadAnalytics])
  );

  const filteredOrders = useMemo(
    () => filterOrdersByTimeframe(payload?.groupedOrders || [], timeframe),
    [payload?.groupedOrders, timeframe]
  );

  const summary = useMemo(() => buildSummaryMetrics(filteredOrders), [filteredOrders]);
  const repInsights = useMemo(() => buildRepInsights(filteredOrders), [filteredOrders]);
  const sourceInsights = useMemo(
    () => buildSourceInsights(filteredOrders).slice(0, 3),
    [filteredOrders]
  );
  const activityInsights = useMemo(
    () => buildActivityInsights(filteredOrders),
    [filteredOrders]
  );

  const financialSeries = useMemo(
    () => buildTrendSeries(filteredOrders, timeframe, "financial"),
    [filteredOrders, timeframe]
  );
  const teamSeries = useMemo(
    () => buildTrendSeries(filteredOrders, timeframe, "team"),
    [filteredOrders, timeframe]
  );
  const opsSeries = useMemo(
    () => buildTrendSeries(filteredOrders, timeframe, "ops"),
    [filteredOrders, timeframe]
  );

  const financialPath = useMemo(() => buildSparklinePath(financialSeries), [financialSeries]);
  const teamPath = useMemo(() => buildSparklinePath(teamSeries), [teamSeries]);
  const opsPath = useMemo(() => buildSparklinePath(opsSeries), [opsSeries]);

  const financialArea = useMemo(() => buildSparklineArea(financialPath), [financialPath]);
  const teamArea = useMemo(() => buildSparklineArea(teamPath), [teamPath]);
  const opsArea = useMemo(() => buildSparklineArea(opsPath), [opsPath]);
  const financialMarker = useMemo(
    () => getSparklineMarker(financialSeries),
    [financialSeries]
  );
  const teamMarker = useMemo(() => getSparklineMarker(teamSeries), [teamSeries]);
  const opsMarker = useMemo(() => getSparklineMarker(opsSeries), [opsSeries]);

  const statusExposure = useMemo(() => {
    const total = Math.max(summary.totalValue, 1);

    return [
      {
        label: "Closed",
        value: summary.dispatchedValue,
        amountLabel: formatCurrencyLabel(summary.dispatchedValue),
        shareLabel: formatRatio((summary.dispatchedValue / total) * 100),
        tone: "green" as const,
      },
      {
        label: "Ready",
        value: summary.approvedValue,
        amountLabel: formatCurrencyLabel(summary.approvedValue),
        shareLabel: formatRatio((summary.approvedValue / total) * 100),
        tone: "blue" as const,
      },
      {
        label: "Attention",
        value: summary.pendingValue + summary.blockedValue,
        amountLabel: formatCurrencyLabel(summary.pendingValue + summary.blockedValue),
        shareLabel: formatRatio(
          ((summary.pendingValue + summary.blockedValue) / total) * 100
        ),
        tone: "orange" as const,
      },
    ];
  }, [summary]);

  const queuePressure = useMemo(() => {
    const total = Math.max(summary.orderCount, 1);

    return [
      {
        label: "Approval load",
        value: summary.pendingApprovals,
        detail: `${summary.pendingApprovals} orders waiting`,
        progress: summary.pendingApprovals / total,
        tone: "orange" as const,
      },
      {
        label: "Ready to dispatch",
        value: summary.pendingDispatches,
        detail: `${summary.pendingDispatches} orders staged`,
        progress: summary.pendingDispatches / total,
        tone: "blue" as const,
      },
      {
        label: "Blocked",
        value: summary.rejectedOrders,
        detail: `${summary.rejectedOrders} orders need review`,
        progress: summary.rejectedOrders / total,
        tone: "red" as const,
      },
    ];
  }, [summary]);

  const financialStatCards = useMemo(
    () => [
      {
        label: "Completed orders",
        value: String(summary.completedOrders),
        detail: `${formatRatio(summary.completionRate)} completion`,
        tone: "blue" as const,
      },
      {
        label: "Pending approvals",
        value: String(summary.pendingApprovals),
        detail: `${formatCurrencyLabel(summary.pendingValue)} in queue`,
        tone: "orange" as const,
      },
      {
        label: "Ready dispatch",
        value: String(summary.pendingDispatches),
        detail: `${formatCurrencyLabel(summary.approvedValue)} approved`,
        tone: "green" as const,
      },
      {
        label: "Active customers",
        value: String(summary.activeCustomers),
        detail: `${summary.orderCount} orders in ${timeframe}`,
        tone: "red" as const,
      },
    ],
    [summary, timeframe]
  );

  const teamStatCards = useMemo(
    () => [
      {
        label: "Active reps",
        value: String(summary.activeReps),
        detail: `${summary.orderCount} orders covered`,
        tone: "blue" as const,
      },
      {
        label: "Avg rep ticket",
        value:
          repInsights.length > 0
            ? formatCurrencyLabel(summary.totalValue / repInsights.length)
            : "₹0",
        detail: "Booked value per active rep",
        tone: "green" as const,
      },
      {
        label: "Top channel",
        value: sourceInsights[0]?.label || "Direct",
        detail: sourceInsights[0]
          ? `${formatRatio(sourceInsights[0].share * 100)} of order flow`
          : "No source data",
        tone: "orange" as const,
      },
      {
        label: "Customer reach",
        value: String(summary.activeCustomers),
        detail: "Distinct accounts in motion",
        tone: "red" as const,
      },
    ],
    [repInsights.length, sourceInsights, summary]
  );

  const opsStatCards = useMemo(
    () => [
      {
        label: "Dispatch rate",
        value: formatRatio(summary.dispatchRate),
        detail: `${summary.completedOrders} orders closed or staged`,
        tone: "green" as const,
      },
      {
        label: "Approval rate",
        value: formatRatio(summary.approvalRate),
        detail: `${summary.pendingDispatches} orders ready to move`,
        tone: "blue" as const,
      },
      {
        label: "Blocked rate",
        value: formatRatio(summary.blockedRate),
        detail: `${summary.rejectedOrders} orders need escalation`,
        tone: "red" as const,
      },
      {
        label: "Open value",
        value: formatCurrencyLabel(summary.openValue),
        detail: "Not fully dispatched yet",
        tone: "orange" as const,
      },
    ],
    [summary]
  );

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
          backgroundColor: isDark
            ? "rgba(0,102,255,0.18)"
            : "rgba(0,102,255,0.08)",
        },
        scrollContent: {
          paddingTop: insets.top + 10,
          paddingBottom: FLOATING_NAV_SPACE + Math.max(insets.bottom, 12) + 12,
        },
        screenShell: {
          width: "100%",
          maxWidth: 520,
          alignSelf: "center",
          paddingHorizontal: 16,
        },
        headerShell: {
          marginBottom: 18,
        },
        headerRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 14,
        },
        headerMeta: {
          flex: 1,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        headerTitleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        },
        headerIconBubble: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        headerTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 26,
          letterSpacing: -1,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          paddingRight: 12,
        },
        iconButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        badgeRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        badge: {
          paddingHorizontal: 13,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 18,
          elevation: 6,
        },
        badgeLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 2,
        },
        badgeValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        controlCard: {
          backgroundColor: colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 18,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        controlLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 10,
        },
        segmentedRow: {
          flexDirection: "row",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          padding: 4,
          borderRadius: 20,
          marginBottom: 14,
        },
        segmentedRowSpacious: {
          marginBottom: 0,
        },
        segmentButton: {
          flex: 1,
          borderRadius: 16,
          paddingVertical: 11,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        segmentButtonActive: {
          backgroundColor: isDark ? colors.text : "#111111",
        },
        segmentButtonText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        segmentButtonTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        heroCard: {
          backgroundColor: isDark ? "#0d1524" : "#111111",
          borderRadius: 30,
          paddingTop: 20,
          paddingHorizontal: 20,
          paddingBottom: 14,
          marginBottom: 14,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: isDark ? 0.22 : 0.18,
          shadowRadius: 30,
          elevation: 10,
        },
        heroGlow: {
          position: "absolute",
          top: -28,
          right: -12,
          width: 170,
          height: 170,
          borderRadius: 85,
        },
        heroRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
        },
        heroLabel: {
          color: "rgba(255,255,255,0.70)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
        },
        heroChip: {
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderWidth: 1,
        },
        heroChipText: {
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.5,
        },
        heroValue: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 38,
          letterSpacing: -1.5,
          marginBottom: 6,
        },
        heroValueAccent: {
          color: "#fb923c",
        },
        heroSubline: {
          color: "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          marginBottom: 18,
          paddingRight: 20,
        },
        heroStatRow: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 14,
        },
        heroStatCard: {
          flex: 1,
          borderRadius: 18,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        heroStatLabel: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        heroStatValue: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        sparklineShell: {
          height: 86,
          marginHorizontal: -20,
          marginBottom: -14,
        },
        sectionCard: {
          backgroundColor: colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 22,
          elevation: 8,
        },
        sectionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 12,
        },
        sectionTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
        },
        sectionHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        exposureTrack: {
          flexDirection: "row",
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 16,
        },
        exposureSegment: {
          height: "100%",
        },
        exposureGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        exposureItem: {
          flexGrow: 1,
          minWidth: isWideLayout ? "31%" : "47.5%",
          borderRadius: 20,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        exposureTopRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        },
        exposureDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
        },
        exposureLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        },
        exposureValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          letterSpacing: -0.7,
          marginBottom: 4,
        },
        exposureMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        statGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
        },
        statCard: {
          width: isWideLayout ? "48.8%" : "48.1%",
          borderRadius: 22,
          padding: 16,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 7,
        },
        statIcon: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        },
        statValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          letterSpacing: -0.8,
          marginBottom: 4,
        },
        statLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        statDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        rowDivider: {
          height: 1,
          backgroundColor: colors.border,
          marginVertical: 16,
        },
        repRow: {
          marginBottom: 14,
        },
        repHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        },
        repIdentity: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flex: 1,
        },
        rankBubble: {
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        rankText: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 12,
        },
        repName: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        repMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginTop: 2,
        },
        repValueWrap: {
          alignItems: "flex-end",
        },
        repValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 14,
        },
        repShare: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginTop: 2,
        },
        progressTrack: {
          height: 8,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          overflow: "hidden",
        },
        progressFill: {
          height: "100%",
          borderRadius: 999,
        },
        pressureRow: {
          marginBottom: 14,
        },
        pressureTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        },
        pressureLabel: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        pressureValue: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        pressureDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginTop: 8,
        },
        channelRow: {
          marginBottom: 14,
        },
        channelHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 10,
        },
        channelLabel: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        channelMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        activityList: {
          gap: 12,
        },
        activityRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        },
        activityIconWrap: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
        },
        activityContent: {
          flex: 1,
          paddingTop: 2,
        },
        activityTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          marginBottom: 2,
        },
        activityDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
          marginBottom: 4,
        },
        activityTime: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
        },
        emptyCard: {
          backgroundColor: colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 34,
          paddingHorizontal: 24,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 22,
          elevation: 8,
        },
        emptyTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          marginTop: 14,
          marginBottom: 6,
        },
        emptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          textAlign: "center",
        },
      }),
    [colors, insets.bottom, insets.top, isDark, isWideLayout]
  );

  const renderHero = ({
    mode,
    label,
    chip,
    value,
    subtitle,
    primaryStatLabel,
    primaryStatValue,
    secondaryStatLabel,
    secondaryStatValue,
    path,
    area,
    marker,
    accentValue,
  }: {
    mode: ViewMode;
    label: string;
    chip: string;
    value: string;
    subtitle: string;
    primaryStatLabel: string;
    primaryStatValue: string;
    secondaryStatLabel: string;
    secondaryStatValue: string;
    path: string;
    area: string;
    marker: { x: number; y: number };
    accentValue?: boolean;
  }) => {
    const tone = viewToneMap[mode];
    const gradientId = `analyticsGradient-${mode}`;

    return (
      <View style={styles.heroCard}>
        <View
          style={[
            styles.heroGlow,
            {
              backgroundColor:
                mode === "financial"
                  ? "rgba(34,197,94,0.18)"
                  : mode === "team"
                  ? "rgba(0,102,255,0.24)"
                  : "rgba(251,146,60,0.18)",
            },
          ]}
        />

        <View style={styles.heroRow}>
          <Text style={styles.heroLabel}>{label}</Text>
          <View
            style={[
              styles.heroChip,
              {
                backgroundColor:
                  mode === "financial"
                    ? "rgba(34,197,94,0.16)"
                    : mode === "team"
                    ? "rgba(0,102,255,0.18)"
                    : "rgba(251,146,60,0.16)",
                borderColor:
                  mode === "financial"
                    ? "rgba(34,197,94,0.20)"
                    : mode === "team"
                    ? "rgba(0,102,255,0.26)"
                    : "rgba(251,146,60,0.20)",
              },
            ]}
          >
            <Text
              style={[
                styles.heroChipText,
                { color: mode === "team" ? "#bfdbfe" : tone.accent },
              ]}
            >
              {chip}
            </Text>
          </View>
        </View>

        <Text style={[styles.heroValue, accentValue && styles.heroValueAccent]}>
          {value}
        </Text>
        <Text style={styles.heroSubline}>{subtitle}</Text>

        <View style={styles.heroStatRow}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>{primaryStatLabel}</Text>
            <Text style={styles.heroStatValue}>{primaryStatValue}</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>{secondaryStatLabel}</Text>
            <Text style={styles.heroStatValue}>{secondaryStatValue}</Text>
          </View>
        </View>

        <View style={styles.sparklineShell}>
          <Svg height="100%" viewBox="0 0 300 80" width="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
                <Stop offset="0%" stopColor={tone.fillStart} />
                <Stop offset="100%" stopColor={tone.fillEnd} />
              </LinearGradient>
            </Defs>

            {area ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
            {path ? (
              <>
                <Path
                  d={path}
                  fill="none"
                  stroke={tone.accent}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                />
                <Circle
                  cx={marker.x}
                  cy={marker.y}
                  fill={isDark ? "#0d1524" : "#111111"}
                  r={4}
                  stroke={tone.accent}
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Svg>
        </View>
      </View>
    );
  };

  const renderStatGrid = (
    cards: { label: string; value: string; detail: string; tone: ToneKey }[]
  ) => (
    <View style={styles.statGrid}>
      {cards.map((card) => {
        const tone = toneStyles[card.tone];
        return (
          <View key={card.label} style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor: tone.bg,
                },
              ]}
            >
              <Ionicons
                color={tone.text}
                name="arrow-up-outline"
                size={16}
              />
            </View>
            <Text style={styles.statLabel}>{card.label}</Text>
            <Text style={styles.statValue}>{card.value}</Text>
            <Text style={styles.statDetail}>{card.detail}</Text>
          </View>
        );
      })}
    </View>
  );

  const renderFinancialView = () => (
    <>
      {renderHero({
        mode: "financial",
        label: `Booked Value (${timeframe})`,
        chip: `${summary.orderCount} orders`,
        value: formatCurrencyLabel(summary.totalValue),
        subtitle: `Open pipeline ${formatCurrencyLabel(summary.openValue)} | Avg ticket ${formatCurrencyLabel(summary.averageOrderValue)}`,
        primaryStatLabel: "Completion",
        primaryStatValue: formatRatio(summary.completionRate),
        secondaryStatLabel: "Customers",
        secondaryStatValue: String(summary.activeCustomers),
        path: financialPath,
        area: financialArea,
        marker: financialMarker,
      })}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Order value exposure</Text>
          <Text style={styles.sectionHint}>{timeframeLabelMap[timeframe]}</Text>
        </View>

        <View style={styles.exposureTrack}>
          {statusExposure.map((segment) => {
            const tone = toneStyles[segment.tone];
            return (
              <View
                key={segment.label}
                style={[
                  styles.exposureSegment,
                  {
                    flex: Math.max(segment.value, 1),
                    backgroundColor: tone.dot,
                  },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.exposureGrid}>
          {statusExposure.map((segment) => {
            const tone = toneStyles[segment.tone];
            return (
              <View key={segment.label} style={styles.exposureItem}>
                <View style={styles.exposureTopRow}>
                  <View
                    style={[styles.exposureDot, { backgroundColor: tone.dot }]}
                  />
                  <Text style={styles.exposureLabel}>{segment.label}</Text>
                </View>
                <Text style={styles.exposureValue}>{segment.amountLabel}</Text>
                <Text style={styles.exposureMeta}>{segment.shareLabel} of flow</Text>
              </View>
            );
          })}
        </View>
      </View>

      {renderStatGrid(financialStatCards)}
      {renderActivityCard("Live finance pulse")}
    </>
  );

  const renderTeamView = () => (
    <>
      {renderHero({
        mode: "team",
        label: `Sales Force (${timeframe})`,
        chip: `${summary.activeReps} reps active`,
        value: formatCurrencyLabel(summary.totalValue),
        subtitle: `Customer reach ${summary.activeCustomers} | Avg rep book ${repInsights.length ? formatCurrencyLabel(summary.totalValue / repInsights.length) : "₹0"}`,
        primaryStatLabel: "Avg ticket",
        primaryStatValue: formatCurrencyLabel(summary.averageOrderValue),
        secondaryStatLabel: "Order pace",
        secondaryStatValue: `${summary.orderCount} orders`,
        path: teamPath,
        area: teamArea,
        marker: teamMarker,
      })}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rep contribution</Text>
          <Text style={styles.sectionHint}>
            {repInsights.length || 0} contributors
          </Text>
        </View>

        {repInsights.slice(0, 4).map((rep, index) => {
          const tone =
            index === 0
              ? toneStyles.green
              : index === 1
              ? toneStyles.blue
              : index === 2
              ? toneStyles.orange
              : toneStyles.red;

          return (
            <View
              key={`${rep.name}-${index}`}
              style={[
                styles.repRow,
                index === Math.min(repInsights.length, 4) - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={styles.repHeader}>
                <View style={styles.repIdentity}>
                  <View
                    style={[
                      styles.rankBubble,
                      { backgroundColor: tone.bg, borderWidth: 0 },
                    ]}
                  >
                    <Text style={[styles.rankText, { color: tone.text }]}>
                      {index + 1}
                    </Text>
                  </View>

                  <View>
                    <Text style={styles.repName}>{rep.name}</Text>
                    <Text style={styles.repMeta}>
                      {rep.orderCount} orders | {rep.dispatchedCount} dispatched
                    </Text>
                  </View>
                </View>

                <View style={styles.repValueWrap}>
                  <Text style={styles.repValue}>
                    {formatCurrencyLabel(rep.totalAmount)}
                  </Text>
                  <Text style={styles.repShare}>
                    {formatRatio(rep.share * 100)} of booked value
                  </Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(rep.relativeLead * 100, 6)}%`,
                      backgroundColor: tone.dot,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      {renderStatGrid(teamStatCards)}
      {renderActivityCard("Team movement")}
    </>
  );

  const renderOpsView = () => (
    <>
      {renderHero({
        mode: "ops",
        label: "Order to Dispatch",
        chip: `${formatRatio(summary.dispatchRate)} dispatched`,
        value: formatDuration(summary.avgDispatchHours),
        subtitle: `Ready queue ${summary.pendingDispatches} | Blocked ${summary.rejectedOrders}`,
        primaryStatLabel: "Approval load",
        primaryStatValue: String(summary.pendingApprovals),
        secondaryStatLabel: "Open value",
        secondaryStatValue: formatCurrencyLabel(summary.openValue),
        path: opsPath,
        area: opsArea,
        marker: opsMarker,
        accentValue: true,
      })}

      {renderStatGrid(opsStatCards)}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Queue pressure</Text>
          <Text style={styles.sectionHint}>Where flow is stacking up</Text>
        </View>

        {queuePressure.map((item, index) => {
          const tone = toneStyles[item.tone];
          return (
            <View
              key={item.label}
              style={[
                styles.pressureRow,
                index === queuePressure.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={styles.pressureTop}>
                <Text style={styles.pressureLabel}>{item.label}</Text>
                <Text style={styles.pressureValue}>{item.value}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(item.progress * 100, item.value ? 8 : 0)}%`,
                      backgroundColor: tone.dot,
                    },
                  ]}
                />
              </View>
              <Text style={styles.pressureDetail}>{item.detail}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Channel load</Text>
          <Text style={styles.sectionHint}>Source mix this period</Text>
        </View>

        {sourceInsights.length ? (
          sourceInsights.map((source, index) => {
            const tone =
              index === 0
                ? toneStyles.blue
                : index === 1
                ? toneStyles.orange
                : toneStyles.green;

            return (
              <View
                key={source.label}
                style={[
                  styles.channelRow,
                  index === sourceInsights.length - 1 && { marginBottom: 0 },
                ]}
              >
                <View style={styles.channelHeader}>
                  <Text style={styles.channelLabel}>{source.label}</Text>
                  <Text style={styles.channelMeta}>
                    {source.orderCount} orders | {formatCurrencyLabel(source.totalAmount)}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(source.share * 100, 8)}%`,
                        backgroundColor: tone.dot,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.statDetail}>No channel distribution available yet.</Text>
        )}
      </View>

      {renderActivityCard("Ops pulse")}
    </>
  );

  const renderActivityCard = (title: string) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionHint}>
          Updated {formatLastUpdated(payload?.lastUpdatedAt || null)}
        </Text>
      </View>

      {activityInsights.length ? (
        <View style={styles.activityList}>
          {activityInsights.map((activity) => {
            const tone = toneStyles[activity.tone];
            return (
              <View key={activity.id} style={styles.activityRow}>
                <View
                  style={[
                    styles.activityIconWrap,
                    { backgroundColor: tone.bg },
                  ]}
                >
                  <Ionicons
                    color={tone.text}
                    name={activity.icon}
                    size={18}
                  />
                </View>

                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activityDetail}>{activity.detail}</Text>
                  <Text style={styles.activityTime}>{activity.timeLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.statDetail}>
          No recent activity in this period yet.
        </Text>
      )}
    </View>
  );

  if (loading && !payload) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.topGlow} />
        <LoadingIndicator message="Loading analytics..." showTips={true} />
        <OmaFloatingNav />
      </View>
    );
  }

  const selectedViewContent =
    view === "financial"
      ? renderFinancialView()
      : view === "team"
      ? renderTeamView()
      : renderOpsView();

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={() => loadAnalytics(true)}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenShell}>
          <View style={styles.headerShell}>
            <View style={styles.headerRow}>
              <View style={styles.headerMeta}>
                <Text style={styles.eyebrow}>Executive Analytics</Text>
                <View style={styles.headerTitleRow}>
                  <View style={styles.headerIconBubble}>
                    <Ionicons
                      color={colors.primary}
                      name="stats-chart-outline"
                      size={18}
                    />
                  </View>
                  <Text style={styles.headerTitle}>Exec Board</Text>
                </View>
                <Text style={styles.headerSubtitle}>
                  Prototype hierarchy, live Expo data. Segment by financials, team,
                  and operations without changing the order-table contract.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={toggleTheme}
                style={styles.iconButton}
              >
                <Ionicons
                  color={colors.text}
                  name={isDark ? "sunny-outline" : "moon-outline"}
                  size={18}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>Period</Text>
                <Text style={styles.badgeValue}>{timeframeLabelMap[timeframe]}</Text>
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>Last updated</Text>
                <Text style={styles.badgeValue}>
                  {formatLastUpdated(payload?.lastUpdatedAt || null)}
                </Text>
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>Tracked orders</Text>
                <Text style={styles.badgeValue}>{summary.orderCount}</Text>
              </View>
            </View>
          </View>

          <View style={styles.controlCard}>
            <Text style={styles.controlLabel}>Timeframe</Text>
            <View style={styles.segmentedRow}>
              {(["MTD", "QTD", "YTD"] as Timeframe[]).map((item) => {
                const active = timeframe === item;
                return (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.88}
                    onPress={() => setTimeframe(item)}
                    style={[
                      styles.segmentButton,
                      active && styles.segmentButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentButtonText,
                        active && styles.segmentButtonTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.controlLabel}>Perspective</Text>
            <View style={[styles.segmentedRow, styles.segmentedRowSpacious]}>
              {[
                {
                  id: "financial" as const,
                  label: "Financials",
                  icon: "cash-outline" as const,
                },
                {
                  id: "team" as const,
                  label: "Sales Force",
                  icon: "people-outline" as const,
                },
                {
                  id: "ops" as const,
                  label: "Operations",
                  icon: "pulse-outline" as const,
                },
              ].map((item) => {
                const active = view === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.88}
                    onPress={() => setView(item.id)}
                    style={[
                      styles.segmentButton,
                      active && styles.segmentButtonActive,
                    ]}
                  >
                    <Ionicons
                      color={
                        active
                          ? isDark
                            ? colors.background
                            : "#ffffff"
                          : colors.textSecondary
                      }
                      name={item.icon}
                      size={14}
                    />
                    <Text
                      style={[
                        styles.segmentButtonText,
                        active && styles.segmentButtonTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {summary.orderCount > 0 ? (
            selectedViewContent
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons
                color={colors.textPlaceholder}
                name="stats-chart-outline"
                size={52}
              />
              <Text style={styles.emptyTitle}>No analytics in this period</Text>
              <Text style={styles.emptyBody}>
                Switch the timeframe or refresh once more after the backend wakes
                up. The screen is wired to the live order table, so it only shows
                data that exists in the current period.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <OmaFloatingNav />
    </View>
  );
}
