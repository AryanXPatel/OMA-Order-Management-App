import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import {
  calculateLedgerStats,
  fetchCustomerLedger,
} from "@/utils/ledgerUtils";
import {
  buildApprovalSheetUpdates,
  buildRejectionSheetUpdates,
} from "@/utils/orderSheetSerializer";

type ApprovalItem = {
  productName: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  rowIndex: number;
};

type ApprovalOrder = {
  orderId: string;
  date: string;
  customerName: string;
  user: string;
  source: string;
  orderComments: string;
  managerComments: string;
  approvalStatus: string;
  dispatchStatus: string;
  dispatchComments: string;
  dispatchTime: string;
  items: ApprovalItem[];
  totalAmount: number;
};

type LedgerEntry = {
  Date?: string;
  Description?: string;
  Amount?: string | number;
  DC?: string;
  Company_Year?: string;
  [key: string]: unknown;
};

type ReviewFilter = "all" | "pending" | "recheck";
type SortOption = "date" | "amount" | "customer" | "source";

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

const formatDateChip = (dateStr: string) => {
  const parsed = parseIndianDate(dateStr);
  if (!parsed) {
    return "Unknown";
  }

  return `${String(parsed.getDate()).padStart(2, "0")}/${String(
    parsed.getMonth() + 1
  ).padStart(2, "0")}/${parsed.getFullYear()}`;
};

