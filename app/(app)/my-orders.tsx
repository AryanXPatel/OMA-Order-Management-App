import React, { useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Alert,
  RefreshControl,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LoadingIndicator from "../components/LoadingIndicator";
import { FLOATING_NAV_SPACE } from "../components/oma/OmaFloatingNav";
import { ThemeContext } from "../context/ThemeContext";
import { BACKEND_URL, apiCache, fetchWithRetry } from "../utils/apiManager";
import { omaTypography } from "../utils/typography";

type FilterStatus = "all" | "pending" | "approved" | "rejected" | "dispatched";

type ApiOrderRow = {
  actualRowIndex: number;
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

type GroupedOrder = {
  orderId: string;
  date: string;
  customerName: string;
  user: string;
  source: string;
  items: OrderLineItem[];
  totalAmount: number;
  status: Exclude<FilterStatus, "all">;
  orderComments: string;
  managerComments: string;
  dispatchComments: string;
};

type OrderSection = {
  rawDate: string;
  title: string;
  count: number;
  data: GroupedOrder[];
};

type StatusPresentation = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const STATUS_PRESENTATION: Record<
  Exclude<FilterStatus, "all">,
  StatusPresentation
> = {
  pending: {
    label: "Processing",
    icon: "hourglass-outline",
    color: "#f59e0b",
  },
  approved: {
    label: "Approved",
    icon: "checkmark-circle-outline",
    color: "#0066FF",
  },
  rejected: {
    label: "Rejected",
    icon: "close-circle-outline",
    color: "#ef4444",
  },
  dispatched: {
    label: "Dispatched",
    icon: "paper-plane-outline",
    color: "#22c55e",
  },
};

const FILTER_OPTIONS: {
  id: FilterStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "all", label: "All", icon: "apps-outline" },
  { id: "pending", label: "Processing", icon: "hourglass-outline" },
  { id: "approved", label: "Approved", icon: "checkmark-circle-outline" },
  { id: "dispatched", label: "Dispatched", icon: "paper-plane-outline" },
  { id: "rejected", label: "Rejected", icon: "close-circle-outline" },
];

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

const parseDateValue = (value: string) => {
  if (!value) {
    return 0;
  }

  const [datePart, timePart = "", meridiem = ""] = value.trim().split(/\s+/);
  const [day, month, year] = datePart.split("/").map(Number);

  if (!day || !month || !year) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
  }

  let hours = 0;
  let minutes = 0;

  if (timePart.includes(":")) {
    const [parsedHours, parsedMinutes] = timePart.split(":").map(Number);
    hours = parsedHours || 0;
    minutes = parsedMinutes || 0;
  }

  const normalizedMeridiem = meridiem.toUpperCase();
  if (normalizedMeridiem === "PM" && hours < 12) {
    hours += 12;
  }
  if (normalizedMeridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return new Date(year, month - 1, day, hours, minutes).getTime();
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

const toNumber = (amount: string) => {
  const parsed = Number.parseFloat((amount || "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
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

const deriveOrderStatus = (
  items: OrderLineItem[]
): Exclude<FilterStatus, "all"> => {
  const anyRejected = items.some((item) => item.approved === "N");
  const allApproved = items.length > 0 && items.every((item) => item.approved === "Y");
  const allDispatched =
    items.length > 0 && items.every((item) => item.dispatched === true);

  if (anyRejected) {
    return "rejected";
  }
  if (allDispatched) {
    return "dispatched";
  }
  if (allApproved) {
    return "approved";
  }
  return "pending";
};

const buildPreviewText = (order: GroupedOrder) => {
  if (order.orderComments) {
    return order.orderComments;
  }

  if (order.managerComments) {
    return order.managerComments;
  }

  return order.items
    .slice(0, 2)
    .map((item) => item.productName)
    .filter(Boolean)
    .join(", ");
};

export default function MyOrdersScreen() {
  const { colors, theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeSurfaceColor = colors.navActive;
  const activeContentColor = isDark ? colors.background : colors.card;
  const activeAccentMuted = hexToRgba(activeContentColor, isDark ? 0.12 : 0.16);

  const [orders, setOrders] = useState<GroupedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const shellWidth = Math.min(width - 32, 460);

  useEffect(() => {
    const initialize = async () => {
      const storedRole = await AsyncStorage.getItem("userRole");
      setUserRole(storedRole || "");
      await loadOrders(storedRole);
    };

    initialize();
  }, []);

  const loadOrders = async (roleOverride?: string | null) => {
    try {
      setLoading(true);

      const cachedOrders = apiCache.get("myOrders") as GroupedOrder[] | null;
      if (cachedOrders) {
        setOrders(cachedOrders);
        setLoading(false);
      }

      const activeRole = roleOverride ?? (await AsyncStorage.getItem("userRole"));
      setUserRole(activeRole || "");

      if (!activeRole) {
        throw new Error("User not found. Please log in again.");
      }

      const response = await fetchWithRetry<{ values?: string[][] }>(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
        {},
        2,
        1500
      );

      const rows: ApiOrderRow[] = (response.data?.values || []).map((row, index) => ({
        actualRowIndex: index + 2,
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

      const visibleRows =
        activeRole === "Manager"
          ? rows
          : rows.filter((row) => row.user === activeRole);

      const groupedMap: Record<string, GroupedOrder> = {};

      visibleRows.forEach((row) => {
        if (!row.orderId) {
          return;
        }

        if (!groupedMap[row.orderId]) {
          groupedMap[row.orderId] = {
            orderId: row.orderId,
            date: row.orderTime || row.sysTime,
            customerName: row.customerName,
            user: row.user,
            source: row.source,
            items: [],
            totalAmount: 0,
            status: "pending",
            orderComments: row.orderComments,
            managerComments: row.managerComments,
            dispatchComments: row.dispatchComments,
          };
        }

        const group = groupedMap[row.orderId];
        group.items.push({
          productName: row.productName,
          quantity: row.quantity,
          unit: row.unit,
          rate: row.rate,
          amount: row.amount,
          actualRowIndex: row.actualRowIndex,
          approved: row.approved,
          rejected: row.approved === "N",
          dispatched: row.dispatched === "Y",
          comments: row.dispatchComments,
          dispatchTime: row.dispatchTime,
        });
        group.totalAmount += toNumber(row.amount);
        group.status = deriveOrderStatus(group.items);
      });

      const nextOrders = Object.values(groupedMap).sort(
        (left, right) => parseDateValue(right.date) - parseDateValue(left.date)
      );

      setOrders(nextOrders);
      apiCache.set("myOrders", nextOrders);
    } catch (error: any) {
      const message =
        error?.message || "Could not load your order history. Please try again.";
      console.error("Failed to load orders", error);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    apiCache.set("myOrders", null);
    await loadOrders(userRole);
  };

  const filterCounts = useMemo(() => {
    return orders.reduce<Record<FilterStatus, number>>(
      (counts, order) => {
        counts.all += 1;
        counts[order.status] += 1;
        return counts;
      },
      {
        all: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        dispatched: 0,
      }
    );
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesFilter =
        filterStatus === "all" ? true : order.status === filterStatus;

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        order.orderId,
        order.customerName,
        order.orderComments,
        order.managerComments,
        order.dispatchComments,
        order.user,
        getSourceLabel(order.source),
        ...order.items.map((item) => item.productName),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [filterStatus, orders, searchQuery]);

  const sections = useMemo<OrderSection[]>(() => {
    const grouped = filteredOrders.reduce<Record<string, GroupedOrder[]>>(
      (result, order) => {
        const rawDate = (order.date || "Unknown date").split(" ")[0] || "Unknown date";
        result[rawDate] ??= [];
        result[rawDate].push(order);
        return result;
      },
      {}
    );

    return Object.keys(grouped)
      .sort((left, right) => parseDateValue(right) - parseDateValue(left))
      .map((rawDate) => ({
        rawDate,
        title: formatDateLabel(rawDate),
        count: grouped[rawDate].length,
        data: grouped[rawDate],
      }));
  }, [filteredOrders]);

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
        listContent: {
          paddingBottom: FLOATING_NAV_SPACE + Math.max(insets.bottom, 18),
        },
        headerShell: {
          alignSelf: "center",
          paddingTop: insets.top + 18,
          paddingBottom: 18,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontSize: 10,
          letterSpacing: 1.3,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 8,
        },
        headingRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        },
        titleWrap: {
          flex: 1,
        },
        title: {
          color: colors.text,
          fontSize: 28,
          lineHeight: 32,
          letterSpacing: -1.1,
          fontFamily: omaTypography.extrabold,
        },
        subtitle: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
          marginTop: 10,
        },
        resultsPill: {
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        resultsValue: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
          textAlign: "center",
        },
        resultsLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
          marginTop: 2,
        },
        searchShell: {
          marginTop: 22,
          height: 58,
          borderRadius: 29,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 18,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 10,
        },
        searchInput: {
          flex: 1,
          color: colors.text,
          fontSize: 14,
          paddingHorizontal: 12,
          fontFamily: omaTypography.bold,
        },
        searchPlaceholderPill: {
          borderRadius: 14,
          backgroundColor: colors.cardMuted,
          paddingHorizontal: 10,
          paddingVertical: 7,
        },
        searchPlaceholderText: {
          color: colors.textSecondary,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
        },
        filtersScrollContent: {
          paddingTop: 18,
          paddingBottom: 6,
          paddingRight: 8,
        },
        filterChip: {
          minHeight: 44,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginRight: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        activeFilterChip: {
          backgroundColor: activeSurfaceColor,
          borderColor: activeSurfaceColor,
        },
        filterChipLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        activeFilterChipLabel: {
          color: activeContentColor,
        },
        filterChipCount: {
          minWidth: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.cardMuted,
        },
        activeFilterChipCount: {
          backgroundColor: activeAccentMuted,
        },
        filterChipCountText: {
          color: colors.text,
          fontSize: 10,
          fontFamily: omaTypography.extrabold,
        },
        activeFilterChipCountText: {
          color: activeContentColor,
        },
        clearSearchButton: {
          width: 44,
          height: 44,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.cardMuted,
          marginRight: -6,
        },
        sectionHeader: {
          alignSelf: "center",
          marginTop: 6,
          marginBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        sectionHeaderCard: {
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        sectionDate: {
          color: colors.text,
          fontSize: 12,
          fontFamily: omaTypography.extrabold,
          textTransform: "uppercase",
          letterSpacing: 0.7,
        },
        sectionCount: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        orderCard: {
          borderRadius: 26,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 12,
        },
        orderCardTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        },
        orderId: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.extrabold,
          marginBottom: 4,
        },
        customerName: {
          color: colors.text,
          fontSize: 18,
          lineHeight: 22,
          fontFamily: omaTypography.extrabold,
        },
        statusPill: {
          minHeight: 34,
          borderRadius: 17,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        statusPillText: {
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        orderMetaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 10,
        },
        metaPill: {
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 7,
          backgroundColor: colors.cardMuted,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        metaPillText: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        previewText: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: omaTypography.medium,
          marginTop: 14,
        },
        metricPanel: {
          marginTop: 16,
          borderRadius: 20,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        },
        metricCell: {
          flex: 1,
        },
        metricLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        metricValue: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        footerRow: {
          marginTop: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        footerHint: {
          flex: 1,
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 17,
          fontFamily: omaTypography.medium,
          paddingRight: 16,
        },
        footerAction: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        },
        footerActionText: {
          color: colors.text,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
        },
        emptyShell: {
          alignSelf: "center",
          borderRadius: 28,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 24,
          paddingVertical: 28,
          alignItems: "center",
          marginTop: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 10,
        },
        emptyTitle: {
          color: colors.text,
          fontSize: 17,
          fontFamily: omaTypography.extrabold,
          marginTop: 14,
          marginBottom: 6,
          textAlign: "center",
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
      insets.bottom,
      insets.top,
      isDark,
    ]
  );

  const renderListHeader = () => {
    const activeFilterLabel =
      FILTER_OPTIONS.find((option) => option.id === filterStatus)?.label || "All";

    return (
      <View style={[styles.headerShell, { width: shellWidth }]}>
        <Text style={styles.eyebrow}>Order history</Text>

        <View style={styles.headingRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Review every submitted order.</Text>
            <Text style={styles.subtitle}>
              Search by customer or order ID, scan approval progress, and open a
              full detail view without leaving the live OMA flow.
            </Text>
          </View>

          <View style={styles.resultsPill}>
            <Text style={styles.resultsValue}>{filteredOrders.length}</Text>
            <Text style={styles.resultsLabel}>Visible</Text>
          </View>
        </View>

        <View style={styles.searchShell}>
          <Ionicons color={colors.textSecondary} name="search-outline" size={18} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchQuery}
            placeholder="Search by order ID or customer..."
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            value={searchQuery}
          />

          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearSearchButton}
            >
              <Ionicons
                color={colors.textSecondary}
                name="close-circle-outline"
                size={20}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.searchPlaceholderPill}>
              <Text style={styles.searchPlaceholderText}>{activeFilterLabel}</Text>
            </View>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.filtersScrollContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {FILTER_OPTIONS.map((option) => {
            const isActive = option.id === filterStatus;

            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setFilterStatus(option.id)}
                style={[styles.filterChip, isActive && styles.activeFilterChip]}
              >
                <Ionicons
                  color={isActive ? "#ffffff" : colors.textSecondary}
                  name={option.icon}
                  size={16}
                />
                <Text
                  style={[
                    styles.filterChipLabel,
                    isActive && styles.activeFilterChipLabel,
                  ]}
                >
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.filterChipCount,
                    isActive && styles.activeFilterChipCount,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipCountText,
                      isActive && styles.activeFilterChipCountText,
                    ]}
                  >
                    {filterCounts[option.id]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const openOrderDetails = async (order: GroupedOrder) => {
    try {
      await AsyncStorage.setItem("selectedOrder", JSON.stringify(order));
      router.push("/(app)/order-details");
    } catch (error) {
      console.error("Failed to open order details", error);
      Alert.alert("Error", "Could not open order details. Please try again.");
    }
  };

  const renderOrderCard = ({ item }: { item: GroupedOrder }) => {
    const status = STATUS_PRESENTATION[item.status];
    const approvedCount = item.items.filter((line) => line.approved === "Y").length;
    const dispatchedCount = item.items.filter((line) => line.dispatched).length;

    let progressLabel = "Awaiting manager approval";
    if (item.status === "approved") {
      progressLabel =
        dispatchedCount > 0
          ? `${dispatchedCount}/${item.items.length} line items dispatched`
          : "Approved and queued for dispatch";
    } else if (item.status === "dispatched") {
      progressLabel = `${item.items.length}/${item.items.length} line items dispatched`;
    } else if (item.status === "rejected") {
      progressLabel = item.managerComments || "Rejected during manager review";
    } else if (approvedCount > 0) {
      progressLabel = `${approvedCount}/${item.items.length} line items approved`;
    }

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openOrderDetails(item)}
        style={[styles.orderCard, { width: shellWidth, alignSelf: "center" }]}
      >
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>{item.orderId}</Text>
            <Text style={styles.customerName}>{item.customerName}</Text>
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: hexToRgba(status.color, isDark ? 0.16 : 0.1),
                borderColor: hexToRgba(status.color, isDark ? 0.24 : 0.15),
              },
            ]}
          >
            <Ionicons color={status.color} name={status.icon} size={14} />
            <Text style={[styles.statusPillText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.orderMetaRow}>
          <View style={styles.metaPill}>
            <Ionicons color={colors.textSecondary} name="calendar-outline" size={14} />
            <Text style={styles.metaPillText}>{formatDateLabel(item.date)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons color={colors.textSecondary} name="globe-outline" size={14} />
            <Text style={styles.metaPillText}>{getSourceLabel(item.source)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons color={colors.textSecondary} name="person-outline" size={14} />
            <Text style={styles.metaPillText}>{item.user || "User"}</Text>
          </View>
        </View>

        {!!buildPreviewText(item) && (
          <Text numberOfLines={2} style={styles.previewText}>
            {buildPreviewText(item)}
          </Text>
        )}

        <View style={styles.metricPanel}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Line items</Text>
            <Text style={styles.metricValue}>{item.items.length}</Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Dispatch</Text>
            <Text style={styles.metricValue}>
              {dispatchedCount}/{item.items.length}
            </Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>Order value</Text>
            <Text numberOfLines={1} style={styles.metricValue}>
              Rs {formatIndianCurrency(item.totalAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Text numberOfLines={2} style={styles.footerHint}>
            {progressLabel}
          </Text>

          <View style={styles.footerAction}>
            <Text style={styles.footerActionText}>View details</Text>
            <Ionicons color={colors.text} name="chevron-forward" size={16} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: OrderSection }) => (
    <View style={[styles.sectionHeader, { width: shellWidth }]}>
      <View style={[styles.sectionHeaderCard, { width: shellWidth }]}>
        <Text style={styles.sectionDate}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.count} orders</Text>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    const emptyTitle =
      searchQuery || filterStatus !== "all"
        ? "No orders match this view."
        : "No submitted orders yet.";

    const emptyBody =
      searchQuery || filterStatus !== "all"
        ? "Try a broader search or switch the filter to review the full order history."
        : "Orders you submit from OMA will appear here with approval and dispatch progress.";

    return (
      <View style={[styles.emptyShell, { width: shellWidth }]}>
        <Ionicons
          color={colors.textSecondary}
          name="receipt-outline"
          size={36}
        />
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyBody}>{emptyBody}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topGlow} />
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <LoadingIndicator message="Loading order history..." showTips={true} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topGlow} />
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <SectionList
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.orderId}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        renderItem={renderOrderCard}
        renderSectionHeader={renderSectionHeader}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}
