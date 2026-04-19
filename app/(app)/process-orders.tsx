import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeContext } from "@/context/ThemeContext";
import { useFeedback } from "@/context/FeedbackContext";
import { omaTypography } from "@/utils/typography";
import {
  BACKEND_URL,
  apiCache,
  batchUpdateSheetRanges,
  fetchWithRetry,
} from "@/utils/apiManager";
import LoadingIndicator from "@/components/LoadingIndicator";
import { buildDispatchSheetUpdates } from "@/utils/orderSheetSerializer";

type DispatchItem = {
  productName: string;
  productCode: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  actualRowIndex: number;
  dispatched: string;
  dispatchComments: string;
  dispatchTime: string;
};

type ProcessOrder = {
  orderId: string;
  date: string;
  customerName: string;
  customerCode: string;
  orderComments: string;
  managerComments: string;
  user: string;
  source: string;
  items: DispatchItem[];
  totalAmount: number;
};

type ProcessTab = "Queue" | "Picking" | "Ready";
type SortOption = "date" | "amount" | "customer";
type DetailTab = "items" | "notes";

const parseIndianDate = (dateStr: string) => {
  if (!dateStr) {
    return null;
  }

  const parts = dateStr.trim().split(/\s+/);
  const datePart = parts[0];
  const timePart = parts[1] || "";
  const meridiem = (parts[2] || "").toUpperCase();
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

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hours = date.getHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;

  return `${day}/${month}/${year} ${hours12}:${minutes} ${meridiem}`;
};

const formatIndianNumber = (value: number | string | null | undefined) => {
  const numericValue = Number.parseFloat(
    String(value ?? "0")
      .replace(/,/g, "")
      .trim()
  );

  if (Number.isNaN(numericValue)) {
    return "0.00";
  }

  return numericValue.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const splitOrderId = (orderId: string) => {
  if (!orderId) {
    return ["", 0] as const;
  }

  const [fiscalYear = "", orderNumber = "0"] = orderId.split("_");
  return [fiscalYear, Number.parseInt(orderNumber, 10) || 0] as const;
};

const getPendingItems = (order: ProcessOrder) =>
  order.items.filter((item) => item.dispatched !== "Y");

const getProcessStage = (order: ProcessOrder): ProcessTab => {
  const pendingCount = getPendingItems(order).length;
  const dispatchedCount = order.items.length - pendingCount;

  if (pendingCount <= 1) {
    return "Ready";
  }

  if (dispatchedCount > 0) {
    return "Picking";
  }

  return "Queue";
};

const getSlaMeta = (dateStr: string) => {
  const createdAt = parseIndianDate(dateStr);

  if (!createdAt) {
    return { label: "Unknown", color: "#64748b", urgent: false };
  }

  const diffHours = Math.max(
    1,
    Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60))
  );

  if (diffHours >= 24) {
    return { label: "Overdue", color: "#ef4444", urgent: true };
  }

  if (diffHours >= 8) {
    return { label: `Due in ${Math.max(1, 24 - diffHours)}h`, color: "#f97316", urgent: true };
  }

  return { label: `Fresh ${diffHours}h`, color: "#0f172a", urgent: false };
};

