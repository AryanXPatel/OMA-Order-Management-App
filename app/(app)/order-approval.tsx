import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  History,
  MoreHorizontal,
  ShieldAlert,
  X,
} from "lucide-react-native";
import LoadingIndicator from "@/components/LoadingIndicator";
import { FLOATING_NAV_SPACE } from "@/components/oma/OmaFloatingNav";
import { ThemeContext } from "@/context/ThemeContext";
import { useFeedback } from "@/context/FeedbackContext";
import {
  BACKEND_URL,
  apiCache,
  batchUpdateSheetRanges,
  fetchWithRetry,
} from "@/utils/apiManager";
import {
  calculateLedgerStats,
  fetchCustomerLedger,
} from "@/utils/ledgerUtils";
import { formatCompactOrderId } from "@/utils/orderDisplay";
import {
  buildApprovalSheetUpdates,
  buildRejectionSheetUpdates,
} from "@/utils/orderSheetSerializer";
import { formatRoleLabel, isManagerRole, normalizeAppRole } from "@/utils/roles";
import { omaTypography } from "@/utils/typography";

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

type ReviewFilter = "all" | "recheck";

type SheetOrderRow = {
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
  approvalStatus: string;
  managerComments: string;
  dispatchStatus: string;
  dispatchComments: string;
  dispatchTime: string;
  rowIndex: number;
};

const CARD = "#1C1C1E";
const CARD_MUTED = "#242426";
const SCREEN = "#121212";
const TEXT = "#ffffff";
const TEXT_SECONDARY = "#a1a1aa";
const TEXT_MUTED = "#71717a";
const BORDER = "rgba(255,255,255,0.04)";
const BORDER_STRONG = "rgba(255,255,255,0.06)";
const RED = "#F87171";
const AMBER = "#EAB308";
const BLUE = "#60A5FA";
const GREEN = "#10B981";

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

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
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

