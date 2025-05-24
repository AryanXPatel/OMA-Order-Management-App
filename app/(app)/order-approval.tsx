import React, { useState, useEffect, useContext } from "react";
import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import {
  scale,
  isTablet,
  screenWidth,
  screenHeight,
} from "../utils/responsive";

import { useFeedback } from "../context/FeedbackContext";

import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import LoadingIndicator from "../components/LoadingIndicator";

import {
  fetchCustomerLedger,
  calculateLedgerStats,
} from "../utils/ledgerUtils";

const BACKEND_URL = "https://oma-demo-server.onrender.com";
// Helper function
const formatIndianNumber = (num) => {
  try {
    // Handle all edge cases
    if (num === undefined || num === null || num === "" || isNaN(num)) {
      return "0.00";
    }

    // Convert to number safely
    let numValue =
      typeof num === "string" && typeof num.replace === "function"
        ? parseFloat(num.replace(/,/g, "")) || 0
        : parseFloat(num) || 0;

    // Handle NaN
    if (isNaN(numValue)) {
      return "0.00";
    }

    // Use toLocaleString for Indian formatting
    return numValue.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (error) {
    console.error("Error formatting number:", error, "Input:", num);
    return "0.00";
  }
};
const parseOrderDate = (dateStr) => {
  if (!dateStr) return new Date(0);

  try {
    // Split date and time parts
    const parts = dateStr.trim().split(" ");
    const datePart = parts[0];

    if (datePart.includes("/")) {
      const [day, month, year] = datePart
        .split("/")
        .map((num) => parseInt(num, 10));
      if (day && month && year) {
        // Create date with local timezone (month is 0-indexed in JS)
        return new Date(year, month - 1, day);
      }
    }

    // Fallback to standard JS date parsing
    return new Date(dateStr);
  } catch (error) {
    return new Date(0); // Return epoch date as fallback
  }
};

const formatDateForSorting = (dateStr) => {
  try {
    if (!dateStr) return new Date(0).getTime();

    // First, normalize the date string format
    // Handle cases where time might have different formats
    const dateTimeParts = dateStr.split(/\s+/); // Split by any whitespace
    const datePart = dateTimeParts[0];

    // Extract time and AM/PM parts, handling various formats
    let timePart = "";
    let ampmPart = "";

    if (dateTimeParts.length > 1) {
      // Check if AM/PM is attached to the time or separated
      const timeString = dateTimeParts.slice(1).join(" ");

      if (timeString.includes("AM") || timeString.includes("PM")) {
        if (timeString.includes(" ")) {
          // Format like "12:58 AM"
          const parts = timeString.split(" ");
          timePart = parts[0];
          ampmPart = parts[1];
        } else {
          // Format like "12:58AM"
          const match = timeString.match(/(.+?)(AM|PM)$/i);
          if (match) {
            timePart = match[1];
            ampmPart = match[2];
          }
        }
      } else {
        // Just time without AM/PM
        timePart = timeString;
      }
    }

    // Parse date part (DD/MM/YYYY)
    const [day, month, year] = datePart.split("/").map(Number);

    // Create a base date object
    const date = new Date(year, month - 1, day);

    // Parse and add time if available
    if (timePart) {
      const [hourStr, minuteStr, secondStr] = timePart
        .split(":")
        .map((s) => s?.trim());
      let hours = parseInt(hourStr, 10);
      const minutes = parseInt(minuteStr, 10) || 0;
      const seconds = parseInt(secondStr, 10) || 0;

      // Convert 12-hour format to 24-hour
      if (ampmPart) {
        const isPM = ampmPart.toUpperCase() === "PM";

        // Special case for 12 AM (midnight) = 0 hours in 24-hour format
        if (hours === 12 && !isPM) {
          hours = 0;
        }
        // Special case for 12 PM (noon) = 12 hours in 24-hour format
        else if (hours === 12 && isPM) {
          hours = 12;
        }
        // Regular PM time: add 12 hours
        else if (isPM) {
          hours += 12;
        }
      }

      date.setHours(hours, minutes, seconds);
    }

    // Get timestamp for comparison
    const timestamp = date.getTime();

    // Debug logging

    return timestamp;
  } catch (e) {
    return new Date(0).getTime(); // Return epoch as fallback
  }
};

const getCurrentFiscalYear = () => {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-indexed (January is 0)
  const currentYear = today.getFullYear();

  // April is month 3 (0-indexed)
  const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fiscalYearEnd = fiscalYearStart + 1;
  return `${fiscalYearStart}-${fiscalYearEnd}`;
};

const OrderCard = React.memo(
  ({ item, viewOrderDetails, isDark, colors, formatIndianNumber }) => (
    <TouchableOpacity
      style={{
        backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
        borderRadius: 10,
        padding: 15,
        marginBottom: 10,
        marginHorizontal: 15,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 2,
      }}
      onPress={() => viewOrderDetails(item)}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 5,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: isDark ? colors.primary : colors.primary,
            marginBottom: 5,
          }}
        >
          Order ID: {item.orderId}
        </Text>
        <View
          style={{
            backgroundColor: "#f39c12",
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Review
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontSize: 16,
          color: isDark ? colors.text : "#000",
          marginBottom: 3,
        }}
      >
        {item.customerName}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 3,
        }}
      >
        Date: {item.date}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 3,
        }}
      >
        Created by: {item.user}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 3,
        }}
      >
        Source: {item.source}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 3,
        }}
      >
        Products: {item.items.length}
      </Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          color: isDark ? colors.text : "#000",
          marginTop: 5,
        }}
      >
        Total: ₹{formatIndianNumber(item.totalAmount)}
      </Text>
    </TouchableOpacity>
  )
);

const ApproveOrdersScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [sortBy, setSortBy] = useState("date"); // 'date', 'amount', 'customer'
  const [showFilters, setShowFilters] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState(false);
  const [sortDirection, setSortDirection] = useState("desc"); // "asc" or "desc"
  const { showFeedback } = useFeedback();
  const [displayLimit, setDisplayLimit] = useState(20);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalComments, setApprovalComments] = useState("");

  useEffect(() => {
    checkUserRole();
    loadOrders();
  }, []);

  const customerStats = useMemo(() => {
    if (!selectedOrder || !ledgerData || ledgerData.length === 0) {
      return {
        totalCredit: "0.00",
        totalDebit: "0.00",
        totalCreditRaw: 0,
        totalDebitRaw: 0,
        hasCredit: true,
        transactionTypes: {},
      };
    }

    try {
      return calculateLedgerStats(ledgerData);
    } catch (error) {
      console.error("Error calculating customer stats:", error);
      return {
        totalCredit: "0.00",
        totalDebit: "0.00",
        totalCreditRaw: 0,
        totalDebitRaw: 0,
        hasCredit: true,
        transactionTypes: {},
      };
    }
  }, [selectedOrder, ledgerData]);

  const checkUserRole = async () => {
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
    } catch (error) {}
  };

  const loadOrders = async () => {
    try {
      setLoading(true);

      // Check cache first
      const cachedData = apiCache.get("pendingApprovalOrders");
      const currentTime = new Date().getTime();

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
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        2, // Reduce retries from 3 to 2
        1500 // Reduce timeout from 2000 to 1500
      );

      if (response.data && response.data.values) {
        const pendingApprovalOrders = response.data.values
          .map((row, index) => ({
            id: index,
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
            (order) =>
              order.approvalStatus === "R" || order.approvalStatus === ""
          );

        // Process data into grouped orders
        const groupedOrders = pendingApprovalOrders.reduce((acc, order) => {
          if (!acc[order.orderId]) {
            acc[order.orderId] = {
              orderId: order.orderId,
              date: order.orderTime || order.sysTime,
              customerName: order.customerName,
              user: order.user,
              source: order.source,
              orderComments: order.orderComments,
              managerComments: order.managerComments,
              items: [],
              totalAmount: 0,
              fiscalYear: extractFiscalYear(order.orderId),
            };
          }

          // Add the item
          acc[order.orderId].items.push({
            productName: order.productName,
            quantity: order.quantity,
            unit: order.unit,
            rate: order.rate,
            amount: order.amount,
            rowIndex: order.rowIndex,
          });

          // Add to total amount
          const cleanAmount = order.amount.replace(/,/g, "");
          acc[order.orderId].totalAmount += parseFloat(cleanAmount || 0);

          return acc;
        }, {});

        const ordersList = Object.values(groupedOrders);

        // Cache the result with timestamp
        apiCache.set("pendingApprovalOrders", {
          data: ordersList,
          timestamp: currentTime,
        });

        setOrders(ordersList);
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Data Load Error",
        message: "Failed to load orders. Please try again.",
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Extract fiscal year from order ID (e.g., "2024-2025_00001" -> "2024-2025")
  const extractFiscalYear = (orderId) => {
    if (!orderId) return "";
    const parts = orderId.split("_");
    return parts[0] || "";
  };

  // Split order ID into fiscal year and number parts
  const splitOrderId = (orderId) => {
    if (!orderId) return ["", 0];
    const parts = orderId.split("_");
    const fiscalYear = parts[0] || "";
    const orderNum = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    return [fiscalYear, orderNum];
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
  };

  const viewOrderDetails = async (order) => {
    setSelectedOrder(order);
    setModalVisible(true);
    loadCustomerLedger(order.customerName);
  };

  // Replace your existing loadCustomerLedger function with this implementation:
  const loadCustomerLedger = async (customerName) => {
    try {
      setLedgerLoading(true);

      // Check cache first
      const cacheKey = `ledger_${customerName}`;
      const cachedLedger = apiCache.get(cacheKey);

      if (cachedLedger) {
        setLedgerData(cachedLedger);
        setLedgerLoading(false);
        return;
      }

      // Use the same API call as Customer Summary
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Ledger_2!A1:L`,
        {},
        2,
        2000
      );

      if (response.data && response.data.values) {
        const headers = response.data.values[0] || [];
        const dataRows = response.data.values.slice(1);

        console.log("Looking for customerName:", customerName);
        console.log(
          "Sample row[8] values:",
          dataRows.slice(0, 10).map((row) => row[8])
        );
        console.log("All customer names in ledger:", [
          ...new Set(dataRows.map((row) => row[8])),
        ]);
        console.log("Looking for customerName:", customerName);
        // Filter ledger entries by customer name (column 8)
        // const ledgerEntries = dataRows
        //   .filter(
        //     (row) =>
        //       row.length > 8 &&
        //       row[8] &&
        //       row[8].trim().replace(/\s+/g, " ").toLowerCase() ===
        //         customerName.trim().replace(/\s+/g, " ").toLowerCase()
        //   )
        //   .map((row) => {
        //     const entry = {};
        //     headers.forEach((header, index) => {
        //       if (index < row.length) {
        //         entry[header] = row[index];
        //       }
        //     });
        //     return entry;
        //   });
        const ledgerEntries = await fetchCustomerLedger(customerName);
        // Cache the result
        apiCache.set(cacheKey, ledgerEntries);
        setLedgerData(ledgerEntries);
      } else {
        setLedgerData([]);
      }
    } catch (error) {
      console.error("Error loading customer ledger:", error);
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
  };

  const handleApproval = async (approved, comments = "") => {
    if (!selectedOrder) return;

    if (!approved) {
      setShowRejectModal(true);
      return;
    }

    try {
      setApprovalLoading(true);

      // Track success and failures
      let successCount = 0;
      let failureCount = 0;

      // Use Promise.allSettled for more robust error handling
      const results = await Promise.allSettled(
        selectedOrder.items.map(async (item) => {
          try {
            const response = await fetchWithRetry(
              `${BACKEND_URL}/api/sheets/New_Order_Table!M${item.rowIndex}:N${item.rowIndex}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                data: { values: [["Y", comments || ""]] }, // comments is the approval comment
              },
              2,
              1000
            );

            // Simply check if we got a successful response
            if (response && response.status >= 200 && response.status < 300) {
              return true;
            } else {
              throw new Error("Failed to update cell");
            }
          } catch (error) {
            throw error;
          }
        })
      );

      // Count successes and failures
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failureCount++;
        }
      });

      // If at least one update succeeded, consider it a success
      if (successCount > 0) {
        // Clear cache to force reload on next load
        apiCache.set("pendingApprovalOrders", null); // FIX: use set(key, null) instead of remove

        setModalVisible(false);
        setSelectedOrder(null);

        showFeedback({
          type: "success",
          title: "Order Approved",
          message:
            failureCount > 0
              ? `Most items were approved successfully (${successCount}/${
                  successCount + failureCount
                }). You may need to refresh.`
              : "The order has been successfully approved and is ready for dispatch.",
          actionText: "Refresh",
          onAction: () => loadOrders(),
        });

        // Reload orders after a brief delay to allow backend updates to propagate
        setTimeout(() => {
          loadOrders();
        }, 500);

        return true;
      } else {
        throw new Error("Failed to update any order items");
      }
    } catch (error) {
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
  };

  const confirmRejection = async () => {
    try {
      setApprovalLoading(true);

      // Track success and failures
      let successCount = 0;
      let failureCount = 0;

      // Update orders with rejection status and reason
      const results = await Promise.allSettled(
        selectedOrder.items.map(async (item) => {
          try {
            const response = await fetchWithRetry(
              `${BACKEND_URL}/api/sheets/New_Order_Table!N${item.rowIndex}:M${item.rowIndex}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                data: {
                  values: [["N", rejectionReason || "No reason provided"]],
                },
              },
              2,
              1000
            );

            // Check for successful response
            if (response && response.status >= 200 && response.status < 300) {
              return true;
            } else {
              throw new Error("Failed to update cell");
            }
          } catch (error) {
            throw error;
          }
        })
      );

      // Count successes and failures
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failureCount++;
        }
      });

      // Clear cache regardless of outcome to ensure fresh data on reload
      apiCache.set("pendingApprovalOrders", null); // FIX: use set(key, null) instead of remove

      // If at least one update succeeded, consider it a success
      if (successCount > 0) {
        // Close modals and refresh
        setShowRejectModal(false);
        setModalVisible(false);
        setSelectedOrder(null);
        setRejectionReason("");

        showFeedback({
          type: "error", // This should probably be "warning" instead of "error"
          title: "Order Rejected",
          message: `The order has been rejected${
            rejectionReason ? ` with reason: ${rejectionReason}` : ""
          }.`,
          actionText: "Refresh",
          onAction: () => loadOrders(),
          autoDismiss: false,
        });

        // Reload orders after a brief delay
        setTimeout(() => {
          loadOrders();
        }, 500);

        return true;
      } else {
        throw new Error("Failed to update any order items");
      }
    } catch (error) {
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
  };

  const styles = StyleSheet.create({
    // Add these to your StyleSheet
    statsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 4,
    },
    statsHeaderValue: {
      fontSize: 15,
      fontWeight: "700",
      color: isDark ? colors.textSecondary : "#666",
    },
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 50,
      paddingBottom: 15,
      paddingHorizontal: 20,
      backgroundColor: isDark ? colors.surfaceVariant : colors.primary,
    },
    headerTitle: {
      color: isDark ? colors.text : "#FFF",
      fontSize: 20,
      fontWeight: "bold",
    },
    orderCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
      borderRadius: 10,
      padding: 15,
      marginBottom: 10,
      marginHorizontal: 15,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 2,
    },
    orderIdText: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? colors.primary : colors.primary,
      marginBottom: 5,
    },
    customerText: {
      fontSize: 16,
      color: isDark ? colors.text : "#000",
      marginBottom: 3,
    },
    detailText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      marginBottom: 3,
    },
    totalText: {
      fontSize: 15,
      fontWeight: "bold",
      color: isDark ? colors.text : "#000",
      marginTop: 5,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
      marginTop: 50,
    },
    emptyText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : "#666",
      marginTop: 10,
      textAlign: "center",
    },
    modalContainer: {
      flex: 1,
      backgroundColor: isDark ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.5)",
      justifyContent: "center",
    },
    modalContent: {
      backgroundColor: isDark ? colors.background : "#FFF",
      margin: scale(20),
      borderRadius: scale(15),
      padding: scale(20),
      maxHeight: isTablet ? "90%" : "80%",
      width: isTablet ? "70%" : undefined,
      alignSelf: isTablet ? "center" : undefined,
    },
    modalScrollContent: {
      flexGrow: 1,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 15,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: isDark ? colors.text : "#000",
    },
    closeButton: {
      padding: 5,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: isDark ? colors.text : "#000",
      marginTop: 15,
      marginBottom: 10,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      marginVertical: 10,
    },
    productItem: {
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    productName: {
      fontSize: 15,
      fontWeight: "500",
      color: isDark ? colors.text : "#000",
    },
    productDetail: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#555",
      marginTop: 3,
    },
    ledgerContainer: {
      maxHeight: 300,
      marginVertical: 10,
      borderWidth: 1,
      borderRadius: 8,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "#eee",
    },
    ledgerRow: {
      flexDirection: "row",
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0",
    },
    ledgerHeader: {
      flexDirection: "row",
      paddingVertical: 10,
      paddingHorizontal: 8,
      backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#f5f5f5",
    },
    ledgerCell: {
      flex: 1,
      paddingHorizontal: 5,
    },
    ledgerHeaderText: {
      fontWeight: "bold",
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#555",
    },
    ledgerText: {
      fontSize: 13,
      color: isDark ? colors.text : "#333",
    },
    statsContainer: {
      backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "#f9f9f9",
      padding: 15,
      borderRadius: 10,
      marginVertical: 10,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 4,
    },
    statsLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
    },
    statsValue: {
      fontSize: 15,
      fontWeight: "500",
      color: isDark ? colors.text : "#333",
    },
    warningValue: {
      color: "#e74c3c",
    },
    goodValue: {
      color: "#2ecc71",
    },
    buttonsContainer: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 20,
    },
    // approveButton: {
    //   backgroundColor: "#2ecc71",
    //   paddingVertical: 12,
    //   paddingHorizontal: 20,
    //   borderRadius: 8,
    //   width: "45%",
    //   alignItems: "center",
    // },
    // rejectButton: {
    //   backgroundColor: "#e74c3c",
    //   paddingVertical: 12,
    //   paddingHorizontal: 20,
    //   borderRadius: 8,
    //   width: "45%",
    //   alignItems: "center",
    // },
    // buttonText: {
    //   color: "#FFFFFF",
    //   fontSize: 16,
    //   fontWeight: "600",
    // },
    approveButton: {
      backgroundColor: "#2ecc71",
      paddingVertical: 12,
      paddingHorizontal: 10, // reduced from 20
      borderRadius: 8,
      minWidth: 150, // add minWidth
      alignItems: "center",
    },
    rejectButton: {
      backgroundColor: "#e74c3c",
      paddingVertical: 12,
      paddingHorizontal: 10, // reduced from 20
      borderRadius: 8,
      minWidth: 150, // add minWidth
      alignItems: "center",
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 15, // reduced from 16
      fontWeight: "600",
    },
    iconStyle: {
      color: isDark ? colors.text : "#FFF",
    },
    // Add these to your StyleSheet

    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
    },
    summaryLabel: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : "#666",
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
    },
    totalCredit: {
      color: "#27ae60",
    },
    totalDebit: {
      color: "#e74c3c",
    },
    balanceValue: {
      fontSize: 16,
      fontWeight: "bold",
    },
    statusBadge: {
      backgroundColor: "#f39c12",
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    statusText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "600",
    },
    filterContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 15,
      paddingVertical: 8,
      alignItems: "center",
      backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    filterButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#fff",
      borderRadius: 15,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "#ddd",
    },
    filterText: {
      marginLeft: 5,
      color: isDark ? colors.text : "#333",
      fontSize: 14,
    },
    sortButtons: {
      flexDirection: "row",
    },
    sortButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginLeft: 8,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5",
    },
    activeSortButton: {
      backgroundColor: isDark ? colors.primary + "33" : colors.primary + "15",
    },
    sortText: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : "#666",
    },
    activeSortText: {
      color: isDark ? colors.primary : colors.primary,
      fontWeight: "500",
    },
    reasonInput: {
      backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#f5f5f5",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "#ddd",
      borderRadius: 8,
      padding: 12,
      color: isDark ? colors.text : "#333",
      fontSize: 16,
      textAlignVertical: "top",
    },
    cancelButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#e0e0e0",
      width: "45%",
      alignItems: "center",
    },
    cancelButtonText: {
      color: isDark ? colors.text : "#333",
      fontSize: 16,
      fontWeight: "600",
    },
    sectionHeader: {
      backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "#f5f5f5",
      padding: 10,
      paddingHorizontal: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionHeaderText: {
      fontSize: 16,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
    },
    filtersModalContent: {
      width: 250,
      backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
      borderRadius: 12,
      padding: 15,
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    filtersModalTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? colors.text : "#333",
      marginBottom: 10,
    },
    filtersModalSubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      marginVertical: 8,
      fontWeight: "500",
    },
    filterOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 5,
      borderRadius: 8,
    },
    activeFilterOption: {
      backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.05)",
    },
    filterOptionText: {
      flex: 1,
      marginLeft: 10,
      fontSize: 15,
      color: isDark ? colors.text : "#333",
    },
    activeFilterOptionText: {
      color: isDark ? colors.primary : colors.primary,
      fontWeight: "500",
    },
    productListContainer: {
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      borderRadius: 8,
      marginBottom: 10,
    },
  });

  // Replace getSortedOrders and getGroupedOrdersByDate with this memoized version
  const sortedAndGroupedOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    // First sort orders
    const sortedOrders = [...orders].sort((a, b) => {
      let comparison = 0;
      const [aFY, aNum] = splitOrderId(a.orderId);
      const [bFY, bNum] = splitOrderId(b.orderId);

      switch (sortBy) {
        case "orderId":
        case "date":
          if (aFY !== bFY) {
            comparison = bFY.localeCompare(aFY);
          } else {
            comparison = bNum - aNum;
          }
          break;
        case "amount":
          // Ensure we're comparing numbers, not strings
          const amountA = parseFloat(String(a.totalAmount).replace(/,/g, ""));
          const amountB = parseFloat(String(b.totalAmount).replace(/,/g, ""));
          comparison = amountB - amountA; // Higher amount first
          break;
        case "customer":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case "source":
          comparison = a.source.localeCompare(b.source);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    // Then group by date
    const grouped = {};
    sortedOrders.forEach((order) => {
      const date = order.date.split(" ")[0];
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(order);
    });

    // Create sections array for SectionList
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      const dateA = formatDateForSorting(a);
      const dateB = formatDateForSorting(b);
      return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
    });

    return sortedDates.map((date) => ({
      date,
      data: grouped[date],
    }));
  }, [orders, sortBy, sortDirection]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pending Approvals</Text>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            style={styles.iconStyle}
          />
        </TouchableOpacity>
      </View>
      {/* Filtering and Sorting Controls */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            {
              backgroundColor: isDark
                ? colors.primary + "33"
                : colors.primary + "15",
            },
          ]}
          onPress={() => {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
          }}
        >
          <Ionicons
            name="funnel-outline"
            size={18}
            color={isDark ? colors.primary : colors.primary}
          />
          <Text
            style={[
              styles.filterText,
              { color: isDark ? colors.primary : colors.primary },
            ]}
          >
            {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
            {sortBy === "date"
              ? sortDirection === "asc"
                ? " (Oldest)"
                : " (Newest)"
              : sortBy === "amount"
              ? sortDirection === "asc"
                ? " (Lowest)"
                : " (Highest)"
              : sortDirection === "asc"
              ? " (A→Z)"
              : " (Z→A)"}
          </Text>
          <Ionicons
            name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
            size={16}
            color={isDark ? colors.primary : colors.primary}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        <View style={styles.sortButtons}>
          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === "date" && styles.activeSortButton,
            ]}
            onPress={() => {
              if (sortBy === "date") {
                // If already sorted by date, toggle direction
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                // Otherwise, set sort by date with default desc direction
                setSortBy("date");
                setSortDirection("desc"); // Default to newest first
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  styles.sortText,
                  sortBy === "date" && styles.activeSortText,
                ]}
              >
                Date
              </Text>
              {sortBy === "date" && (
                <Ionicons
                  name={
                    sortBy === "date"
                      ? sortDirection === "asc"
                        ? "arrow-down" // Oldest: up arrow
                        : "arrow-up" // Newest: down arrow
                      : sortDirection === "asc"
                      ? "arrow-up"
                      : "arrow-down"
                  }
                  size={16}
                  color={isDark ? colors.primary : colors.primary}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === "amount" && styles.activeSortButton,
            ]}
            onPress={() => {
              if (sortBy === "amount") {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                setSortBy("amount");
                setSortDirection("desc"); // Default to highest first
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  styles.sortText,
                  sortBy === "amount" && styles.activeSortText,
                ]}
              >
                Amount
              </Text>
              {sortBy === "amount" && (
                <Ionicons
                  name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={isDark ? colors.primary : colors.primary}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortBy === "customer" && styles.activeSortButton,
            ]}
            onPress={() => {
              if (sortBy === "customer") {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                setSortBy("customer");
                setSortDirection("asc"); // Default to A-Z
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={[
                  styles.sortText,
                  sortBy === "customer" && styles.activeSortText,
                ]}
              >
                Customer
              </Text>
              {sortBy === "customer" && (
                <Ionicons
                  name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={isDark ? colors.primary : colors.primary}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
      {/* Orders List */}

      {loading ? (
        <LoadingIndicator message="Loading orders..." showTips={true} />
      ) : (
        <SectionList
          sections={sortedAndGroupedOrders.slice(0, displayLimit)}
          keyExtractor={(item) => item.orderId}
          contentContainerStyle={{ paddingVertical: 15 }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          stickySectionHeadersEnabled={true}
          renderSectionHeader={({ section: { date } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{date}</Text>
              {sortBy !== "date" && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={[
                      styles.sectionHeaderText,
                      { fontSize: 13, fontWeight: "400", marginRight: 3 },
                    ]}
                  >
                    sorted by {sortBy}
                  </Text>
                  <Ionicons
                    name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
                    size={12}
                    color={isDark ? colors.textSecondary : "#666"}
                  />
                </View>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <OrderCard
              item={item}
              viewOrderDetails={viewOrderDetails}
              isDark={isDark}
              colors={colors}
              formatIndianNumber={formatIndianNumber}
            />
          )}
          ListFooterComponent={() =>
            sortedAndGroupedOrders.length > displayLimit ? (
              <TouchableOpacity
                style={{
                  backgroundColor: isDark
                    ? "rgba(138, 80, 177, 0.1)"
                    : "rgba(138, 80, 177, 0.05)",
                  paddingVertical: 15,
                  borderRadius: 10,
                  alignItems: "center",
                  margin: 15,
                }}
                onPress={() => setDisplayLimit((prev) => prev + 20)}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "500",
                  }}
                >
                  Load More ({sortedAndGroupedOrders.length - displayLimit}{" "}
                  remaining)
                </Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="checkmark-circle-outline"
                size={60}
                color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
              />
              <Text style={styles.emptyText}>No pending orders to approve</Text>
            </View>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}
      {/* Order Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          setSelectedOrder(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setModalVisible(false);
                  setSelectedOrder(null);
                }}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={isDark ? colors.text : "#000"}
                />
              </TouchableOpacity>
            </View>
            {/* Order Summary */}
            // Replace the problematic section around line 1500-1660 with this
            corrected version:
            {selectedOrder ? (
              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.orderIdText}>{selectedOrder.orderId}</Text>
                <Text style={styles.customerText}>
                  {selectedOrder.customerName}
                </Text>
                <Text style={styles.detailText}>
                  Date: {selectedOrder.date}
                </Text>
                {selectedOrder.orderComments ? (
                  <Text style={styles.detailText}>
                    O.Note: {selectedOrder.orderComments}
                  </Text>
                ) : null}

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>Customer Ledger Summary</Text>

                {ledgerLoading ? (
                  <View style={{ marginVertical: 20 }}>
                    <LoadingIndicator
                      message="Loading customer data..."
                      size="small"
                      showTips={false}
                    />
                  </View>
                ) : (
                  <View>
                    <View style={styles.statsContainer}>
                      {/* Customer name */}
                      <Text
                        style={[
                          styles.statsLabel,
                          { fontWeight: "600", fontSize: 15, marginBottom: 8 },
                        ]}
                      >
                        {selectedOrder?.customerName || "Unknown Customer"}
                      </Text>

                      <View style={styles.divider} />

                      {/* Summary Rows - Total Credits, Total Debits, Balance */}
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Credits:</Text>
                        <Text style={[styles.summaryValue, styles.totalCredit]}>
                          ₹{customerStats?.totalCredit || "0.00"}
                        </Text>
                      </View>

                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Total Debits:</Text>
                        <Text style={[styles.summaryValue, styles.totalDebit]}>
                          ₹{customerStats?.totalDebit || "0.00"}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.summaryRow,
                          {
                            marginTop: 8,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: isDark
                              ? "rgba(255,255,255,0.1)"
                              : "rgba(0,0,0,0.05)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryLabel,
                            { fontWeight: "600", fontSize: 16 },
                          ]}
                        >
                          Balance:
                        </Text>
                        <Text
                          style={[
                            styles.balanceValue,
                            customerStats?.hasCredit
                              ? styles.totalCredit
                              : styles.totalDebit,
                          ]}
                        >
                          ₹
                          {customerStats
                            ? formatIndianNumber(
                                Math.abs(
                                  (customerStats.totalCreditRaw || 0) -
                                    (customerStats.totalDebitRaw || 0)
                                )
                              )
                            : "0.00"}{" "}
                          {customerStats?.hasCredit ? "CR" : "DR"}
                        </Text>
                      </View>
                    </View>

                    {ledgerData.length > 0 && (
                      <View>
                        <Text style={styles.sectionTitle}>
                          Transaction History
                        </Text>
                        <View style={styles.ledgerHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.ledgerHeaderText}>Date</Text>
                          </View>
                          <View style={{ flex: 2 }}>
                            <Text style={styles.ledgerHeaderText}>
                              Description
                            </Text>
                          </View>
                          <View style={{ flex: 1, alignItems: "flex-end" }}>
                            <Text style={styles.ledgerHeaderText}>Amount</Text>
                          </View>
                        </View>

                        <View
                          style={[styles.ledgerContainer, { maxHeight: 300 }]}
                        >
                          <ScrollView nestedScrollEnabled={true}>
                            {ledgerData.map((item, index) => (
                              <TouchableOpacity
                                key={index}
                                style={styles.ledgerRow}
                                onPress={() => {
                                  Alert.alert(
                                    "Transaction Details",
                                    `Date: ${item.Date}\nDescription: ${
                                      item.Description
                                    }\nAmount: ₹${item.Amount} ${
                                      item.DC === "D" ? "DR" : "CR"
                                    }\nCompany Year: ${
                                      item.Company_Year || "N/A"
                                    }`
                                  );
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.ledgerText}>
                                    {item.Date}
                                  </Text>
                                </View>
                                <View style={{ flex: 2 }}>
                                  <Text
                                    style={styles.ledgerText}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {(item.Description || "").replace(
                                      "Default ",
                                      ""
                                    )}
                                  </Text>
                                </View>
                                <View
                                  style={{ flex: 1, alignItems: "flex-end" }}
                                >
                                  <Text
                                    style={[
                                      styles.ledgerText,
                                      {
                                        color:
                                          item.DC === "D"
                                            ? "#e74c3c"
                                            : "#2ecc71",
                                        fontWeight: "500",
                                      },
                                    ]}
                                  >
                                    ₹{formatIndianNumber(item.Amount ?? 0)}{" "}
                                    {item.DC === "D" ? "DR" : "CR"}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.divider} />

                {/* Products section */}
                <Text style={styles.sectionTitle}>Products</Text>
                <View style={styles.productListContainer}>
                  <ScrollView
                    nestedScrollEnabled={true}
                    style={{ maxHeight: 150 }}
                  >
                    {selectedOrder.items.map((item, index) => (
                      <View key={index} style={styles.productItem}>
                        <Text style={styles.productName}>
                          {item.productName}
                        </Text>
                        <Text style={styles.productDetail}>
                          Quantity: {item.quantity} {item.unit}
                        </Text>
                        <Text style={styles.productDetail}>
                          Rate: ₹{item.rate} • Amount: ₹{item.amount}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.divider} />

                <Text
                  style={{
                    ...styles.totalText,
                    alignSelf: "flex-end",
                    marginTop: 15,
                    marginBottom: 10,
                  }}
                >
                  Total: ₹{formatIndianNumber(selectedOrder.totalAmount)}
                </Text>

                {/* Approve/Reject buttons */}
                <View style={[styles.buttonsContainer, { marginTop: 15 }]}>
                  <TouchableOpacity
                    style={[
                      styles.approveButton,
                      approvalLoading && { opacity: 0.7 },
                    ]}
                    onPress={() => setShowApproveModal(true)}
                    disabled={approvalLoading}
                  >
                    <Text style={styles.buttonText}>
                      {approvalLoading ? "Processing..." : "Approve"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rejectButton,
                      approvalLoading && { opacity: 0.7 },
                    ]}
                    onPress={() => handleApproval(false)}
                    disabled={approvalLoading}
                  >
                    <Text style={styles.buttonText}>
                      {approvalLoading ? "Processing..." : "Reject"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <View style={{ padding: 20 }}>
                <Text style={styles.detailText}>Loading order details...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      {/* Rejection Reason Modal - Also ensuring all text is in Text components */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showRejectModal}
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalContainer}>
          <View
            style={[styles.modalContent, { padding: 20, maxHeight: "50%" }]}
          >
            <Text style={[styles.modalTitle, { marginBottom: 20 }]}>
              Rejection Reason
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason for rejection (optional)"
              placeholderTextColor={
                isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"
              }
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline={true}
              numberOfLines={3}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 20,
              }}
            >
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.rejectButton,
                  approvalLoading && { opacity: 0.7 },
                ]}
                onPress={confirmRejection}
                disabled={approvalLoading}
              >
                <Text style={styles.buttonText}>
                  {approvalLoading ? "Processing..." : "Confirm Rejection"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={showApproveModal}
        onRequestClose={() => setShowApproveModal(false)}
      >
        <View style={styles.modalContainer}>
          <View
            style={[styles.modalContent, { padding: 20, maxHeight: "50%" }]}
          >
            <Text style={[styles.modalTitle, { marginBottom: 20 }]}>
              Approval Comments
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Enter approval comments (optional)"
              placeholderTextColor={
                isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"
              }
              value={approvalComments}
              onChangeText={setApprovalComments}
              multiline={true}
              numberOfLines={3}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 20,
              }}
            >
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowApproveModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.approveButton,
                  approvalLoading && { opacity: 0.7 },
                ]}
                onPress={async () => {
                  setShowApproveModal(false);
                  await handleApproval(true, approvalComments);
                  setApprovalComments("");
                }}
                disabled={approvalLoading}
              >
                <Text style={styles.buttonText}>
                  {approvalLoading ? "Processing..." : "Confirm Approval"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ApproveOrdersScreen;