export default function ProcessOrdersScreen() {
  const { colors, isDark } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [orders, setOrders] = useState<ProcessOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProcessOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<ProcessTab>("Queue");
  const [detailTab, setDetailTab] = useState<DetailTab>("items");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [productRemarks, setProductRemarks] = useState<Record<number, string>>({});
  const [dispatchingItemId, setDispatchingItemId] = useState<number | null>(null);

  const runSheetUpdates = useCallback(
    async (updates: { range: string; values: string[][] }[]) => {
      try {
        await batchUpdateSheetRanges(updates, 1000);
        return;
      } catch {
        for (const update of updates) {
          await fetchWithRetry(
            `${BACKEND_URL}/api/sheets/${update.range}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              data: { values: update.values },
            },
            3,
            1000
          );
        }
      }
    },
    []
  );

  const contentWidth = Math.min(width - 24, 560);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedOrder(null);
    setDetailTab("items");
    setProductRemarks({});
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);

      const cachedOrders = apiCache.get("approvedOrders");
      if (cachedOrders && !refreshing) {
        setOrders(cachedOrders);
        setLoading(false);
      }

      const customerCodesMap: Record<string, string> = {};
      const productCodesMap: Record<string, string> = {};

      try {
        const customerResponse = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
          {},
          2,
          1500
        );

        (customerResponse.data?.values || []).slice(1).forEach((row: string[]) => {
          if (row.length >= 2 && row[1]) {
            customerCodesMap[row[1]] = row[0] || "";
          }
        });
      } catch {}

      try {
        const productResponse = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Product_Master!A1:B`,
          {},
          2,
          1500
        );

        const values = productResponse.data?.values || [];
        const headerRow = values[0] || [];
        const codeIndex = headerRow.indexOf("Product CODE");
        const nameIndex = headerRow.indexOf("Product NAME");

        if (codeIndex >= 0 && nameIndex >= 0) {
          values.slice(1).forEach((row: string[]) => {
            if (row[nameIndex]) {
              productCodesMap[row[nameIndex]] = row[codeIndex] || "";
            }
          });
        }
      } catch {}

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
        {},
        3,
        2000
      );

      const nextOrders = (response.data?.values || [])
        .map((row: string[], index: number) => ({
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
          approved: row[12] || "N",
          managerComments: row[13] || "",
          dispatched: row[14] || "N",
          dispatchComments: row[15] || "",
          dispatchTime: row[16] || "",
        }))
        .filter((row) => row.approved === "Y" && row.dispatched !== "Y")
        .reduce<Record<string, ProcessOrder>>((acc, row) => {
          if (!acc[row.orderId]) {
            acc[row.orderId] = {
              orderId: row.orderId,
              date: row.orderTime || row.sysTime,
              customerName: row.customerName,
              customerCode: customerCodesMap[row.customerName] || "",
              orderComments: row.orderComments,
              managerComments: row.managerComments,
              user: row.user,
              source: row.source,
              items: [],
              totalAmount: 0,
            };
          }

          acc[row.orderId].items.push({
            productName: row.productName,
            productCode: productCodesMap[row.productName] || "",
            quantity: row.quantity,
            unit: row.unit,
            rate: row.rate,
            amount: row.amount,
            actualRowIndex: row.actualRowIndex,
            dispatched: row.dispatched,
            dispatchComments: row.dispatchComments,
            dispatchTime: row.dispatchTime,
          });

          acc[row.orderId].totalAmount += Number.parseFloat(
            (row.amount || "0").replace(/,/g, "")
          ) || 0;

          return acc;
        }, {});

      const groupedOrders = Object.values(nextOrders).filter((order) =>
        order.items.some((item) => item.dispatched !== "Y")
      );

      setOrders(groupedOrders);
      apiCache.set("approvedOrders", groupedOrders);
    } catch (error: any) {
      showFeedback({
        type: "error",
        title: "Dispatch Failed",
        message: `Failed to load orders. ${
          error?.message || "Please try again."
        }`,
        autoDismiss: false,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, showFeedback]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
  }, [loadOrders]);

  const sortedOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filteredOrders = orders.filter((order) => {
      const matchesQuery =
        !query ||
        order.orderId.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.customerCode.toLowerCase().includes(query) ||
        order.items.some(
          (item) =>
            item.productName.toLowerCase().includes(query) ||
            item.productCode.toLowerCase().includes(query)
        );

      return matchesQuery && getProcessStage(order) === activeTab;
    });

    return filteredOrders.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "date": {
          const [aFY, aNum] = splitOrderId(a.orderId);
          const [bFY, bNum] = splitOrderId(b.orderId);
          comparison = aFY !== bFY ? bFY.localeCompare(aFY) : bNum - aNum;
          break;
        }
        case "amount":
          comparison = b.totalAmount - a.totalAmount;
          break;
        case "customer":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [activeTab, orders, searchQuery, sortBy, sortDirection]);

  const tabCounts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        const stage = getProcessStage(order);
        acc[stage] += 1;
        return acc;
      },
      { Queue: 0, Picking: 0, Ready: 0 } as Record<ProcessTab, number>
    );
  }, [orders]);

  const totalPendingItems = useMemo(() => {
    return orders.reduce((total, order) => total + getPendingItems(order).length, 0);
  }, [orders]);

  const openOrder = useCallback((order: ProcessOrder) => {
    setSelectedOrder(order);
    setDetailVisible(true);
    setDetailTab("items");

    const initialRemarks = order.items.reduce<Record<number, string>>((acc, item) => {
      if (item.dispatchComments) {
        acc[item.actualRowIndex] = item.dispatchComments;
      }
      return acc;
    }, {});

    setProductRemarks(initialRemarks);
  }, []);

  const handleProductDispatch = useCallback(
    async (item: DispatchItem) => {
      try {
        setDispatchingItemId(item.actualRowIndex);
        const dispatchMoment = new Date();
        const dispatchTime = formatDateTime(dispatchMoment);
        const dispatchAtIso = dispatchMoment.toISOString();
        const itemRemark = (productRemarks[item.actualRowIndex] || "").trim();
        const updates = buildDispatchSheetUpdates({
          rowIndex: item.actualRowIndex,
          dispatchRemark: itemRemark,
          dispatchDisplayTime: dispatchTime,
          dispatchAtIso,
        });
        await runSheetUpdates(updates);

        let shouldClose = false;

        setSelectedOrder((current) => {
          if (!current) {
            return current;
          }

          const nextItems = current.items.map((currentItem) =>
            currentItem.actualRowIndex === item.actualRowIndex
              ? {
                  ...currentItem,
                  dispatched: "Y",
                  dispatchComments: itemRemark,
                  dispatchTime,
                }
              : currentItem
          );

          shouldClose = nextItems.every((currentItem) => currentItem.dispatched === "Y");
          return { ...current, items: nextItems };
        });

        setOrders((currentOrders) => {
          const nextOrders = currentOrders
            .map((order) => {
              if (!selectedOrder || order.orderId !== selectedOrder.orderId) {
                return order;
              }

              const nextItems = order.items.map((currentItem) =>
                currentItem.actualRowIndex === item.actualRowIndex
                  ? {
                      ...currentItem,
                      dispatched: "Y",
                      dispatchComments: itemRemark,
                      dispatchTime,
                    }
                  : currentItem
              );

              return { ...order, items: nextItems };
            })
            .filter((order) => order.items.some((currentItem) => currentItem.dispatched !== "Y"));

          apiCache.set("approvedOrders", null);
          return nextOrders;
        });

        showFeedback({
          type: "success",
          title: "Product Dispatched",
          message: `"${item.productName}" has been dispatched successfully.`,
          actionText: shouldClose ? "Close Order" : "Continue",
          onAction: () => {
            if (shouldClose) {
              closeDetail();
            }
          },
        });

        if (shouldClose) {
          closeDetail();
        }
      } catch (error: any) {
        showFeedback({
          type: "error",
          title: "Dispatch Failed",
          message: `Failed to dispatch product. ${
            error?.message || "Please try again."
          }`,
          autoDismiss: false,
        });
      } finally {
        setDispatchingItemId(null);
      }
    },
    [closeDetail, productRemarks, runSheetUpdates, selectedOrder, showFeedback]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: colors.background,
        },
        topGlow: {
          position: "absolute",
          top: -40,
          left: -20,
          right: -20,
          height: 240,
          backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#e9eef6",
          borderBottomLeftRadius: 120,
          borderBottomRightRadius: 120,
          opacity: isDark ? 0.35 : 0.55,
        },
        scrollContent: {
          paddingTop: insets.top + 16,
          paddingBottom: 40,
        },
        shell: {
          width: contentWidth,
          alignSelf: "center",
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 18,
        },
        circleButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 7,
        },
        headerCopy: {
          flex: 1,
          marginLeft: 14,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        headerTitle: {
          color: colors.text,
          fontSize: 26,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.7,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        searchWrap: {
          backgroundColor: colors.card,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          minHeight: 56,
          marginBottom: 14,
        },
        searchInput: {
          flex: 1,
          color: colors.text,
          marginLeft: 12,
          fontSize: 14,
          fontFamily: omaTypography.medium,
        },
        heroCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
          marginBottom: 18,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 9,
          overflow: "hidden",
        },
        heroAccent: {
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: 90,
          right: -50,
          top: -70,
          backgroundColor: isDark ? "rgba(0,102,255,0.14)" : "#eaf1ff",
        },
        heroLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        heroValue: {
          color: colors.text,
          fontSize: 30,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.9,
        },
        heroSubtext: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          marginTop: 5,
        },
        heroMetrics: {
          flexDirection: "row",
          gap: 10,
          marginTop: 18,
        },
        heroMetricCard: {
          flex: 1,
          borderRadius: 18,
          paddingVertical: 12,
          paddingHorizontal: 14,
        },
        heroMetricLabel: {
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 5,
        },
        heroMetricValue: {
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
        },
        tabShell: {
          backgroundColor: isDark ? colors.surfaceVariant : "#edf1f6",
          padding: 5,
          borderRadius: 20,
          flexDirection: "row",
          marginBottom: 14,
        },
        tabButton: {
          flex: 1,
          borderRadius: 16,
          paddingVertical: 12,
          alignItems: "center",
          justifyContent: "center",
        },
        tabButtonActive: {
          backgroundColor: colors.card,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 18,
          elevation: 6,
        },
        tabText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        tabTextActive: {
          color: colors.text,
        },
        tabCount: {
          marginTop: 3,
          fontSize: 10,
          fontFamily: omaTypography.bold,
        },
        sortRow: {
          flexDirection: "row",
          gap: 8,
          marginBottom: 18,
        },
        sortButton: {
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: 16,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        sortButtonActive: {
          backgroundColor: isDark ? colors.surfaceVariant : "#eef5ff",
          borderColor: colors.primary,
        },
        sortButtonText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        sortButtonTextActive: {
          color: colors.primary,
        },
        sectionLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 12,
          marginLeft: 4,
        },
        orderCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        orderPriorityStrip: {
          height: 6,
        },
        orderBody: {
          padding: 18,
        },
        orderTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        },
        orderEyebrow: {
          color: colors.textSecondary,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        orderId: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        customerName: {
          color: colors.text,
          fontSize: 17,
          fontFamily: omaTypography.extrabold,
          lineHeight: 23,
        },
        stageChip: {
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 8,
          alignSelf: "flex-start",
          borderWidth: 1,
        },
        stageChipText: {
          fontSize: 10,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        },
        statsShell: {
          borderRadius: 20,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        },
        statsColumn: {
          flex: 1,
        },
        statsLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          marginBottom: 4,
        },
        statsValue: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        divider: {
          width: 1,
          alignSelf: "stretch",
          backgroundColor: colors.border,
          marginHorizontal: 14,
        },
        metaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        },
        metaChip: {
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        metaChipText: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
        },
        previewTitleRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        },
        previewTitle: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        previewAction: {
          color: colors.primary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        previewItem: {
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        previewName: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
        },
        previewMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        totalAmount: {
          color: colors.text,
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
          marginTop: 14,
        },
        emptyCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 42,
          paddingHorizontal: 24,
        },
        emptyTitle: {
          marginTop: 14,
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
        },
        emptyBody: {
          marginTop: 6,
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          textAlign: "center",
          lineHeight: 20,
        },
        detailScreen: {
          flex: 1,
          backgroundColor: colors.background,
        },
        detailHeader: {
          paddingHorizontal: 18,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        },
        detailHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        detailHeaderCopy: {
          flex: 1,
          marginLeft: 14,
        },
        detailTitle: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.3,
        },
        detailSubtitle: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 3,
        },
        progressShell: {
          marginTop: 18,
        },
        progressLabelRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        },
        progressLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        progressValue: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        progressTrack: {
          height: 10,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : "#e9eef6",
          overflow: "hidden",
        },
        progressBar: {
          height: 10,
          borderRadius: 999,
          backgroundColor: colors.primary,
        },
        detailContent: {
          paddingTop: 18,
        },
        detailTabShell: {
          flexDirection: "row",
          backgroundColor: isDark ? colors.surfaceVariant : "#edf1f6",
          borderRadius: 18,
          padding: 5,
          marginBottom: 18,
        },
        detailTabButton: {
          flex: 1,
          borderRadius: 14,
          paddingVertical: 11,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        detailTabButtonActive: {
          backgroundColor: colors.card,
        },
        detailTabText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        detailTabTextActive: {
          color: colors.text,
        },
        sectionCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 18,
        },
        sectionTitle: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          marginBottom: 12,
        },
        orderSummaryRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        },
        summaryValue: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
          lineHeight: 22,
        },
        summaryMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 4,
        },
        pickingItemCard: {
          borderRadius: 22,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          padding: 16,
          marginBottom: 12,
        },
        locationChip: {
          alignSelf: "flex-start",
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 7,
          backgroundColor: colors.navActive,
          marginBottom: 12,
        },
        locationChipText: {
          color: isDark ? colors.background : "#ffffff",
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.1,
        },
        itemName: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
          lineHeight: 20,
        },
        itemMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 5,
        },
        itemSummaryRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          marginBottom: 10,
        },
        statusPill: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
        },
        statusPillText: {
          fontSize: 11,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        },
        remarkLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          marginBottom: 8,
        },
        remarkInput: {
          minHeight: 88,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 14,
          paddingTop: 14,
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          textAlignVertical: "top",
        },
        dispatchButton: {
          marginTop: 12,
          minHeight: 52,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.navActive,
          flexDirection: "row",
          gap: 8,
        },
        dispatchButtonText: {
          color: isDark ? colors.background : "#ffffff",
          fontSize: 13,
          fontFamily: omaTypography.extrabold,
        },
        noteBlock: {
          borderRadius: 20,
          padding: 16,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 10,
        },
        noteLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        noteValue: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.semibold,
          lineHeight: 20,
        },
        noteEntry: {
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        noteEntryTitle: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.extrabold,
        },
        noteEntryMeta: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        bottomDock: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDark ? "rgba(9,17,31,0.96)" : "rgba(255,255,255,0.96)",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 18,
          paddingTop: 14,
        },
        closeButtonLarge: {
          minHeight: 54,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.cardMuted,
        },
        closeButtonLargeText: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
      }),
    [colors, contentWidth, insets.top, isDark]
  );

  const selectedOrderPendingItems = selectedOrder ? getPendingItems(selectedOrder) : [];
  const selectedOrderProgress = selectedOrder
    ? ((selectedOrder.items.length - selectedOrderPendingItems.length) /
        Math.max(selectedOrder.items.length, 1)) *
      100
    : 0;

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.topGlow} />

      {loading ? (
        <LoadingIndicator message="Loading dispatch queue..." showTips={true} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shell}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.circleButton}
              >
                <Ionicons color={colors.text} name="arrow-back" size={20} />
              </TouchableOpacity>

              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Warehouse Console</Text>
                <Text style={styles.headerTitle}>Process Orders</Text>
                <Text style={styles.headerSubtitle}>
                  Dispatch queue tuned for high-density mobile execution.
                </Text>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons
                color={colors.textSecondary}
                name="search-outline"
                size={20}
              />
              <TextInput
                placeholder="Scan or search order, customer, code, product"
                placeholderTextColor={colors.textPlaceholder}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons
                    color={colors.textSecondary}
                    name="close-circle"
                    size={20}
                  />
                </TouchableOpacity>
              ) : (
                <Ionicons
                  color={colors.primary}
                  name="scan-outline"
                  size={20}
                />
              )}
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroAccent} />
              <Text style={styles.heroLabel}>Fulfillment snapshot</Text>
              <Text style={styles.heroValue}>{orders.length} live orders</Text>
              <Text style={styles.heroSubtext}>
                {totalPendingItems} product line
                {totalPendingItems === 1 ? "" : "s"} still waiting to move.
              </Text>

              <View style={styles.heroMetrics}>
                <View
                  style={[
                    styles.heroMetricCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(0,102,255,0.16)"
                        : "#eef5ff",
                    },
                  ]}
                >
                  <Text
                    style={[styles.heroMetricLabel, { color: colors.primary }]}
                  >
                    Queue
                  </Text>
                  <Text
                    style={[styles.heroMetricValue, { color: colors.primary }]}
                  >
                    {tabCounts.Queue}
                  </Text>
                </View>
                <View
                  style={[
                    styles.heroMetricCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(251,146,60,0.16)"
                        : "#fff7ed",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroMetricLabel,
                      { color: colors.accentOrange },
                    ]}
                  >
                    Picking
                  </Text>
                  <Text
                    style={[
                      styles.heroMetricValue,
                      { color: colors.accentOrange },
                    ]}
                  >
                    {tabCounts.Picking}
                  </Text>
                </View>
                <View
                  style={[
                    styles.heroMetricCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(34,197,94,0.16)"
                        : "#ecfdf5",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroMetricLabel,
                      { color: colors.accentGreen },
                    ]}
                  >
                    Ready
                  </Text>
                  <Text
                    style={[
                      styles.heroMetricValue,
                      { color: colors.accentGreen },
                    ]}
                  >
                    {tabCounts.Ready}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.tabShell}>
              {(["Queue", "Picking", "Ready"] as ProcessTab[]).map((tab) => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tabButton,
                      active && styles.tabButtonActive,
                    ]}
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {tab}
                    </Text>
                    <Text
                      style={[
                        styles.tabCount,
                        active
                          ? styles.tabTextActive
                          : { color: colors.textSecondary },
                      ]}
                    >
                      {tabCounts[tab]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {(["date", "amount", "customer"] as SortOption[]).map((option) => {
                const active = sortBy === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => {
                      if (sortBy === option) {
                        setSortDirection((current) =>
                          current === "asc" ? "desc" : "asc"
                        );
                      } else {
                        setSortBy(option);
                        setSortDirection(option === "customer" ? "asc" : "desc");
                      }
                    }}
                    style={[
                      styles.sortButton,
                      active && styles.sortButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortButtonText,
                        active && styles.sortButtonTextActive,
                      ]}
                    >
                      {option === "date"
                        ? "Order ID"
                        : option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                    {active ? (
                      <Ionicons
                        color={colors.primary}
                        name={
                          sortDirection === "asc"
                            ? "arrow-down-outline"
                            : "arrow-up-outline"
                        }
                        size={14}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionLabel}>
              {sortedOrders.length} orders in {activeTab.toLowerCase()}
            </Text>

            {sortedOrders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  color={colors.textPlaceholder}
                  name="checkmark-done-circle-outline"
                  size={56}
                />
                <Text style={styles.emptyTitle}>Nothing queued here</Text>
                <Text style={styles.emptyBody}>
                  This lane is clear. Pull to refresh if dispatch work should be
                  visible.
                </Text>
              </View>
            ) : (
              sortedOrders.map((order) => {
                const stage = getProcessStage(order);
                const pendingItems = getPendingItems(order);
                const sla = getSlaMeta(order.date);
                const isPriority = sla.urgent || order.totalAmount >= 50000;

                return (
                  <TouchableOpacity
                    key={order.orderId}
                    activeOpacity={0.92}
                    onPress={() => openOrder(order)}
                    style={styles.orderCard}
                  >
                    {isPriority ? (
                      <View
                        style={[
                          styles.orderPriorityStrip,
                          {
                            backgroundColor:
                              stage === "Ready"
                                ? colors.accentGreen
                                : stage === "Picking"
                                ? colors.accentOrange
                                : colors.accentRed,
                          },
                        ]}
                      />
                    ) : null}

                    <View style={styles.orderBody}>
                      <View style={styles.orderTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderEyebrow}>Order ID</Text>
                          <Text style={styles.orderId}>{order.orderId}</Text>
                          <Text style={styles.customerName}>
                            {order.customerName}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.stageChip,
                            {
                              backgroundColor:
                                stage === "Ready"
                                  ? isDark
                                    ? "rgba(74,222,128,0.14)"
                                    : "#ecfdf5"
                                  : stage === "Picking"
                                  ? isDark
                                    ? "rgba(251,146,60,0.14)"
                                    : "#fff7ed"
                                  : isDark
                                  ? "rgba(0,102,255,0.14)"
                                  : "#eef5ff",
                              borderColor:
                                stage === "Ready"
                                  ? isDark
                                    ? "rgba(74,222,128,0.2)"
                                    : "#bbf7d0"
                                  : stage === "Picking"
                                  ? isDark
                                    ? "rgba(251,146,60,0.22)"
                                    : "#fed7aa"
                                  : isDark
                                  ? "rgba(0,102,255,0.22)"
                                  : "#bfdbfe",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.stageChipText,
                              {
                                color:
                                  stage === "Ready"
                                    ? colors.accentGreen
                                    : stage === "Picking"
                                    ? colors.accentOrange
                                    : colors.primary,
                              },
                            ]}
                          >
                            {isPriority && stage === "Queue"
                              ? "Priority"
                              : stage}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.statsShell}>
                        <View style={styles.statsColumn}>
                          <Text style={styles.statsLabel}>Lines / Pending</Text>
                          <Text style={styles.statsValue}>
                            {order.items.length} / {pendingItems.length}
                          </Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.statsColumn}>
                          <Text style={styles.statsLabel}>Fulfillment SLA</Text>
                          <Text
                            style={[
                              styles.statsValue,
                              {
                                color: sla.urgent ? sla.color : colors.text,
                              },
                            ]}
                          >
                            {sla.label}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.metaRow}>
                        {order.customerCode ? (
                          <View style={styles.metaChip}>
                            <Ionicons
                              color={colors.textSecondary}
                              name="pricetag-outline"
                              size={12}
                            />
                            <Text style={styles.metaChipText}>
                              {order.customerCode}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.metaChip}>
                          <Ionicons
                            color={colors.textSecondary}
                            name="call-outline"
                            size={12}
                          />
                          <Text style={styles.metaChipText}>{order.source}</Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Ionicons
                            color={colors.textSecondary}
                            name="person-outline"
                            size={12}
                          />
                          <Text style={styles.metaChipText}>{order.user}</Text>
                        </View>
                      </View>

                      <View style={styles.previewTitleRow}>
                        <Text style={styles.previewTitle}>Pending products</Text>
                        <Text style={styles.previewAction}>Open →</Text>
                      </View>

                      {pendingItems.slice(0, 2).map((item, index) => (
                        <View
                          key={`${item.actualRowIndex}-${index}`}
                          style={[
                            styles.previewItem,
                            index === Math.min(pendingItems.length, 2) - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                        >
                          <Text numberOfLines={1} style={styles.previewName}>
                            {item.productName}
                          </Text>
                          <Text style={styles.previewMeta}>
                            {item.quantity} {item.unit} • ₹
                            {formatIndianNumber(item.amount)}
                          </Text>
                        </View>
                      ))}

                      {pendingItems.length > 2 ? (
                        <Text style={[styles.previewMeta, { marginTop: 10 }]}>
                          +{pendingItems.length - 2} more pending product
                          {pendingItems.length - 2 === 1 ? "" : "s"}
                        </Text>
                      ) : null}

                      <Text style={styles.totalAmount}>
                        ₹{formatIndianNumber(order.totalAmount)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        animationType="slide"
        visible={detailVisible}
        onRequestClose={closeDetail}
      >
        <KeyboardAvoidingView
          style={styles.detailScreen}
          behavior={undefined}
        >
          <View style={styles.topGlow} />
          <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.detailHeaderRow}>
              <TouchableOpacity onPress={closeDetail} style={styles.circleButton}>
                <Ionicons color={colors.text} name="arrow-back" size={20} />
              </TouchableOpacity>

              <View style={styles.detailHeaderCopy}>
                <Text style={styles.detailTitle}>
                  {selectedOrder?.orderId || "Order"}
                </Text>
                <Text style={styles.detailSubtitle}>
                  {selectedOrder?.customerName || ""}
                </Text>
              </View>
            </View>

            {selectedOrder ? (
              <View style={styles.progressShell}>
                <View style={styles.progressLabelRow}>
                  <Text style={styles.progressLabel}>Dispatch Progress</Text>
                  <Text style={styles.progressValue}>
                    {selectedOrder.items.length - selectedOrderPendingItems.length}
                    <Text style={{ color: colors.textSecondary }}>
                      {" "}
                      / {selectedOrder.items.length} items
                    </Text>
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${Math.max(selectedOrderProgress, 8)}%` },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {selectedOrder ? (
            <>
              <ScrollView
                contentContainerStyle={[
                  styles.detailContent,
                  styles.shell,
                  { paddingBottom: insets.bottom + 110 },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.detailTabShell}>
                  {[
                    {
                      key: "items" as const,
                      label: "Dispatch List",
                      count: selectedOrderPendingItems.length,
                    },
                    {
                      key: "notes" as const,
                      label: "Notes",
                      count:
                        (selectedOrder.orderComments ? 1 : 0) +
                        (selectedOrder.managerComments ? 1 : 0) +
                        selectedOrder.items.filter(
                          (item) =>
                            item.dispatchComments ||
                            item.dispatchTime ||
                            item.dispatched === "Y"
                        ).length,
                    },
                  ].map((tab) => {
                    const active = detailTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => setDetailTab(tab.key)}
                        style={[
                          styles.detailTabButton,
                          active && styles.detailTabButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.detailTabText,
                            active && styles.detailTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                        <Text
                          style={[
                            active
                              ? styles.detailTabTextActive
                              : { color: colors.textSecondary },
                            { fontSize: 10, fontFamily: omaTypography.bold },
                          ]}
                        >
                          {tab.count}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Order Context</Text>
                  <View style={styles.orderSummaryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryValue}>
                        {selectedOrder.customerName}
                      </Text>
                      <Text style={styles.summaryMeta}>
                        {selectedOrder.orderId}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.summaryValue}>
                        ₹{formatIndianNumber(selectedOrder.totalAmount)}
                      </Text>
                      <Text style={styles.summaryMeta}>
                        {selectedOrder.date}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {selectedOrder.customerCode ? (
                      <View style={styles.metaChip}>
                        <Ionicons
                          color={colors.textSecondary}
                          name="pricetag-outline"
                          size={12}
                        />
                        <Text style={styles.metaChipText}>
                          {selectedOrder.customerCode}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.metaChip}>
                      <Ionicons
                        color={colors.textSecondary}
                        name="call-outline"
                        size={12}
                      />
                      <Text style={styles.metaChipText}>{selectedOrder.source}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Ionicons
                        color={colors.textSecondary}
                        name="person-outline"
                        size={12}
                      />
                      <Text style={styles.metaChipText}>{selectedOrder.user}</Text>
                    </View>
                  </View>
                </View>

                {detailTab === "items" ? (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>
                      Dispatch List ({selectedOrder.items.length})
                    </Text>

                    {selectedOrder.items.map((item) => {
                      const isDispatched = item.dispatched === "Y";
                      const remarkValue =
                        productRemarks[item.actualRowIndex] || "";

                      return (
                        <View
                          key={item.actualRowIndex}
                          style={styles.pickingItemCard}
                        >
                          <View style={styles.locationChip}>
                            <Text style={styles.locationChipText}>
                              {item.productCode || "OMA ITEM"}
                            </Text>
                          </View>

                          <Text style={styles.itemName}>{item.productName}</Text>
                          <Text style={styles.itemMeta}>
                            Qty: {item.quantity} {item.unit} • Rate: ₹
                            {item.rate} • Amount: ₹
                            {formatIndianNumber(item.amount)}
                          </Text>

                          <View style={styles.itemSummaryRow}>
                            <Text style={styles.summaryMeta}>
                              {isDispatched && item.dispatchTime
                                ? `Dispatched ${item.dispatchTime}`
                                : "Awaiting dispatch confirmation"}
                            </Text>
                            <View
                              style={[
                                styles.statusPill,
                                {
                                  backgroundColor: isDispatched
                                    ? isDark
                                      ? "rgba(74,222,128,0.14)"
                                      : "#ecfdf5"
                                    : isDark
                                    ? "rgba(251,146,60,0.14)"
                                    : "#fff7ed",
                                  borderColor: isDispatched
                                    ? isDark
                                      ? "rgba(74,222,128,0.2)"
                                      : "#bbf7d0"
                                    : isDark
                                    ? "rgba(251,146,60,0.22)"
                                    : "#fed7aa",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusPillText,
                                  {
                                    color: isDispatched
                                      ? colors.accentGreen
                                      : colors.accentOrange,
                                  },
                                ]}
                              >
                                {isDispatched ? "Dispatched" : "Pending"}
                              </Text>
                            </View>
                          </View>

                          {isDispatched ? (
                            item.dispatchComments ? (
                              <View style={styles.noteBlock}>
                                <Text style={styles.noteLabel}>
                                  Dispatch Note
                                </Text>
                                <Text style={styles.noteValue}>
                                  {item.dispatchComments}
                                </Text>
                              </View>
                            ) : null
                          ) : (
                            <>
                              <Text style={styles.remarkLabel}>
                                Dispatch Note
                              </Text>
                              <TextInput
                                multiline
                                numberOfLines={3}
                                placeholder="Add dispatch notes if needed"
                                placeholderTextColor={colors.textPlaceholder}
                                style={styles.remarkInput}
                                value={remarkValue}
                                onChangeText={(text) =>
                                  setProductRemarks((current) => ({
                                    ...current,
                                    [item.actualRowIndex]: text,
                                  }))
                                }
                              />

                              <TouchableOpacity
                                disabled={dispatchingItemId !== null}
                                onPress={() => handleProductDispatch(item)}
                                style={[
                                  styles.dispatchButton,
                                  dispatchingItemId !== null && { opacity: 0.75 },
                                ]}
                              >
                                {dispatchingItemId === item.actualRowIndex ? (
                                  <ActivityIndicator
                                    color={isDark ? colors.background : "#ffffff"}
                                    size="small"
                                  />
                                ) : (
                                  <>
                                    <Text style={styles.dispatchButtonText}>
                                      Confirm Dispatch
                                    </Text>
                                    <Ionicons
                                      color={isDark ? colors.background : "#ffffff"}
                                      name="arrow-forward-outline"
                                      size={16}
                                    />
                                  </>
                                )}
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Operational Notes</Text>

                    {selectedOrder.orderComments ? (
                      <View style={styles.noteBlock}>
                        <Text style={styles.noteLabel}>O.Note</Text>
                        <Text style={styles.noteValue}>
                          {selectedOrder.orderComments}
                        </Text>
                      </View>
                    ) : null}

                    {selectedOrder.managerComments ? (
                      <View style={styles.noteBlock}>
                        <Text style={styles.noteLabel}>M.Note</Text>
                        <Text style={styles.noteValue}>
                          {selectedOrder.managerComments}
                        </Text>
                      </View>
                    ) : null}

                    {selectedOrder.items.filter(
                      (item) =>
                        item.dispatchComments ||
                        item.dispatchTime ||
                        item.dispatched === "Y"
                    ).length === 0 ? (
                      <View style={styles.noteBlock}>
                        <Text style={styles.noteValue}>
                          No dispatch notes logged yet.
                        </Text>
                      </View>
                    ) : (
                      selectedOrder.items
                        .filter(
                          (item) =>
                            item.dispatchComments ||
                            item.dispatchTime ||
                            item.dispatched === "Y"
                        )
                        .map((item, index, array) => (
                          <View
                            key={item.actualRowIndex}
                            style={[
                              styles.noteEntry,
                              index === array.length - 1 && { borderBottomWidth: 0 },
                            ]}
                          >
                            <Text style={styles.noteEntryTitle}>
                              {item.productName}
                            </Text>
                            <Text style={styles.noteEntryMeta}>
                              {item.dispatchTime
                                ? `Dispatched ${item.dispatchTime}`
                                : "Dispatch in progress"}
                            </Text>
                            {item.dispatchComments ? (
                              <Text style={[styles.noteValue, { marginTop: 8 }]}>
                                {item.dispatchComments}
                              </Text>
                            ) : null}
                          </View>
                        ))
                    )}
                  </View>
                )}
              </ScrollView>

              <View
                style={[
                  styles.bottomDock,
                  { paddingBottom: insets.bottom + 12 },
                ]}
              >
                <TouchableOpacity
                  onPress={closeDetail}
                  style={styles.closeButtonLarge}
                >
                  <Text style={styles.closeButtonLargeText}>Back to Queue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}


