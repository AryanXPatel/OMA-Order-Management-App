import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  Share,
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
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FileText,
  MoreHorizontal,
  ScanLine,
  Truck,
  X,
} from "lucide-react-native";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useFeedback } from "@/context/FeedbackContext";
import {
  BACKEND_URL,
  apiCache,
  batchUpdateSheetRanges,
  fetchWithRetry,
} from "@/utils/apiManager";
import { formatCompactOrderId } from "@/utils/orderDisplay";
import { buildDispatchSheetUpdates } from "@/utils/orderSheetSerializer";
import { omaTypography } from "@/utils/typography";

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

const aisleFallbacks = ["Aisle B4", "Aisle C1", "Aisle A9"];
const defaultOrderNote =
  "Leave at the back loading dock. Call manager upon arrival. Please ensure Titanium Widgets are packed in additional bubble wrap.";

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

const formatSheetDateTime = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hours = date.getHours();
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;

  return `${day}/${month}/${year} ${hours12}:${minutes} ${meridiem}`;
};

const getLineAmount = (item: OrderLineItem) => {
  const cleaned = String(item.amount || "0").replace(/,/g, "");
  const parsed = Number.parseFloat(cleaned);

  if (Number.isNaN(parsed)) {
    return item.amount || "0.00";
  }

  return formatIndianCurrency(parsed);
};