const formatTimeAgo = (dateStr: string) => {
  const parsed = parseIndianDate(dateStr);
  if (!parsed) {
    return "Unknown";
  }

  const diffMs = Date.now() - parsed.getTime();
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

export default function OrderApprovalScreen() {
  const { colors, isDark } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [orders, setOrders] = useState<ApprovalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ApprovalOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalComments, setApprovalComments] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const runSheetUpdates = useCallback(
    async (updates: { range: string; values: string[][] }[]) => {
      try {
        await batchUpdateSheetRanges(updates, 1000);
        return;
      } catch {
        for (const update of updates) {
          const response = await fetchWithRetry(
            `${BACKEND_URL}/api/sheets/${update.range}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              data: { values: update.values },
            },
            2,
            1000
          );

          if (!response || response.status < 200 || response.status >= 300) {
            throw new Error("Failed to update cell");
          }
        }
      }
    },
    []
  );

  const contentWidth = Math.min(width - 24, 560);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    setSelectedOrder(null);
    setLedgerData([]);
    setApprovalComments("");
    setRejectionReason("");
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);

      const cachedData = apiCache.get("pendingApprovalOrders");
      const currentTime = Date.now();

      if (
        cachedData &&
        cachedData.timestamp &&
        currentTime - cachedData.timestamp < 5 * 60 * 1000 &&
        !refreshing
      ) {
        setOrders(cachedData.data);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
        {},
        2,
        1500
      );

      const rows = response.data?.values || [];
      const groupedOrders = rows
        .map((row: string[], index: number) => ({
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
          approvalStatus: row[12] || "",
          managerComments: row[13] || "",
          dispatchStatus: row[14] || "",
          dispatchComments: row[15] || "",
          dispatchTime: row[16] || "",
          rowIndex: index + 2,
        }))
        .filter(
          (row) => row.approvalStatus === "" || row.approvalStatus === "R"
        )
        .reduce<Record<string, ApprovalOrder>>((acc, row) => {
          if (!acc[row.orderId]) {
            acc[row.orderId] = {
              orderId: row.orderId,
              date: row.orderTime || row.sysTime,
              customerName: row.customerName,
              user: row.user,
              source: row.source,
              orderComments: row.orderComments,
              managerComments: row.managerComments,
              approvalStatus: row.approvalStatus,
              dispatchStatus: row.dispatchStatus,
              dispatchComments: row.dispatchComments,
              dispatchTime: row.dispatchTime,
              items: [],
              totalAmount: 0,
            };
          }

          acc[row.orderId].items.push({
            productName: row.productName,
            quantity: row.quantity,
            unit: row.unit,
            rate: row.rate,
            amount: row.amount,
            rowIndex: row.rowIndex,
          });

          acc[row.orderId].totalAmount += Number.parseFloat(
            (row.amount || "0").replace(/,/g, "")
          ) || 0;

          return acc;
        }, {});

      const nextOrders = Object.values(groupedOrders);
      apiCache.set("pendingApprovalOrders", {
        data: nextOrders,
        timestamp: currentTime,
      });

      setOrders(nextOrders);
    } catch {
      showFeedback({
        type: "error",
        title: "Data Load Error",
        message: "Failed to load approval orders. Please try again.",
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, showFeedback]);

  const checkUserRole = useCallback(async () => {
    try {
      const userRole = await AsyncStorage.getItem("userRole");
      if (userRole !== "Manager") {
        showFeedback({
          type: "error",
          title: "Access Denied",
          message: "You don't have permission to access this screen.",
          actionText: "Go to Dashboard",
          onAction: () => router.replace("/(app)/main"),
          autoDismiss: false,
        });
      }
    } catch {
      showFeedback({
        type: "error",
        title: "Session Error",
        message: "Unable to verify your role right now.",
        autoDismiss: true,
      });
    }
  }, [showFeedback]);

  useEffect(() => {
    checkUserRole();
    loadOrders();
  }, [checkUserRole, loadOrders]);

  const loadCustomerLedger = useCallback(
    async (customerName: string) => {
      try {
        setLedgerLoading(true);
        const cacheKey = `ledger_${customerName}`;
        const cachedLedger = apiCache.get(cacheKey);

        if (cachedLedger) {
          setLedgerData(cachedLedger);
          return;
        }

        const entries = await fetchCustomerLedger(customerName);
        apiCache.set(cacheKey, entries);
        setLedgerData(entries);
      } catch {
        showFeedback({
          type: "error",
          title: "Data Load Error",
          message: "Failed to load customer ledger data.",
          autoDismiss: true,
        });
        setLedgerData([]);
      } finally {
        setLedgerLoading(false);
      }
    },
    [showFeedback]
  );

  const openOrder = useCallback(
    (order: ApprovalOrder) => {
      setSelectedOrder(order);
      setDetailVisible(true);
      loadCustomerLedger(order.customerName);
    },
    [loadCustomerLedger]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
  }, [loadOrders]);

  const handleApproval = useCallback(
    async (approved: boolean, comments = "") => {
      if (!selectedOrder) {
        return false;
      }

      if (!approved) {
        setShowRejectModal(true);
        return false;
      }

      try {
        setApprovalLoading(true);
        const actionedAt = new Date();
        const updatedAtIso = actionedAt.toISOString();

        let successCount = 0;
        let failureCount = 0;

        const results = await Promise.allSettled(
          selectedOrder.items.map(async (item) => {
            const updates = buildApprovalSheetUpdates({
              rowIndex: item.rowIndex,
              comments: comments || "",
              updatedAtIso,
            });
            await runSheetUpdates(updates);

            return true;
          })
        );

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            successCount += 1;
          } else {
            failureCount += 1;
          }
        });

        if (successCount <= 0) {
          throw new Error("Failed to update any order items");
        }

        apiCache.set("pendingApprovalOrders", null);
        closeDetail();

        showFeedback({
          type: "success",
          title: "Order Approved",
          message:
            failureCount > 0
              ? `Most items were approved successfully (${successCount}/${
                  successCount + failureCount
                }). Refresh to confirm.`
              : "The order has been approved and moved to dispatch.",
          actionText: "Refresh",
          onAction: () => loadOrders(),
        });

        setTimeout(() => {
          loadOrders();
        }, 500);

        return true;
      } catch {
        showFeedback({
          type: "error",
          title: "Update Failed",
          message: "Could not update the order status. Please try again.",
          autoDismiss: false,
        });
        return false;
      } finally {
        setApprovalLoading(false);
      }
    },
    [closeDetail, loadOrders, runSheetUpdates, selectedOrder, showFeedback]
  );

  const confirmRejection = useCallback(async () => {
    if (!selectedOrder) {
      return false;
    }

    try {
      setApprovalLoading(true);
      const actionedAt = new Date();
      const updatedAtIso = actionedAt.toISOString();

      let successCount = 0;
      let failureCount = 0;

      const results = await Promise.allSettled(
        selectedOrder.items.map(async (item) => {
          const updates = buildRejectionSheetUpdates({
            rowIndex: item.rowIndex,
            rejectionReason: rejectionReason || "No reason provided",
            updatedAtIso,
          });
          await runSheetUpdates(updates);

          return true;
        })
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      });

      apiCache.set("pendingApprovalOrders", null);

      if (successCount <= 0) {
        throw new Error("Failed to update any order items");
      }

      setShowRejectModal(false);
      closeDetail();

      showFeedback({
        type: "error",
        title: "Order Rejected",
        message:
          failureCount > 0
            ? `The order was rejected for most items (${successCount}/${
                successCount + failureCount
              }).`
            : `The order has been rejected${
                rejectionReason ? ` with reason: ${rejectionReason}` : ""
              }.`,
        actionText: "Refresh",
        onAction: () => loadOrders(),
        autoDismiss: false,
      });

      setTimeout(() => {
        loadOrders();
      }, 500);

      return true;
    } catch {
      showFeedback({
        type: "error",
        title: "Update Failed",
        message: "Could not reject the order. Please try again.",
        autoDismiss: false,
      });
      return false;
    } finally {
      setApprovalLoading(false);
    }
  }, [
    closeDetail,
    loadOrders,
    rejectionReason,
    runSheetUpdates,
    selectedOrder,
    showFeedback,
  ]);

  const customerStats = useMemo(() => {
    if (!selectedOrder || !ledgerData.length) {
      return {
        totalCredit: "0.00",
        totalDebit: "0.00",
        totalCreditRaw: 0,
        totalDebitRaw: 0,
        hasCredit: true,
      };
    }

    try {
      return calculateLedgerStats(ledgerData);
    } catch {
      return {
        totalCredit: "0.00",
        totalDebit: "0.00",
        totalCreditRaw: 0,
        totalDebitRaw: 0,
        hasCredit: true,
      };
    }
  }, [ledgerData, selectedOrder]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesFilter =
        reviewFilter === "all"
          ? true
          : reviewFilter === "recheck"
          ? order.approvalStatus === "R"
          : order.approvalStatus !== "R";

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        order.orderId.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.user.toLowerCase().includes(query) ||
        order.source.toLowerCase().includes(query) ||
        order.items.some((item) =>
          item.productName.toLowerCase().includes(query)
        )
      );
    });
  }, [orders, reviewFilter, searchQuery]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const [aFY, aNum] = splitOrderId(a.orderId);
      const [bFY, bNum] = splitOrderId(b.orderId);
      let comparison = 0;

      switch (sortBy) {
        case "date":
          comparison =
            aFY !== bFY ? bFY.localeCompare(aFY) : bNum - aNum;
          break;
        case "amount":
          comparison = b.totalAmount - a.totalAmount;
          break;
        case "customer":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case "source":
          comparison = a.source.localeCompare(b.source);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredOrders, sortBy, sortDirection]);

  const summary = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        if (order.approvalStatus === "R") {
          acc.recheckCount += 1;
        } else {
          acc.pendingCount += 1;
        }

        acc.totalValue += order.totalAmount;
        return acc;
      },
      { pendingCount: 0, recheckCount: 0, totalValue: 0 }
    );
  }, [orders]);

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
          justifyContent: "space-between",
          marginBottom: 20,
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
          fontSize: 28,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.8,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        summaryCard: {
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
        summaryAccent: {
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: 90,
          right: -50,
          top: -70,
          backgroundColor: isDark ? "rgba(0,102,255,0.14)" : "#eaf1ff",
        },
        summaryLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        summaryValue: {
          color: colors.text,
          fontSize: 32,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -1,
        },
        summaryFoot: {
          flexDirection: "row",
          marginTop: 18,
          gap: 10,
        },
        metricPill: {
          flex: 1,
          borderRadius: 18,
          paddingVertical: 12,
          paddingHorizontal: 14,
        },
        metricLabel: {
          fontSize: 10,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.2,
          marginBottom: 5,
        },
        metricValue: {
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.4,
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
        filterRow: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 14,
        },
        segmentShell: {
          flex: 1,
          backgroundColor: isDark ? colors.surfaceVariant : "#edf1f6",
          padding: 5,
          borderRadius: 18,
          flexDirection: "row",
        },
        segmentButton: {
          flex: 1,
          borderRadius: 14,
          paddingVertical: 10,
          alignItems: "center",
          justifyContent: "center",
        },
        segmentButtonActive: {
          backgroundColor: colors.navActive,
        },
        segmentText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        segmentTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        segmentCount: {
          fontSize: 10,
          fontFamily: omaTypography.bold,
          marginTop: 2,
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
        orderCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 14,
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        orderBanner: {
          paddingHorizontal: 18,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        orderBannerLeft: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flex: 1,
        },
        orderBannerLabel: {
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        orderBannerDate: {
          fontSize: 11,
          fontFamily: omaTypography.bold,
          color: colors.textSecondary,
        },
        orderBody: {
          paddingHorizontal: 18,
          paddingVertical: 18,
        },
        orderHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
        },
        repBadge: {
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : "#edf4ff",
          borderWidth: 1,
          borderColor: colors.border,
        },
        repBadgeText: {
          color: colors.primary,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
        },
        orderIdentity: {
          flex: 1,
        },
        customerName: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
          lineHeight: 22,
        },
        orderId: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 3,
        },
        orderAmount: {
          color: colors.text,
          fontSize: 20,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.5,
          textAlign: "right",
        },
        orderAge: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          marginTop: 6,
        },
        metaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 16,
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
        notePreview: {
          marginTop: 16,
          borderRadius: 18,
          padding: 14,
          backgroundColor: isDark ? "rgba(251,146,60,0.12)" : "#fff7ed",
          borderWidth: 1,
          borderColor: isDark ? "rgba(251,146,60,0.25)" : "#fed7aa",
        },
        notePreviewLabel: {
          color: colors.accentOrange,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          marginBottom: 6,
        },
        notePreviewText: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.semibold,
          lineHeight: 19,
        },
        detailScreen: {
          flex: 1,
          backgroundColor: colors.background,
        },
        detailHeader: {
          paddingHorizontal: 18,
          paddingBottom: 18,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        },
        detailHeaderCenter: {
          flex: 1,
          alignItems: "center",
          paddingHorizontal: 12,
        },
        detailHeaderEyebrow: {
          color: colors.textSecondary,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        detailHeaderTitle: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.3,
          textAlign: "center",
        },
        detailContent: {
          paddingTop: 18,
        },
        infoGrid: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 18,
        },
        infoCard: {
          flex: 1,
          borderRadius: 24,
          padding: 18,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        infoLabel: {
          color: colors.textSecondary,
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        infoValue: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.extrabold,
          lineHeight: 21,
        },
        infoMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 4,
        },
        detailNoteCard: {
          borderRadius: 26,
          padding: 20,
          marginBottom: 18,
          backgroundColor: isDark ? "rgba(251,146,60,0.12)" : "#fff7ed",
          borderWidth: 1,
          borderColor: isDark ? "rgba(251,146,60,0.25)" : "#fed7aa",
        },
        detailNoteValue: {
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.bold,
          lineHeight: 23,
        },
        managerNoteCard: {
          borderRadius: 22,
          padding: 18,
          marginBottom: 18,
          backgroundColor: isDark ? "rgba(248,113,113,0.12)" : "#fff1f2",
          borderWidth: 1,
          borderColor: isDark ? "rgba(248,113,113,0.22)" : "#fecdd3",
        },
        ledgerCard: {
          backgroundColor: "#111111",
          borderRadius: 30,
          padding: 22,
          marginBottom: 18,
          overflow: "hidden",
        },
        ledgerBlur: {
          position: "absolute",
          top: -70,
          right: -50,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: customerStats.hasCredit
            ? "rgba(0,102,255,0.24)"
            : "rgba(251,146,60,0.22)",
        },
        ledgerHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        },
        ledgerTitle: {
          color: "rgba(255,255,255,0.65)",
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        },
        ledgerCategory: {
          color: "#ffffff",
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
        },
        ledgerBalanceLabel: {
          color: "rgba(255,255,255,0.55)",
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        ledgerBalanceValue: {
          color: "#ffffff",
          fontSize: 34,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -1.2,
          marginTop: 8,
        },
        ledgerBalanceSuffix: {
          fontSize: 17,
          fontFamily: omaTypography.bold,
        },
        ledgerDivider: {
          height: 1,
          backgroundColor: "rgba(255,255,255,0.1)",
          marginVertical: 18,
        },
        ledgerStatsRow: {
          flexDirection: "row",
          gap: 16,
        },
        ledgerStat: {
          flex: 1,
        },
        ledgerStatLabel: {
          color: "rgba(255,255,255,0.48)",
          fontSize: 10,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        ledgerStatValue: {
          color: "#ffffff",
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
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
        ledgerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        ledgerRowDate: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          width: 88,
        },
        ledgerRowBody: {
          flex: 1,
          marginHorizontal: 12,
        },
        ledgerRowTitle: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
        },
        ledgerRowMeta: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.medium,
          marginTop: 3,
        },
        ledgerAmount: {
          fontSize: 12,
          fontFamily: omaTypography.extrabold,
          textAlign: "right",
        },
        productRow: {
          borderRadius: 20,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          padding: 14,
          marginBottom: 10,
        },
        productTitle: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
          lineHeight: 20,
        },
        productMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          marginTop: 6,
        },
        productAmount: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
          marginTop: 8,
        },
        totalBar: {
          marginTop: 8,
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: isDark ? "rgba(34,197,94,0.12)" : "#ecfdf5",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: isDark ? "rgba(74,222,128,0.2)" : "#bbf7d0",
        },
        totalLabel: {
          color: isDark ? colors.accentGreen : "#166534",
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        totalValue: {
          color: isDark ? colors.accentGreen : "#16a34a",
          fontSize: 22,
          fontFamily: omaTypography.extrabold,
        },
        dock: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDark ? "rgba(9,17,31,0.96)" : "rgba(255,255,255,0.96)",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 18,
          paddingTop: 16,
          flexDirection: "row",
          gap: 12,
        },
        actionButton: {
          borderRadius: 20,
          minHeight: 56,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          flexDirection: "row",
          gap: 8,
        },
        secondaryAction: {
          flex: 1,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        primaryAction: {
          flex: 1.7,
          backgroundColor: colors.navActive,
        },
        secondaryActionText: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        primaryActionText: {
          color: isDark ? colors.background : "#ffffff",
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        sheetBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.48)",
          justifyContent: "center",
          paddingHorizontal: 20,
        },
        sheetCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
        },
        sheetTitle: {
          color: colors.text,
          fontSize: 18,
          fontFamily: omaTypography.extrabold,
          marginBottom: 8,
        },
        sheetBody: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.medium,
          lineHeight: 20,
          marginBottom: 18,
        },
        commentInput: {
          minHeight: 110,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          paddingHorizontal: 16,
          paddingTop: 16,
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.medium,
          textAlignVertical: "top",
        },
        sheetActions: {
          flexDirection: "row",
          gap: 10,
          marginTop: 18,
        },
        sheetActionButton: {
          flex: 1,
          minHeight: 52,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        sheetActionSecondary: {
          backgroundColor: colors.cardMuted,
        },
        sheetActionPrimary: {
          backgroundColor: colors.navActive,
        },
        sheetActionSecondaryText: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
        sheetActionPrimaryText: {
          color: isDark ? colors.background : "#ffffff",
          fontSize: 14,
          fontFamily: omaTypography.extrabold,
        },
      }),
    [colors, contentWidth, customerStats.hasCredit, insets.top, isDark]
  );

  const balanceAmount = Math.abs(
    (customerStats.totalCreditRaw || 0) - (customerStats.totalDebitRaw || 0)
  );
  const balanceSuffix = customerStats.hasCredit ? "CR" : "DR";

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.topGlow} />

      {loading ? (
        <LoadingIndicator message="Loading approvals..." showTips={true} />
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
                <Ionicons
                  color={colors.text}
                  name="arrow-back"
                  size={20}
                />
              </TouchableOpacity>

              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Executive Inbox</Text>
                <Text style={styles.headerTitle}>Approvals</Text>
                <Text style={styles.headerSubtitle}>
                  Manager review queue for live OMA orders.
                </Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryAccent} />
              <Text style={styles.summaryLabel}>Pending approval value</Text>
              <Text style={styles.summaryValue}>
                ₹{formatIndianNumber(summary.totalValue)}
              </Text>

              <View style={styles.summaryFoot}>
                <View
                  style={[
                    styles.metricPill,
                    {
                      backgroundColor: isDark
                        ? "rgba(0,102,255,0.16)"
                        : "#eef5ff",
                    },
                  ]}
                >
                  <Text
                    style={[styles.metricLabel, { color: colors.primary }]}
                  >
                    Fresh
                  </Text>
                  <Text
                    style={[styles.metricValue, { color: colors.primary }]}
                  >
                    {summary.pendingCount}
                  </Text>
                </View>
                <View
                  style={[
                    styles.metricPill,
                    {
                      backgroundColor: isDark
                        ? "rgba(248,113,113,0.16)"
                        : "#fff1f2",
                    },
                  ]}
                >
                  <Text
                    style={[styles.metricLabel, { color: colors.accentRed }]}
                  >
                    Recheck
                  </Text>
                  <Text
                    style={[styles.metricValue, { color: colors.accentRed }]}
                  >
                    {summary.recheckCount}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons
                color={colors.textSecondary}
                name="search-outline"
                size={20}
              />
              <TextInput
                placeholder="Search order, customer, rep, source, product"
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
              ) : null}
            </View>

            <View style={styles.filterRow}>
              <View style={styles.segmentShell}>
                {[
                  {
                    key: "all" as const,
                    label: "All",
                    count: orders.length,
                  },
                  {
                    key: "pending" as const,
                    label: "Fresh",
                    count: summary.pendingCount,
                  },
                  {
                    key: "recheck" as const,
                    label: "Recheck",
                    count: summary.recheckCount,
                  },
                ].map((item) => {
                  const active = reviewFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => setReviewFilter(item.key)}
                      style={[
                        styles.segmentButton,
                        active && styles.segmentButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active && styles.segmentTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={[
                          styles.segmentCount,
                          active
                            ? styles.segmentTextActive
                            : { color: colors.textSecondary },
                        ]}
                      >
                        {item.count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {(["date", "amount", "customer", "source"] as SortOption[]).map(
                (option) => {
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
                          setSortDirection(
                            option === "customer" || option === "source"
                              ? "asc"
                              : "desc"
                          );
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
                }
              )}
            </ScrollView>

            <Text style={styles.sectionLabel}>
              {sortedOrders.length} orders in manager queue
            </Text>

            {sortedOrders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  color={colors.textPlaceholder}
                  name="checkmark-circle-outline"
                  size={56}
                />
                <Text style={styles.emptyTitle}>No approvals pending</Text>
                <Text style={styles.emptyBody}>
                  Everything in this queue is cleared. Pull to refresh if you
                  expect new orders.
                </Text>
              </View>
            ) : (
              sortedOrders.map((order) => {
                const isRecheck = order.approvalStatus === "R";
                const hasNote = Boolean(order.orderComments?.trim());
                const bannerBackground = isRecheck
                  ? isDark
                    ? "rgba(248,113,113,0.16)"
                    : "#fff1f2"
                  : hasNote
                  ? isDark
                    ? "rgba(251,146,60,0.16)"
                    : "#fff7ed"
                  : isDark
                  ? "rgba(0,102,255,0.16)"
                  : "#eef5ff";
                const bannerColor = isRecheck
                  ? colors.accentRed
                  : hasNote
                  ? colors.accentOrange
                  : colors.primary;

                return (
                  <TouchableOpacity
                    key={order.orderId}
                    activeOpacity={0.92}
                    onPress={() => openOrder(order)}
                    style={styles.orderCard}
                  >
                    <View
                      style={[
                        styles.orderBanner,
                        { backgroundColor: bannerBackground },
                      ]}
                    >
                      <View style={styles.orderBannerLeft}>
                        <Ionicons
                          color={bannerColor}
                          name={
                            isRecheck
                              ? "alert-circle-outline"
                              : hasNote
                              ? "document-text-outline"
                              : "shield-checkmark-outline"
                          }
                          size={14}
                        />
                        <Text
                          style={[
                            styles.orderBannerLabel,
                            { color: bannerColor },
                          ]}
                        >
                          {isRecheck
                            ? "Needs Recheck"
                            : hasNote
                            ? "Field Note Attached"
                            : "Manager Review"}
                        </Text>
                      </View>
                      <Text style={styles.orderBannerDate}>
                        {formatDateChip(order.date)}
                      </Text>
                    </View>

                    <View style={styles.orderBody}>
                      <View style={styles.orderHeader}>
                        <View
                          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                        >
                          <View style={styles.repBadge}>
                            <Text style={styles.repBadgeText}>
                              {(order.user || "O").slice(0, 1).toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.orderIdentity}>
                            <Text numberOfLines={2} style={styles.customerName}>
                              {order.customerName}
                            </Text>
                            <Text style={styles.orderId}>{order.orderId}</Text>
                          </View>
                        </View>

                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.orderAmount}>
                            ₹{formatIndianNumber(order.totalAmount)}
                          </Text>
                          <Text style={styles.orderAge}>
                            {formatTimeAgo(order.date)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.metaRow}>
                        <View style={styles.metaChip}>
                          <Ionicons
                            color={colors.textSecondary}
                            name="person-outline"
                            size={12}
                          />
                          <Text style={styles.metaChipText}>{order.user}</Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Ionicons
                            color={colors.textSecondary}
                            name="cube-outline"
                            size={12}
                          />
                          <Text style={styles.metaChipText}>
                            {order.items.length} line
                            {order.items.length === 1 ? "" : "s"}
                          </Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Ionicons
                            color={colors.textSecondary}
                            name="call-outline"
                            size={12}
                          />
                          <Text style={styles.metaChipText}>{order.source}</Text>
                        </View>
                      </View>

                      {order.orderComments ? (
                        <View style={styles.notePreview}>
                          <Text style={styles.notePreviewLabel}>O.Note</Text>
                          <Text numberOfLines={2} style={styles.notePreviewText}>
                            {order.orderComments}
                          </Text>
                        </View>
                      ) : null}
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
        <View style={styles.detailScreen}>
          <View style={styles.topGlow} />
          <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={closeDetail} style={styles.circleButton}>
              <Ionicons color={colors.text} name="arrow-back" size={20} />
            </TouchableOpacity>

            <View style={styles.detailHeaderCenter}>
              <Text style={styles.detailHeaderEyebrow}>
                Authorization Review
              </Text>
              <Text numberOfLines={1} style={styles.detailHeaderTitle}>
                {selectedOrder?.orderId || "Order"}
              </Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {selectedOrder ? (
            <>
              <ScrollView
                contentContainerStyle={[
                  styles.detailContent,
                  styles.shell,
                  { paddingBottom: insets.bottom + 120 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.infoGrid}>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>Client</Text>
                    <Text style={styles.infoValue}>
                      {selectedOrder.customerName}
                    </Text>
                  </View>

                  <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>Submitted</Text>
                    <Text style={styles.infoValue}>
                      {formatDateChip(selectedOrder.date)}
                    </Text>
                    <Text style={styles.infoMeta}>Rep: {selectedOrder.user}</Text>
                  </View>
                </View>

                {selectedOrder.orderComments ? (
                  <View style={styles.detailNoteCard}>
                    <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
                      Field Note
                    </Text>
                    <Text style={styles.detailNoteValue}>
                      "{selectedOrder.orderComments}"
                    </Text>
                  </View>
                ) : null}

                {selectedOrder.managerComments ? (
                  <View style={styles.managerNoteCard}>
                    <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
                      Previous Manager Note
                    </Text>
                    <Text style={styles.detailNoteValue}>
                      {selectedOrder.managerComments}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.ledgerCard}>
                  <View style={styles.ledgerBlur} />
                  <View style={styles.ledgerHeader}>
                    <Text style={styles.ledgerTitle}>Ledger Summary</Text>
                    <Text style={styles.ledgerCategory}>
                      {selectedOrder.source || "OMA"}
                    </Text>
                  </View>

                  {ledgerLoading ? (
                    <View style={{ paddingVertical: 28 }}>
                      <ActivityIndicator color="#ffffff" size="small" />
                    </View>
                  ) : (
                    <>
                      <Text style={styles.ledgerBalanceLabel}>
                        Current Balance
                      </Text>
                      <Text style={styles.ledgerBalanceValue}>
                        ₹{formatIndianNumber(balanceAmount)}{" "}
                        <Text
                          style={[
                            styles.ledgerBalanceSuffix,
                            {
                              color: customerStats.hasCredit
                                ? colors.primary
                                : colors.accentOrange,
                            },
                          ]}
                        >
                          {balanceSuffix}
                        </Text>
                      </Text>

                      <View style={styles.ledgerDivider} />

                      <View style={styles.ledgerStatsRow}>
                        <View style={styles.ledgerStat}>
                          <Text style={styles.ledgerStatLabel}>Total Credits</Text>
                          <Text style={styles.ledgerStatValue}>
                            ₹{customerStats.totalCredit}
                          </Text>
                        </View>
                        <View style={styles.ledgerStat}>
                          <Text style={styles.ledgerStatLabel}>Total Debits</Text>
                          <Text style={styles.ledgerStatValue}>
                            ₹{customerStats.totalDebit}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {ledgerData.length > 0 ? (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Recent ledger activity</Text>
                    {ledgerData.slice(0, 5).map((entry, index) => {
                      const amount = formatIndianNumber(entry.Amount as string);
                      const isDebit = entry.DC === "D";
                      return (
                        <View
                          key={`${String(entry.Date)}-${index}`}
                          style={[
                            styles.ledgerRow,
                            index === Math.min(ledgerData.length, 5) - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                        >
                          <Text style={styles.ledgerRowDate}>
                            {String(entry.Date || "")}
                          </Text>
                          <View style={styles.ledgerRowBody}>
                            <Text numberOfLines={1} style={styles.ledgerRowTitle}>
                              {String(entry.Description || "").replace(
                                "Default ",
                                ""
                              )}
                            </Text>
                            <Text style={styles.ledgerRowMeta}>
                              {String(entry.Company_Year || "Company Year N/A")}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.ledgerAmount,
                              {
                                color: isDebit
                                  ? colors.accentRed
                                  : colors.accentGreen,
                              },
                            ]}
                          >
                            ₹{amount} {isDebit ? "DR" : "CR"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>
                    Line Items ({selectedOrder.items.length})
                  </Text>

                  {selectedOrder.items.map((item) => (
                    <View
                      key={`${selectedOrder.orderId}-${item.rowIndex}`}
                      style={styles.productRow}
                    >
                      <Text style={styles.productTitle}>{item.productName}</Text>
                      <Text style={styles.productMeta}>
                        {item.quantity} {item.unit} • @ ₹{item.rate}
                      </Text>
                      <Text style={styles.productAmount}>
                        ₹{formatIndianNumber(item.amount)}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.totalBar}>
                    <Text style={styles.totalLabel}>Gross Total</Text>
                    <Text style={styles.totalValue}>
                      ₹{formatIndianNumber(selectedOrder.totalAmount)}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity
                  disabled={approvalLoading}
                  onPress={() => handleApproval(false)}
                  style={[
                    styles.actionButton,
                    styles.secondaryAction,
                    approvalLoading && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.secondaryActionText}>
                    {approvalLoading ? "Processing..." : "Reject"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={approvalLoading}
                  onPress={() => setShowApproveModal(true)}
                  style={[
                    styles.actionButton,
                    styles.primaryAction,
                    approvalLoading && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.primaryActionText}>
                    {approvalLoading ? "Processing..." : "Authorize Order"}
                  </Text>
                  {!approvalLoading ? (
                    <Ionicons
                      color={isDark ? colors.background : "#ffffff"}
                      name="checkmark-circle-outline"
                      size={18}
                    />
                  ) : null}
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={showApproveModal}
        onRequestClose={() => setShowApproveModal(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setShowApproveModal(false)}
        >
          <Pressable style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Approval Comments</Text>
            <Text style={styles.sheetBody}>
              Add optional context for dispatch or finance before authorizing.
            </Text>

            <TextInput
              multiline
              numberOfLines={4}
              placeholder="Enter approval comments (optional)"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.commentInput}
              value={approvalComments}
              onChangeText={setApprovalComments}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={() => setShowApproveModal(false)}
                style={[
                  styles.sheetActionButton,
                  styles.sheetActionSecondary,
                ]}
              >
                <Text style={styles.sheetActionSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={approvalLoading}
                onPress={async () => {
                  setShowApproveModal(false);
                  await handleApproval(true, approvalComments);
                  setApprovalComments("");
                }}
                style={[
                  styles.sheetActionButton,
                  styles.sheetActionPrimary,
                  approvalLoading && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.sheetActionPrimaryText}>
                  {approvalLoading ? "Saving..." : "Confirm Approval"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={showRejectModal}
        onRequestClose={() => setShowRejectModal(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setShowRejectModal(false)}
        >
          <Pressable style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Rejection Reason</Text>
            <Text style={styles.sheetBody}>
              Capture the manager reason so the sales team knows what to fix.
            </Text>

            <TextInput
              multiline
              numberOfLines={4}
              placeholder="Enter reason for rejection"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.commentInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={() => setShowRejectModal(false)}
                style={[
                  styles.sheetActionButton,
                  styles.sheetActionSecondary,
                ]}
              >
                <Text style={styles.sheetActionSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={approvalLoading}
                onPress={confirmRejection}
                style={[
                  styles.sheetActionButton,
                  styles.sheetActionPrimary,
                  { backgroundColor: colors.accentRed },
                  approvalLoading && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.sheetActionPrimaryText}>
                  {approvalLoading ? "Saving..." : "Confirm Rejection"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