const parseAmount = (value: number | string | null | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const splitOrderId = (orderId: string) => {
  if (!orderId) {
    return ["", 0] as const;
  }

  const [fiscalYear = "", orderNumber = "0"] = orderId.split("_");
  return [fiscalYear, Number.parseInt(orderNumber, 10) || 0] as const;
};

export default function OrderApprovalScreen() {
  const { colors } = useContext(ThemeContext);
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
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalComments, setApprovalComments] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const contentWidth = Math.min(width - 40, 374);

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

      const rows = (response.data?.values || []) as string[][];
      const sheetRows: SheetOrderRow[] = rows
        .map((row: string[], index: number) => ({
          sysTime: row[0] || "",
          orderTime: row[1] || "",
          user: formatRoleLabel(row[2]) || "",
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
        .filter((row) => {
          return (
            row.orderId &&
            (row.approvalStatus === "" || row.approvalStatus === "R")
          );
        });

      const groupedOrders = sheetRows.reduce<Record<string, ApprovalOrder>>(
        (acc, row) => {
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

          acc[row.orderId].totalAmount += parseAmount(row.amount);
          return acc;
        },
        {}
      );

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
      const activeRole = normalizeAppRole(userRole);
      if (!isManagerRole(activeRole)) {
        showFeedback({
          type: "error",
          title: "Access Denied",
          message: "You don't have permission to access this screen.",
          actionText: "Go to Dashboard",
          onAction: () => router.replace("/(app)/main"),
          autoDismiss: false,
        });
        return;
      }

      if (userRole !== activeRole) {
        await AsyncStorage.setItem("userRole", activeRole);
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
        const updatedAtIso = new Date().toISOString();
        let successCount = 0;
        let failureCount = 0;

        const results = await Promise.allSettled(
          selectedOrder.items.map(async (item) => {
            await runSheetUpdates(
              buildApprovalSheetUpdates({
                rowIndex: item.rowIndex,
                comments: comments || "",
                updatedAtIso,
              })
            );
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
      const updatedAtIso = new Date().toISOString();
      let successCount = 0;
      let failureCount = 0;

      const results = await Promise.allSettled(
        selectedOrder.items.map(async (item) => {
          await runSheetUpdates(
            buildRejectionSheetUpdates({
              rowIndex: item.rowIndex,
              rejectionReason: rejectionReason || "No reason provided",
              updatedAtIso,
            })
          );
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

  const sortedOrders = useMemo(() => {
    return orders
      .filter((order) =>
        reviewFilter === "recheck" ? order.approvalStatus === "R" : true
      )
      .sort((a, b) => {
        const [aFY, aNum] = splitOrderId(a.orderId);
        const [bFY, bNum] = splitOrderId(b.orderId);
        return aFY !== bFY ? bFY.localeCompare(aFY) : bNum - aNum;
      });
  }, [orders, reviewFilter]);

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

  const balanceRaw =
    (customerStats.totalDebitRaw || 0) - (customerStats.totalCreditRaw || 0);
  const currentExposure = Math.max(0, balanceRaw);
  const selectedTotal = selectedOrder?.totalAmount || 0;
  const projectedExposure = currentExposure + selectedTotal;
  const compactSelectedId = selectedOrder
    ? formatCompactOrderId(selectedOrder.orderId)
    : "";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {loading ? (
        <LoadingIndicator message="Loading approvals..." showTips={true} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: insets.top + 8, paddingBottom: FLOATING_NAV_SPACE },
          ]}
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
          <View style={[styles.shell, { width: contentWidth }]}>
            <Text style={styles.pageTitle}>Approvals</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRail}
            >
              {[
                {
                  key: "all" as const,
                  label: `Action Required (${summary.pendingCount + summary.recheckCount})`,
                },
                { key: "recheck" as const, label: "History" },
              ].map((item) => {
                const active = reviewFilter === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.86}
                    onPress={() => setReviewFilter(item.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {sortedOrders.length === 0 ? (
              <View style={styles.emptyCard}>
                <CheckCircle2 color={TEXT_MUTED} size={48} strokeWidth={2.3} />
                <Text style={styles.emptyTitle}>No approvals pending</Text>
                <Text style={styles.emptyBody}>
                  Everything in this queue is cleared. Pull to refresh if you expect
                  new orders.
                </Text>
              </View>
            ) : (
              <View style={styles.cardStack}>
                {sortedOrders.map((order) => {
                  const isRecheck = order.approvalStatus === "R";
                  const hasNote = Boolean(order.orderComments?.trim());
                  const tone = isRecheck ? RED : hasNote ? AMBER : BLUE;
                  const statusLabel = isRecheck
                    ? "Recheck"
                    : hasNote
                    ? "Follow-up"
                    : "Needs Approval";

                  return (
                    <TouchableOpacity
                      key={order.orderId}
                      activeOpacity={0.9}
                      onPress={() => openOrder(order)}
                      style={styles.approvalCard}
                    >
                      <View style={styles.approvalHeader}>
                        <View style={styles.approvalTopLeft}>
                          <Text style={styles.approvalId}>
                            #{formatCompactOrderId(order.orderId)}
                          </Text>
                          <Text numberOfLines={1} style={[styles.approvalStatus, { color: tone }]}>
                            • {statusLabel}
                          </Text>
                        </View>
                        <Text style={styles.approvalAmount}>
                          Rs {formatIndianNumber(order.totalAmount)}
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={styles.approvalName}>
                        {order.customerName}
                      </Text>

                      <View style={[styles.reasonBox, { borderLeftColor: tone }]}>
                        <Text numberOfLines={3} style={styles.reasonBody}>
                          {order.orderComments ||
                            `${order.items.length} line${
                              order.items.length === 1 ? "" : "s"
                            } from ${
                              formatRoleLabel(order.user) || "field sales"
                            } requires manager approval before dispatch.`}
                        </Text>
                      </View>

                      <Text style={styles.reviewHint}>
                        Tap to review ledger & approve
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal animationType="slide" visible={detailVisible} onRequestClose={closeDetail}>
        <View style={styles.detailScreen}>
          <StatusBar barStyle="light-content" />

          <View style={[styles.detailHeader, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity onPress={closeDetail} style={styles.headerButton}>
              <ChevronLeft color={TEXT} size={21} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Review Approval</Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                Order #{compactSelectedId || "Pending"}
              </Text>
            </View>
            <View style={styles.headerButtonGhost}>
              <MoreHorizontal color={TEXT} size={21} strokeWidth={2} />
            </View>
          </View>

          {selectedOrder ? (
            <>
              <ScrollView
                contentContainerStyle={[
                  styles.detailContent,
                  { width: contentWidth, paddingBottom: insets.bottom + 124 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.exceptionBanner}>
                  <View style={styles.exceptionHeader}>
                    <ShieldAlert color={RED} size={20} strokeWidth={2.5} />
                    <Text style={styles.exceptionTitle}>
                      {selectedOrder.approvalStatus === "R"
                        ? "Risk Override Needed"
                        : selectedOrder.orderComments
                        ? "Manager Follow-Up"
                        : "Approval Required"}
                    </Text>
                  </View>
                  <Text style={styles.exceptionBody}>
                    {selectedOrder.orderComments ||
                      `Review ${selectedOrder.customerName}'s ledger and order value before moving this order to dispatch.`}
                  </Text>
                </View>

                <View style={styles.profileCard}>
                  <View style={styles.profileAccent} />
                  <Text style={styles.profileEyebrow}>Approval Snapshot</Text>
                  <Text numberOfLines={2} style={styles.profileCustomer}>
                    {selectedOrder.customerName}
                  </Text>
                  <Text numberOfLines={1} style={styles.profileId}>
                    Order #{compactSelectedId}
                  </Text>
                  <Text style={styles.profileAmount}>
                    Rs {formatIndianNumber(selectedOrder.totalAmount)}
                  </Text>
                  <Text style={styles.profileMeta}>
                    {selectedOrder.items.length} line item
                    {selectedOrder.items.length === 1 ? "" : "s"} awaiting manager action.
                  </Text>

                  <View style={styles.profileChips}>
                    <View style={styles.profileChip}>
                      <History color={TEXT_SECONDARY} size={14} strokeWidth={2.2} />
                      <Text style={styles.profileChipText}>
                        {formatDateChip(selectedOrder.date)}
                      </Text>
                    </View>
                    <View style={styles.profileChip}>
                      <CreditCard color={TEXT_SECONDARY} size={14} strokeWidth={2.2} />
                      <Text style={styles.profileChipText}>
                        {selectedOrder.source || "OMA"}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.sectionHeader}>
                  <CreditCard color={TEXT_SECONDARY} size={20} strokeWidth={2.2} />
                  <Text style={styles.sectionHeading}>Customer Ledger</Text>
                </View>

                <View style={styles.ledgerCard}>
                  {ledgerLoading ? (
                    <View style={styles.loadingBlock}>
                      <ActivityIndicator color={TEXT} size="small" />
                    </View>
                  ) : (
                    <>
                      <View style={styles.ledgerTopRow}>
                        <Text style={styles.ledgerLabel}>Current Exposure</Text>
                        <Text style={styles.ledgerPercent}>
                          {customerStats.hasCredit ? "Credit" : "Debit"}
                        </Text>
                      </View>
                      <View style={styles.exposureTrack}>
                        <View
                          style={[
                            styles.exposureFill,
                            {
                              width: `${Math.min(
                                100,
                                Math.max(
                                  12,
                                  selectedTotal > 0
                                    ? (currentExposure /
                                        (projectedExposure || selectedTotal)) *
                                        100
                                    : 12
                                )
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.ledgerRows}>
                        <View style={styles.ledgerMetricRow}>
                          <Text style={styles.ledgerMetricLabel}>Total Credits</Text>
                          <Text style={styles.ledgerMetricValue}>
                            Rs {customerStats.totalCredit}
                          </Text>
                        </View>
                        <View style={styles.ledgerMetricRow}>
                          <Text style={styles.ledgerMetricLabel}>Total Debits</Text>
                          <Text style={[styles.ledgerMetricValue, { color: RED }]}>
                            Rs {customerStats.totalDebit}
                          </Text>
                        </View>
                        <View style={styles.ledgerMetricRowWarning}>
                          <View style={styles.metricLabelIcon}>
                            <AlertTriangle color={AMBER} size={16} strokeWidth={2.2} />
                            <Text style={styles.ledgerMetricLabel}>Requested Order</Text>
                          </View>
                          <Text style={[styles.ledgerMetricValue, { color: AMBER }]}>
                            + Rs {formatIndianNumber(selectedOrder.totalAmount)}
                          </Text>
                        </View>
                        <View style={styles.ledgerMetricRowFinal}>
                          <Text style={styles.projectedLabel}>Projected Exposure</Text>
                          <Text style={styles.projectedValue}>
                            Rs {formatIndianNumber(projectedExposure)}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {ledgerData.length > 0 ? (
                  <>
                    <View style={styles.sectionHeader}>
                      <ActivityIcon color={TEXT_SECONDARY} size={20} strokeWidth={2.2} />
                      <Text style={styles.sectionHeading}>Recent Transactions</Text>
                    </View>
                    <View style={styles.transactionsCard}>
                      {ledgerData.slice(0, 3).map((entry, index) => {
                        const isDebit = entry.DC === "D";
                        const txColor = isDebit ? RED : GREEN;
                        return (
                          <View
                            key={`${String(entry.Date)}-${index}`}
                            style={styles.transactionRow}
                          >
                            <View style={styles.transactionLeft}>
                              <View
                                style={[
                                  styles.transactionIcon,
                                  { backgroundColor: `${txColor}18` },
                                ]}
                              >
                                <ActivityIcon
                                  color={txColor}
                                  size={18}
                                  strokeWidth={2.5}
                                />
                              </View>
                              <View style={styles.transactionCopy}>
                                <Text numberOfLines={1} style={styles.transactionTitle}>
                                  {String(entry.Description || "Ledger Entry").replace(
                                    "Default ",
                                    ""
                                  )}
                                </Text>
                                <Text style={styles.transactionMeta}>
                                  {String(entry.Date || "Date N/A")}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.transactionAmountBlock}>
                              <Text style={styles.transactionAmount}>
                                Rs {formatIndianNumber(entry.Amount)}
                              </Text>
                              <Text
                                style={[
                                  styles.transactionStatus,
                                  {
                                    color: txColor,
                                    backgroundColor: `${txColor}18`,
                                  },
                                ]}
                              >
                                {isDebit ? "Debit" : "Credit"}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <View style={styles.sectionHeader}>
                  <Box color={TEXT_SECONDARY} size={20} strokeWidth={2.2} />
                  <Text style={styles.sectionHeading}>Pending Order Line Items</Text>
                </View>

                <View style={styles.itemsCard}>
                  {selectedOrder.items.map((item) => (
                    <View key={`${selectedOrder.orderId}-${item.rowIndex}`} style={styles.itemRow}>
                      <View style={styles.qtyBox}>
                        <Text style={styles.qtyText}>{item.quantity}x</Text>
                      </View>
                      <View style={styles.itemCopy}>
                        <Text numberOfLines={2} style={styles.itemName}>
                          {item.productName}
                        </Text>
                        <Text style={styles.itemMeta}>
                          Rs {formatIndianNumber(item.rate)} / {item.unit || "unit"}
                        </Text>
                      </View>
                      <Text style={styles.itemAmount}>
                        Rs {formatIndianNumber(item.amount)}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Purchase</Text>
                    <Text style={styles.totalValue}>
                      Rs {formatIndianNumber(selectedOrder.totalAmount)}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.actionDock, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity
                  disabled={approvalLoading}
                  onPress={() => handleApproval(false)}
                  style={[styles.declineButton, approvalLoading && styles.disabledAction]}
                >
                  <Text style={styles.declineButtonText}>
                    {approvalLoading ? "Processing..." : "Decline"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={approvalLoading}
                  onPress={() => setShowApproveModal(true)}
                  style={[styles.approveButton, approvalLoading && styles.disabledAction]}
                >
                  <Text style={styles.approveButtonText}>
                    {approvalLoading ? "Processing..." : "Approve"}
                  </Text>
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
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowApproveModal(false)}>
          <Pressable style={styles.sheetCard}>
            <TouchableOpacity
              onPress={() => setShowApproveModal(false)}
              style={styles.sheetClose}
            >
              <X color={TEXT_MUTED} size={20} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Approve Order</Text>
            <Text style={styles.sheetKicker}>MANAGER NOTE</Text>
            <TextInput
              multiline
              numberOfLines={4}
              placeholder="e.g., Approved after ledger review..."
              placeholderTextColor={TEXT_MUTED}
              style={styles.commentInput}
              value={approvalComments}
              onChangeText={setApprovalComments}
            />
            <TouchableOpacity
              disabled={approvalLoading}
              onPress={async () => {
                setShowApproveModal(false);
                await handleApproval(true, approvalComments);
                setApprovalComments("");
              }}
              style={[styles.sheetPrimaryButton, approvalLoading && styles.disabledAction]}
            >
              <Text style={styles.sheetPrimaryText}>
                {approvalLoading ? "Saving..." : "Confirm Approval"}
              </Text>
              <CheckCircle2 color="#121212" size={18} strokeWidth={2.4} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={showRejectModal}
        onRequestClose={() => setShowRejectModal(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowRejectModal(false)}>
          <Pressable style={styles.sheetCard}>
            <TouchableOpacity
              onPress={() => setShowRejectModal(false)}
              style={styles.sheetClose}
            >
              <X color={TEXT_MUTED} size={20} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Decline Approval</Text>
            <Text style={styles.sheetKicker}>REJECTION REASON</Text>
            <TextInput
              multiline
              numberOfLines={4}
              placeholder="Tell the sales team what must be corrected..."
              placeholderTextColor={TEXT_MUTED}
              style={styles.commentInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />
            <TouchableOpacity
              disabled={approvalLoading}
              onPress={confirmRejection}
              style={[styles.sheetDangerButton, approvalLoading && styles.disabledAction]}
            >
              <Text style={styles.sheetDangerText}>
                {approvalLoading ? "Saving..." : "Confirm Decline"}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SCREEN,
  },
  listContent: {
    flexGrow: 1,
  },
  shell: {
    alignSelf: "center",
  },
  pageTitle: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  filterRail: {
    paddingBottom: 16,
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: CARD,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: TEXT,
  },
  filterChipText: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.semibold,
    fontSize: 14,
    letterSpacing: -0.35,
  },
  filterChipTextActive: {
    color: "#000000",
  },
  cardStack: {
    gap: 14,
  },
  approvalCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
    padding: 16,
  },
  approvalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  approvalTopLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  approvalName: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.45,
    marginBottom: 8,
  },
  approvalId: {
    color: "#d4d4d8",
    fontFamily: omaTypography.bold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: -0.3,
    backgroundColor: "#27272a",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
  },
  approvalStatus: {
    flex: 1,
    fontFamily: omaTypography.semibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  approvalAmount: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    textAlign: "right",
  },
  reasonBox: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginTop: 0,
  },
  reasonBody: {
    color: TEXT_MUTED,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  reviewHint: {
    display: "none",
  },
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 46,
  },
  emptyTitle: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 18,
    letterSpacing: -0.45,
    marginTop: 16,
  },
  emptyBody: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.medium,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.35,
    textAlign: "center",
    marginTop: 8,
  },
  detailScreen: {
    flex: 1,
    backgroundColor: SCREEN,
  },
  detailHeader: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_STRONG,
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_MUTED,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonGhost: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.45,
  },
  headerSubtitle: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.325,
    marginTop: 4,
  },
  detailContent: {
    alignSelf: "center",
    paddingTop: 24,
  },
  exceptionBanner: {
    backgroundColor: CARD,
    borderColor: "rgba(248,113,113,0.20)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  exceptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  exceptionTitle: {
    color: RED,
    fontFamily: omaTypography.bold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  exceptionBody: {
    color: "rgba(248,113,113,0.92)",
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.25,
  },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    padding: 20,
    overflow: "hidden",
    marginBottom: 22,
  },
  profileAccent: {
    display: "none",
  },
  profileEyebrow: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.bold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  profileCustomer: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.45,
  },
  profileId: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.semibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.25,
    marginTop: 4,
  },
  profileAmount: {
    color: TEXT,
    fontFamily: omaTypography.semibold,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.45,
    marginTop: 12,
  },
  profileMeta: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: -0.325,
    marginTop: 3,
  },
  profileChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  profileChip: {
    borderRadius: 999,
    backgroundColor: CARD_MUTED,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileChipText: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.semibold,
    fontSize: 12,
    letterSpacing: -0.3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionHeading: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.35,
  },
  ledgerCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    padding: 18,
    marginBottom: 24,
  },
  loadingBlock: {
    paddingVertical: 28,
  },
  ledgerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  ledgerLabel: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    letterSpacing: -0.325,
  },
  ledgerPercent: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 13,
    letterSpacing: -0.325,
  },
  exposureTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    marginBottom: 20,
  },
  exposureFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: RED,
  },
  ledgerRows: {
    gap: 10,
  },
  ledgerMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ledgerMetricRowWarning: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER_STRONG,
    paddingTop: 14,
    marginTop: 2,
  },
  ledgerMetricRowFinal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  metricLabelIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ledgerMetricLabel: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.medium,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.3,
  },
  ledgerMetricValue: {
    color: TEXT,
    fontFamily: omaTypography.semibold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.3,
    textAlign: "right",
  },
  projectedLabel: {
    color: "#e4e4e7",
    fontFamily: omaTypography.semibold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.3,
  },
  projectedValue: {
    color: RED,
    fontFamily: omaTypography.semibold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.3,
    textAlign: "right",
  },
  transactionsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    padding: 8,
    marginBottom: 24,
    gap: 4,
  },
  transactionRow: {
    borderRadius: 20,
    backgroundColor: CARD_MUTED,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  transactionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 10,
  },
  transactionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionCopy: {
    flex: 1,
  },
  transactionTitle: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.35,
  },
  transactionMeta: {
    color: TEXT_MUTED,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.325,
    marginTop: 2,
  },
  transactionAmountBlock: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.375,
  },
  transactionStatus: {
    borderRadius: 6,
    overflow: "hidden",
    fontFamily: omaTypography.bold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  itemsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    padding: 8,
    marginBottom: 24,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 20,
    backgroundColor: CARD_MUTED,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  qtyBox: {
    minWidth: 36,
    height: 30,
    borderRadius: 10,
    backgroundColor: CARD_MUTED,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    color: "#d4d4d8",
    fontFamily: omaTypography.bold,
    fontSize: 13,
    letterSpacing: -0.325,
  },
  itemCopy: {
    flex: 1,
  },
  itemName: {
    color: TEXT,
    fontFamily: omaTypography.semibold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.375,
  },
  itemMeta: {
    color: TEXT_MUTED,
    fontFamily: omaTypography.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.325,
    marginTop: 2,
  },
  itemAmount: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.375,
    textAlign: "right",
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER_STRONG,
    backgroundColor: CARD_MUTED,
    marginHorizontal: -8,
    marginBottom: -8,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.semibold,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.3,
  },
  totalValue: {
    color: TEXT,
    fontFamily: omaTypography.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  actionDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: BORDER_STRONG,
    backgroundColor: SCREEN,
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 15,
    letterSpacing: -0.35,
  },
  approveButton: {
    flex: 1.35,
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  approveButtonText: {
    color: "#08130f",
    fontFamily: omaTypography.bold,
    fontSize: 15,
    letterSpacing: -0.35,
    textAlign: "center",
  },
  disabledAction: {
    opacity: 0.7,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  sheetCard: {
    backgroundColor: CARD,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: BORDER_STRONG,
    paddingHorizontal: 30,
    paddingTop: 28,
    paddingBottom: 30,
  },
  sheetClose: {
    position: "absolute",
    top: 24,
    right: 22,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CARD_MUTED,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    color: TEXT,
    fontFamily: omaTypography.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.55,
    marginBottom: 26,
    paddingRight: 42,
  },
  sheetKicker: {
    color: TEXT_SECONDARY,
    fontFamily: omaTypography.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  commentInput: {
    minHeight: 98,
    borderRadius: 14,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    color: TEXT,
    fontFamily: omaTypography.medium,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.35,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: "top",
  },
  sheetPrimaryButton: {
    minHeight: 58,
    borderRadius: 28,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 30,
  },
  sheetPrimaryText: {
    color: "#08130f",
    fontFamily: omaTypography.bold,
    fontSize: 15,
    letterSpacing: -0.35,
  },
  sheetDangerButton: {
    minHeight: 58,
    borderRadius: 28,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
  sheetDangerText: {
    color: "#1a0b0b",
    fontFamily: omaTypography.bold,
    fontSize: 15,
    letterSpacing: -0.35,
  },
});