export default function OrderDetailsScreen() {
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [order, setOrder] = useState<SelectedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickedRows, setPickedRows] = useState<Record<number, boolean>>({});
  const [dispatching, setDispatching] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [packingNote, setPackingNote] = useState("");
  const pingAnim = useRef(new Animated.Value(0)).current;

  const contentWidth = Math.min(width - 40, 374);

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
        setPickedRows({});
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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pingAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );

    loop.start();

    return () => {
      loop.stop();
      pingAnim.setValue(0);
    };
  }, [pingAnim]);

  const pendingDispatchItems = useMemo(
    () =>
      (order?.items || []).filter(
        (item) => item.approved === "Y" && !item.rejected && !item.dispatched
      ),
    [order]
  );

  const pickListItems = useMemo(() => {
    if (!order) {
      return [];
    }

    return pendingDispatchItems.length > 0
      ? pendingDispatchItems
      : order.items.filter((item) => !item.rejected);
  }, [order, pendingDispatchItems]);

  const pickedCount = pickListItems.filter(
    (item) => pickedRows[item.actualRowIndex]
  ).length;
  const readyForPicking =
    !!order && order.status === "approved" && pendingDispatchItems.length > 0;
  const allPicked =
    readyForPicking && pickedCount === pendingDispatchItems.length;
  const compactId = formatCompactOrderId(order?.orderId);
  const noteText =
    order?.orderComments ||
    order?.managerComments ||
    order?.dispatchComments ||
    defaultOrderNote;

  const togglePickedRow = useCallback(
    (rowIndex: number) => {
      if (!readyForPicking) {
        return;
      }

      setPickedRows((current) => ({
        ...current,
        [rowIndex]: !current[rowIndex],
      }));
    },
    [readyForPicking]
  );

  const shareOrder = useCallback(async () => {
    if (!order) {
      return;
    }

    try {
      await Share.share({
        title: `Order ${order.orderId}`,
        message: `Order ${order.orderId}\nCustomer: ${
          order.customerName
        }\nTotal: Rs ${formatIndianCurrency(order.totalAmount)}`,
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

  const handleDispatchPicked = useCallback(async () => {
    if (!order || !readyForPicking) {
      return;
    }

    const selectedItems = pendingDispatchItems.filter(
      (item) => pickedRows[item.actualRowIndex]
    );

    if (selectedItems.length === 0) {
      return;
    }

    try {
      setDispatching(true);
      const dispatchMoment = new Date();
      const dispatchDisplayTime = formatSheetDateTime(dispatchMoment);
      const dispatchAtIso = dispatchMoment.toISOString();

      const updates = selectedItems.flatMap((item) =>
        buildDispatchSheetUpdates({
          rowIndex: item.actualRowIndex,
          dispatchRemark:
            packingNote.trim() || order.dispatchComments || order.orderComments || "",
          dispatchDisplayTime,
          dispatchAtIso,
        })
      );

      await runSheetUpdates(updates);

      const dispatchedRows = new Set(
        selectedItems.map((item) => item.actualRowIndex)
      );
      const nextItems = order.items.map((item) =>
        dispatchedRows.has(item.actualRowIndex)
          ? {
              ...item,
              dispatched: true,
              dispatchTime: dispatchDisplayTime,
              comments: order.dispatchComments || item.comments,
            }
          : item
      );
      const nextOrder: SelectedOrder = {
        ...order,
        items: nextItems,
        status: nextItems.every((item) => item.dispatched)
          ? "dispatched"
          : order.status,
      };

      setOrder(nextOrder);
      setPickedRows({});
      setReviewVisible(false);
      setPackingNote("");
      apiCache.set("myOrders", null);
      apiCache.set("approvedOrders", null);
      await AsyncStorage.setItem("selectedOrder", JSON.stringify(nextOrder));

      showFeedback({
        type: "success",
        title:
          nextOrder.status === "dispatched"
            ? "Order Dispatched"
            : "Items Dispatched",
        message:
          nextOrder.status === "dispatched"
            ? "All line items have been marked as dispatched."
            : `${selectedItems.length} line item(s) dispatched. Remaining items stay in Processing.`,
        autoDismiss: true,
      });
    } catch (error: any) {
      Alert.alert(
        "Dispatch Failed",
        error?.message || "Could not dispatch the selected items. Please try again."
      );
    } finally {
      setDispatching(false);
    }
  }, [
    order,
    pendingDispatchItems,
    pickedRows,
    packingNote,
    readyForPicking,
    runSheetUpdates,
    showFeedback,
  ]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <LoadingIndicator message="Loading order details..." />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <ChevronLeft color="#ffffff" size={21} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Order Details</Text>
            <Text style={styles.headerSubtitle}>Unavailable</Text>
          </View>
          <View style={styles.headerButton} />
        </View>
        <View style={[styles.timelineCard, { width: contentWidth, alignSelf: "center" }]}>
          <Text style={styles.timelineTitle}>Order details unavailable.</Text>
          <Text style={styles.stepMeta}>
            Return to order history and open the order again.
          </Text>
        </View>
      </View>
    );
  }

  const actionDisabled = !readyForPicking || pickedCount === 0 || dispatching;
  const isDispatched = order.status === "dispatched";
  const pingStyle = {
    opacity: pingAnim.interpolate({
      inputRange: [0, 0.72, 1],
      outputRange: [0.5, 0.18, 0],
    }),
    transform: [
      {
        scale: pingAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.85],
        }),
      },
    ],
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <ChevronLeft color="#ffffff" size={21} strokeWidth={2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order #{compactId}</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {order.customerName}
          </Text>
        </View>

        <TouchableOpacity onPress={shareOrder} style={styles.headerButtonGhost}>
          <MoreHorizontal color="#ffffff" size={21} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              (readyForPicking ? 168 : 42) + Math.max(insets.bottom, 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.timelineCard, { width: contentWidth }]}>
          <Text style={styles.timelineTitle}>Fulfillment Timeline</Text>

          <View style={styles.timelineBody}>
            <View style={styles.rail}>
              <View style={[styles.stepDot, styles.approvedDot]}>
                <CheckCircle2 color="#121212" size={19} strokeWidth={2.5} />
              </View>
              <View style={styles.approvedLine} />
              <View
                style={[
                  styles.stepDot,
                  isDispatched ? styles.approvedDot : styles.processingDot,
                ]}
              >
                {!isDispatched ? <Animated.View style={[styles.pingCircle, pingStyle]} /> : null}
                {isDispatched ? (
                  <CheckCircle2 color="#121212" size={19} strokeWidth={2.5} />
                ) : (
                  <Box color="#121212" size={17} strokeWidth={2.5} />
                )}
              </View>
              <View style={styles.inactiveLine} />
              <View
                style={[
                  styles.stepDot,
                  isDispatched ? styles.approvedDot : styles.inactiveDot,
                ]}
              >
                <Truck
                  color={isDispatched ? "#121212" : "#71717a"}
                  size={16}
                  strokeWidth={2.5}
                />
              </View>
            </View>

            <View style={styles.timelineText}>
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>Order Approved</Text>
                <Text style={styles.stepMeta}>
                  {order.status === "pending" ? "Today, 09:41 AM" : "Today, 09:41 AM"}
                </Text>
              </View>
              <View style={styles.stepBlock}>
                <Text
                  style={[
                    styles.stepTitle,
                    !isDispatched && styles.processingText,
                  ]}
                >
                  Warehouse Processing
                </Text>
                <Text style={styles.stepMeta}>
                  {pickedCount} of {pickListItems.length} items picked
                </Text>
              </View>
              <View style={styles.stepBlock}>
                <Text
                  style={[
                    styles.stepTitle,
                    !isDispatched && styles.deliveryMuted,
                  ]}
                >
                  Out for Delivery
                </Text>
                <Text
                  style={[
                    styles.stepMeta,
                    !isDispatched && styles.deliveryMetaMuted,
                  ]}
                >
                  {isDispatched ? "All items fulfilled" : "Pending dispatch"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.notesCard, { width: contentWidth }]}>
          <View style={styles.notesHeader}>
            <FileText color="#EAB308" size={16} strokeWidth={2} />
            <Text style={styles.notesTitle}>Order Notes</Text>
          </View>
          <Text style={styles.notesBody}>"{noteText}"</Text>
        </View>

        <View style={[styles.sectionHeader, { width: contentWidth }]}>
          <View style={styles.sectionTitleWrap}>
            <ClipboardList color="#a1a1aa" size={20} strokeWidth={2} />
            <Text style={styles.sectionTitle}>
              {readyForPicking ? "Interactive Pick List" : "Order Details"}
            </Text>
          </View>

          {readyForPicking ? (
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {pickedCount} / {pendingDispatchItems.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.itemsCard,
            readyForPicking && styles.pickItemsCard,
            { width: contentWidth },
          ]}
        >
          {pickListItems.map((item, index) => {
            const picked = !!pickedRows[item.actualRowIndex];

            if (readyForPicking) {
              return (
                <TouchableOpacity
                  activeOpacity={0.86}
                  key={`${item.actualRowIndex}-${index}`}
                  onPress={() => togglePickedRow(item.actualRowIndex)}
                  style={[styles.pickItem, picked && styles.pickedItem]}
                >
                  <View style={[styles.pickCircle, picked && styles.pickedCircle]}>
                    {picked ? (
                      <CheckCircle2 color="#121212" size={15} strokeWidth={3} />
                    ) : null}
                  </View>
                  <View style={styles.itemTextWrap}>
                    <Text numberOfLines={2} style={styles.itemName}>
                      {item.quantity}x {item.productName}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Location: {aisleFallbacks[index % aisleFallbacks.length]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }

            return (
              <View key={`${item.actualRowIndex}-${index}`} style={styles.detailItem}>
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyText}>{item.quantity}x</Text>
                </View>
                <View style={styles.itemTextWrap}>
                  <Text numberOfLines={2} style={styles.itemName}>
                    {item.productName}
                  </Text>
                  <Text style={styles.itemMeta}>
                    Location: {aisleFallbacks[index % aisleFallbacks.length]}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>Rs {getLineAmount(item)}</Text>
              </View>
            );
          })}

          {!readyForPicking ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Billed</Text>
              <Text style={styles.totalValue}>
                Rs {formatIndianCurrency(order.totalAmount)}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {readyForPicking ? (
        <>
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: 20 + Math.max(insets.bottom, 0) },
          ]}
        >
          <TouchableOpacity
            activeOpacity={actionDisabled ? 1 : 0.86}
            disabled={actionDisabled}
            onPress={() => {
              if (!actionDisabled) {
                setReviewVisible(true);
              }
            }}
            style={[
              styles.primaryButton,
              actionDisabled && styles.disabledButton,
              allPicked && !actionDisabled && styles.fullDispatchButton,
              pickedCount > 0 && !allPicked && styles.partialDispatchButton,
            ]}
          >
            {dispatching ? (
              <ActivityIndicator color="#121212" size="small" />
            ) : null}
            <Text
              style={[
                styles.primaryButtonText,
                actionDisabled && styles.disabledButtonText,
              ]}
            >
              {dispatching
                ? "Dispatching..."
                : pickedCount === 0
                ? "Pick items to dispatch"
                : allPicked
                ? "Review Full Dispatch"
                : "Review Partial Dispatch"}
            </Text>
            {!dispatching ? (
              allPicked ? (
                <Truck color={actionDisabled ? "#71717a" : "#121212"} size={18} strokeWidth={2} />
              ) : pickedCount > 0 ? (
                <AlertTriangle color={actionDisabled ? "#71717a" : "#121212"} size={18} strokeWidth={2} />
              ) : (
                <ScanLine color={actionDisabled ? "#71717a" : "#121212"} size={18} strokeWidth={2} />
              )
            ) : null}
          </TouchableOpacity>
        </View>
        {reviewVisible ? (
          <View style={styles.reviewOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setReviewVisible(false)}
              style={styles.reviewBackdrop}
            />
            <View style={styles.reviewSheet}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewTitle}>Finalize Dispatch</Text>
                <TouchableOpacity
                  onPress={() => setReviewVisible(false)}
                  style={styles.reviewCloseButton}
                >
                  <X color="#a1a1aa" size={20} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {!allPicked ? (
                <View style={styles.partialWarning}>
                  <View style={styles.partialWarningHeader}>
                    <AlertTriangle color="#EAB308" size={14} strokeWidth={2.5} />
                    <Text style={styles.partialWarningTitle}>Partial Dispatch</Text>
                  </View>
                  <Text style={styles.partialWarningBody}>
                    {pendingDispatchItems.length - pickedCount} unpicked item(s)
                    will stay in Processing for the next dispatch run.
                  </Text>
                </View>
              ) : null}

              <View style={styles.noteInputGroup}>
                <Text style={styles.noteInputLabel}>Processing / Packing Note</Text>
                <TextInput
                  multiline
                  onChangeText={setPackingNote}
                  placeholder="e.g., Packed safely in 2 heavy-duty boxes, handle with care..."
                  placeholderTextColor="#52525b"
                  style={styles.noteInput}
                  textAlignVertical="top"
                  value={packingNote}
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                disabled={dispatching}
                onPress={handleDispatchPicked}
                style={[
                  styles.confirmDispatchButton,
                  !allPicked && styles.confirmPartialButton,
                ]}
              >
                {dispatching ? (
                  <ActivityIndicator color="#121212" size="small" />
                ) : null}
                <Text style={styles.confirmDispatchText}>Confirm & Dispatch</Text>
                {!dispatching ? (
                  <Truck color="#121212" size={19} strokeWidth={2} />
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#1C1C1E",
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#242426",
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
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 18,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.45,
  },
  headerSubtitle: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.25,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    alignItems: "center",
  },
  timelineCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    padding: 24,
    marginBottom: 24,
  },
  timelineTitle: {
    color: "#ffffff",
    fontSize: 17,
    lineHeight: 25.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.425,
    marginBottom: 24,
  },
  timelineBody: {
    flexDirection: "row",
    gap: 16,
  },
  rail: {
    width: 32,
    alignItems: "center",
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
  },
  pingCircle: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#60A5FA",
  },
  approvedDot: {
    backgroundColor: "#10B981",
  },
  processingDot: {
    backgroundColor: "#60A5FA",
    shadowColor: "#60A5FA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  inactiveDot: {
    backgroundColor: "#27272a",
  },
  approvedLine: {
    width: 2,
    height: 40,
    marginVertical: -1,
    backgroundColor: "#10B981",
  },
  inactiveLine: {
    width: 2,
    height: 40,
    marginVertical: -1,
    backgroundColor: "#27272a",
  },
  timelineText: {
    flex: 1,
    gap: 18,
  },
  stepBlock: {
    minHeight: 32,
    justifyContent: "center",
  },
  stepTitle: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22.5,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.375,
  },
  processingText: {
    color: "#60A5FA",
  },
  deliveryMuted: {
    color: "#52525b",
  },
  stepMeta: {
    color: "#71717a",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.375,
    marginTop: 1,
  },
  deliveryMetaMuted: {
    color: "#52525b",
  },
  notesCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    padding: 24,
    marginBottom: 28,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  notesTitle: {
    color: "#EAB308",
    fontSize: 14,
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontFamily: omaTypography.bold,
  },
  notesBody: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 24.375,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.375,
  },
  sectionHeader: {
    marginBottom: 14,
    paddingHorizontal: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 27,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.45,
  },
  counterPill: {
    borderRadius: 9,
    backgroundColor: "rgba(96,165,250,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  counterText: {
    color: "#60A5FA",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.25,
  },
  itemsCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    paddingTop: 12,
  },
  pickItemsCard: {
    padding: 8,
  },
  detailItem: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pickItem: {
    minHeight: 78,
    borderRadius: 20,
    backgroundColor: "#242426",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  pickedItem: {
    backgroundColor: "rgba(16,185,129,0.1)",
    borderColor: "rgba(16,185,129,0.24)",
  },
  pickCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#71717a",
    alignItems: "center",
    justifyContent: "center",
  },
  pickedCircle: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  qtyBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#242426",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 19.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.325,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemName: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22.5,
    fontFamily: omaTypography.semibold,
    letterSpacing: -0.375,
  },
  itemMeta: {
    color: "#71717a",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.25,
    marginTop: 2,
  },
  itemAmount: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.375,
    marginLeft: 10,
  },
  totalRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#242426",
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    color: "#a1a1aa",
    fontSize: 15,
    lineHeight: 22.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.375,
  },
  totalValue: {
    color: "#ffffff",
    fontSize: 22,
    lineHeight: 33,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.55,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(18,18,18,0.96)",
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#60A5FA",
  },
  partialDispatchButton: {
    backgroundColor: "#EAB308",
  },
  fullDispatchButton: {
    backgroundColor: "#60A5FA",
  },
  disabledButton: {
    backgroundColor: "#242426",
  },
  primaryButtonText: {
    color: "#121212",
    fontSize: 17,
    lineHeight: 25.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.425,
  },
  disabledButtonText: {
    color: "#71717a",
  },
  reviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: "flex-end",
  },
  reviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  reviewSheet: {
    backgroundColor: "#1C1C1E",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -18 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 24,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  reviewTitle: {
    color: "#ffffff",
    fontSize: 22,
    lineHeight: 28,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.55,
  },
  reviewCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#242426",
    alignItems: "center",
    justifyContent: "center",
  },
  partialWarning: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(234,179,8,0.2)",
    backgroundColor: "rgba(234,179,8,0.1)",
    padding: 16,
    marginBottom: 20,
  },
  partialWarningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  partialWarningTitle: {
    color: "#EAB308",
    fontSize: 13,
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: omaTypography.bold,
  },
  partialWarningBody: {
    color: "rgba(234,179,8,0.9)",
    fontSize: 14,
    lineHeight: 19,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.35,
  },
  noteInputGroup: {
    marginBottom: 24,
  },
  noteInputLabel: {
    color: "#71717a",
    fontSize: 13,
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 1.04,
    fontFamily: omaTypography.bold,
    marginBottom: 8,
    paddingLeft: 4,
  },
  noteInput: {
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "#121212",
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 24,
    fontFamily: omaTypography.medium,
    letterSpacing: -0.4,
    padding: 16,
  },
  confirmDispatchButton: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: "#60A5FA",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  confirmPartialButton: {
    backgroundColor: "#EAB308",
  },
  confirmDispatchText: {
    color: "#000000",
    fontSize: 17,
    lineHeight: 25.5,
    fontFamily: omaTypography.bold,
    letterSpacing: -0.425,
  },
});
