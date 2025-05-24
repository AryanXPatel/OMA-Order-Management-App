//
import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { Animated, Easing } from "react-native";
import { useFeedback } from "../context/FeedbackContext";
import { KeyboardAvoidingView, Platform } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import { Checkbox } from "react-native-paper";
import {
  scale,
  moderateScale,
  isTablet,
  screenWidth,
} from "../utils/responsive";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

const ProcessOrdersScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [selectedItems, setSelectedItems] = useState({});
  const [sortBy, setSortBy] = useState("date"); // Set 'date' as default
  const [sortDirection, setSortDirection] = useState("asc"); // asc = oldest first
  const [searchQuery, setSearchQuery] = useState("");
  const [productRemarks, setProductRemarks] = useState({});
  const [dispatchingIndex, setDispatchingIndex] = useState(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [expandAnim] = useState(new Animated.Value(0));
  const themeColor = "#f39c12";
  const { showFeedback } = useFeedback();

  // Animation for modal
  useEffect(() => {
    let animationSubscription;
    if (modalVisible) {
      animationSubscription = Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(expandAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      // Cleanup animations
      if (animationSubscription) {
        animationSubscription.stop?.();
      }
    };
  }, [modalVisible, fadeAnim, expandAnim]);

  // Load orders initially
  useEffect(() => {
    loadOrders();
  }, []);

  // Add this at the top of process-orders.tsx
  const formatDate = (date) => {
    if (!date) return "";

    // Create a date string in format DD/MM/YYYY HH:MM AM/PM
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; // Convert 24h to 12h format

    return `${day}/${month}/${year} ${hours12}:${minutes} ${ampm}`;
  };
  // Load orders function - memoized to prevent recreation
  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);

      // Try to get from cache first for immediate rendering
      const cachedOrders = apiCache.get("approvedOrders");
      if (cachedOrders) {
        setOrders(cachedOrders);
        setLoading(false);
      }

      // First, fetch the customer master to get customer codes
      const customerCodesMap = {};
      try {
        const customerResponse = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
          {},
          2,
          1500
        );

        if (customerResponse.data && customerResponse.data.values) {
          // Skip header row (index 0)
          customerResponse.data.values.slice(1).forEach((row) => {
            if (row.length >= 2) {
              // Map customer name to customer code
              // Column A is customer code, Column B is customer name
              const code = row[0] || "";
              const name = row[1] || "";
              if (name) {
                customerCodesMap[name] = code;
              }
            }
          });
        }
      } catch (error) {
        console.log("Error fetching customer master:", error);
        // Continue with orders even if customer lookup fails
      }

      // Fetch the product master for product codes
      const productCodesMap = {};
      try {
        const productResponse = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Product_Master!A1:B`,
          {},
          2,
          1500
        );

        if (productResponse.data && productResponse.data.values) {
          // Skip header row
          const headerRow = productResponse.data.values[0];
          const codeIndex = headerRow.indexOf("Product CODE");
          const nameIndex = headerRow.indexOf("Product NAME");

          if (codeIndex >= 0 && nameIndex >= 0) {
            productResponse.data.values.slice(1).forEach((row) => {
              if (row.length > Math.max(codeIndex, nameIndex)) {
                const code = row[codeIndex] || "";
                const name = row[nameIndex] || "";
                if (name) {
                  productCodesMap[name] = code;
                }
              }
            });
          }
        }
      } catch (error) {
        console.log("Error fetching product master:", error);
        // Continue with orders even if product lookup fails
      }

      // Now fetch orders
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        3,
        2000
      );

      if (response.data && response.data.values) {
        // Process each row and store the actual row index from the sheet
        const allRows = response.data.values.map((row, index) => ({
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
          dispatchTime: row[16] || "", // NEW: Column Q - DISPATCH TIME
        }));

        // Filter out only approved orders
        const approvedOrders = allRows.filter(
          (row) => row.approved === "Y" && row.dispatched !== "Y"
        );

        // Group the orders by orderId
        const groupedOrders = {};
        approvedOrders.forEach((order) => {
          if (!groupedOrders[order.orderId]) {
            groupedOrders[order.orderId] = {
              orderId: order.orderId,
              date: order.orderTime || order.sysTime,
              customerName: order.customerName,
              orderComments: order.orderComments,
              managerComments: order.managerComments, // <-- NEW
              customerCode: customerCodesMap[order.customerName] || "",
              user: order.user,
              source: order.source,
              items: [],
              totalAmount: 0,
            };
          }

          groupedOrders[order.orderId].items.push({
            productName: order.productName,
            productCode: productCodesMap[order.productName] || "",
            quantity: order.quantity,
            unit: order.unit,
            rate: order.rate,
            amount: order.amount,
            actualRowIndex: order.actualRowIndex,
            dispatched: order.dispatched,
            rejectionReason: order.rejectionReason,
            dispatchComments: order.dispatchComments, // <-- NEW
            dispatchTime: order.dispatchTime, // NEW: Add dispatch time
          });

          // Add to total amount
          const cleanAmount = order.amount.replace(/,/g, "");
          groupedOrders[order.orderId].totalAmount += parseFloat(
            cleanAmount || 0
          );
        });

        // Filter out orders where all products are dispatched
        const ordersList = Object.values(groupedOrders).filter((order) =>
          order.items.some((item) => item.dispatched !== "Y")
        );

        setOrders(ordersList);
        apiCache.set("approvedOrders", ordersList);
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Dispatch Failed",
        message: `Failed to load orders. ${
          error.message || "Please try again."
        }`,
        autoDismiss: false,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFeedback]);

  // Date formatting function - memoized
  const formatDateForSorting = useCallback((dateStr) => {
    try {
      // Handle date format: "DD/MM/YYYY HH:MM AM/PM"
      const [datePart, timePart] = dateStr.split(" ");

      // Parse date part (DD/MM/YYYY)
      const [day, month, year] = datePart.split("/").map(Number);

      // Parse time part (HH:MM AM/PM) if it exists
      let hours = 0;
      let minutes = 0;
      if (timePart) {
        const [timePortion, ampm] =
          timePart.includes("AM") || timePart.includes("PM")
            ? [timePart.slice(0, -2), timePart.slice(-2)]
            : [timePart, ""];

        const [hourStr, minuteStr] = timePortion.split(":");
        hours = parseInt(hourStr, 10);
        minutes = parseInt(minuteStr, 10) || 0;

        // Adjust hours for PM
        if (ampm === "PM" && hours < 12) {
          hours += 12;
        }
        // Adjust for 12 AM
        if (ampm === "AM" && hours === 12) {
          hours = 0;
        }
      }

      // Create a date object (month is 0-indexed in JavaScript)
      const date = new Date(year, month - 1, day, hours, minutes);
      return date.getTime(); // Return as timestamp for reliable comparison
    } catch (e) {
      // Return a far past date as fallback
      return new Date(1970, 0, 1).getTime();
    }
  }, []);

  // Split order ID function - memoized
  const splitOrderId = useCallback((orderId) => {
    if (!orderId) return ["", 0];
    const parts = orderId.split("_");
    const fiscalYear = parts[0] || "";
    const orderNum = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    return [fiscalYear, orderNum];
  }, []);

  // Get sorted orders function - memoized
  const getSortedOrders = useCallback(() => {
    if (!orders || orders.length === 0) return [];

    // First apply search filtering if any
    let filteredOrders = orders;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredOrders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          // Add these new conditions for enhanced search
          (order.customerCode &&
            order.customerCode.toLowerCase().includes(query)) ||
          (order.items &&
            order.items.some(
              (item) =>
                item.productName.toLowerCase().includes(query) ||
                (item.productCode &&
                  item.productCode.toLowerCase().includes(query))
            ))
      );
    }

    // Then apply sorting (keep your existing sorting logic)
    return [...filteredOrders].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "date":
          // Actually sort by orderId for robustness!
          const [aFY, aNum] = splitOrderId(a.orderId);
          const [bFY, bNum] = splitOrderId(b.orderId);
          if (aFY !== bFY) {
            comparison = bFY.localeCompare(aFY); // Sort by fiscal year
          } else {
            comparison = bNum - aNum; // Sort by order number
          }
          break;
        case "amount":
          comparison = a.totalAmount - b.totalAmount; // Ascending = smaller amount first
          break;
        case "customer":
          comparison = a.customerName.localeCompare(b.customerName); // Ascending = A-Z
          break;
        default:
          comparison = 0;
      }

      // For descending, invert the comparison
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [orders, searchQuery, sortBy, sortDirection, splitOrderId]);
  // Format Indian number function - memoized
  const formatIndianNumber = useCallback((num) => {
    try {
      const parts = num.toFixed(2).split(".");
      const lastThree = parts[0].substring(parts[0].length - 3);
      const otherNumbers = parts[0].substring(0, parts[0].length - 3);
      const formatted =
        otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") +
        (otherNumbers ? "," : "") +
        lastThree;
      return `${formatted}.${parts[1]}`;
    } catch (error) {
      return "0.00";
    }
  }, []);

  // Handle refresh function
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
  }, [loadOrders]);

  // View order details function
  const viewOrderDetails = useCallback((order) => {
    setSelectedOrder(order);

    // Initialize selected items - all unchecked initially
    const initialSelectedItems = {};
    order.items.forEach((item, index) => {
      initialSelectedItems[index] = item.dispatched === "P"; // Pre-select partially dispatched items
    });

    setSelectedItems(initialSelectedItems);
    setRemarks("");
    setModalVisible(true);
  }, []);

  // Toggle item selection function
  const toggleItemSelection = useCallback((index) => {
    setSelectedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }, []);

  // Handle product dispatch function
  const handleProductDispatch = useCallback(
    async (product, index) => {
      try {
        setDispatchingIndex(index);

        // Get current date and time string
        const now = new Date();
        const dispatchTimeStr = formatDate(now); // Use your existing formatDate function

        // Update the dispatch status to Y
        const dispatchResponse = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/New_Order_Table!O${product.actualRowIndex}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            data: { values: [["Y"]] }, // Set to Y (dispatched)
          },
          3,
          1000
        );

        // Add comments if provided for this product
        if (productRemarks[index] && productRemarks[index].trim()) {
          await fetchWithRetry(
            `${BACKEND_URL}/api/sheets/New_Order_Table!P${product.actualRowIndex}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              data: { values: [[productRemarks[index].trim()]] },
            },
            3,
            1000
          );
        }

        // NEW: Add dispatch time
        await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/New_Order_Table!Q${product.actualRowIndex}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            data: { values: [[dispatchTimeStr]] },
          },
          3,
          1000
        );

        // Mark this product as dispatched locally
        setSelectedOrder((prev) => {
          if (!prev) return null;

          const updatedItems = [...prev.items];
          const itemIndex = updatedItems.findIndex(
            (item) => item.actualRowIndex === product.actualRowIndex
          );

          if (itemIndex !== -1) {
            updatedItems[itemIndex] = {
              ...updatedItems[itemIndex],
              dispatched: "Y",
              comments:
                productRemarks[index] || updatedItems[itemIndex].comments,
              dispatchTime: dispatchTimeStr, // NEW: Add dispatch time to local state too
            };
          }

          return { ...prev, items: updatedItems };
        });

        // Clear the remark for this product
        setProductRemarks((prev) => ({ ...prev, [index]: "" }));

        // Clear cache to force refresh on next load
        apiCache.set("approvedOrders", null);

        // Check if all products are now dispatched after current update
        const allDispatched = selectedOrder.items.every(
          (item) =>
            item.actualRowIndex === product.actualRowIndex
              ? true // The one we just dispatched
              : item.dispatched === "Y" // Check others
        );

        // Show success message
        showFeedback({
          type: "success",
          title: "Product Dispatched",
          message: `"${product.productName}" has been dispatched successfully.`,
          actionText: allDispatched ? "Close Order" : "Continue",
          onAction: () => {
            if (allDispatched) {
              setModalVisible(false);
              setSelectedOrder(null);
              loadOrders(); // Refresh the list
            }
          },
        });
      } catch (error) {
        showFeedback({
          type: "error",
          title: "Dispatch Failed",
          message: `Failed to dispatch product. ${
            error.message || "Please try again."
          }`,
          autoDismiss: false,
        });
      } finally {
        setDispatchingIndex(null);
      }
    },
    [productRemarks, selectedOrder, showFeedback, loadOrders]
  );

  // Memoize styles to prevent recalculation
  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          backgroundColor: isDark ? colors.surfaceVariant : themeColor, // Lighter orange theme
        },
        headerTitle: {
          color: isDark ? colors.text : "#FFF",
          fontSize: 20,
          fontWeight: "bold",
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
          margin: 20,
          borderRadius: 15,
          padding: 20,
          maxHeight: "80%",
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
          marginBottom: 21,
        },
        productItem: {
          flexDirection: "row",
          alignItems: "center",
          padding: 10,
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
        },
        productCheckbox: {
          marginRight: 10,
        },
        productInfo: {
          flex: 1,
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
        remarksContainer: {
          marginVertical: 15,
        },
        remarksInput: {
          backgroundColor: isDark ? colors.surfaceVariant : "#f5f6fa",
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e0e0e0",
          color: isDark ? colors.text : "#000",
          textAlignVertical: "top",
        },
        dispatchButton: {
          backgroundColor: themeColor,
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 8,
          alignSelf: "center",
          width: "60%",
          alignItems: "center",
          marginTop: 20,
        },
        buttonText: {
          color: "#FFFFFF",
          fontSize: 16,
          fontWeight: "600",
        },
        iconStyle: {
          color: isDark ? colors.text : "#FFF",
        },
        partialBadge: {
          backgroundColor: "#f39c12",
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 12,
          alignSelf: "flex-start",
          marginVertical: 5,
        },
        partialBadgeText: {
          color: "#FFF",
          fontSize: 12,
          fontWeight: "500",
        },
        dispatchStatusBadge: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          alignSelf: "flex-start",
          marginTop: 5,
        },
        dispatchStatusText: {
          color: "#FFF",
          fontSize: 12,
          fontWeight: "500",
        },

        // Search and filter styles
        searchContainer: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isDark ? colors.surfaceVariant : "white",
          paddingHorizontal: 12,
          borderRadius: 20,
          marginHorizontal: 15,
          marginTop: 10,
          marginBottom: 5,
          elevation: 2,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 2,
        },
        searchInput: {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 8,
          color: isDark ? colors.text : "#000",
          fontSize: 15,
        },
        filterContainer: {
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
        },
        sortControls: {
          flexDirection: "row",
          justifyContent: "flex-start",
          marginHorizontal: 15,
          marginTop: 8,
        },
        sortButton: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          paddingHorizontal: 12,
          marginRight: 10,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.03)",
          borderRadius: 15,
        },
        sortText: {
          color: isDark ? colors.textSecondary : "#666",
          fontSize: 13,
          marginRight: 4,
        },
        activeSortText: {
          color: isDark ? colors.primary : colors.primary,
          fontWeight: "500",
        },

        // Status badge styles
        statusBadge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 12,
        },
        statusText: {
          color: "#FFF",
          fontSize: 12,
          fontWeight: "600",
        },

        // Modal styles
        orderSummary: {
          backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
          padding: 15,
          borderRadius: 8,
          marginBottom: 15,
        },
        orderHeaderRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 5,
        },
        orderDate: {
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
        },
        orderMetaRow: {
          flexDirection: "row",
          marginTop: 8,
        },
        orderMetaItem: {
          flexDirection: "row",
          alignItems: "center",
          marginRight: 15,
        },
        orderMetaText: {
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginLeft: 4,
        },
        selectionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        },
        checkbox: {
          width: 22,
          height: 22,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: isDark ? colors.textSecondary : "#666",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        },
        totalContainer: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 10,
        },
        totalLabel: {
          fontSize: 16,
          fontWeight: "500",
          color: isDark ? colors.text : "#000",
        },
        totalAmount: {
          fontSize: 17,
          fontWeight: "bold",
          color: isDark ? colors.text : "#000",
        },
        productDispatchCard: {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.02)",
          padding: 15,
          borderRadius: 8,
          marginBottom: 12,
          borderLeftWidth: 4,
          borderLeftColor: themeColor,
        },
        productHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        productRemarkInput: {
          backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#f5f6fa",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          marginTop: 12,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e0e0e0",
          color: isDark ? colors.text : "#333",
          minHeight: 30,
          fontSize: 14,
          textAlignVertical: "top",
        },
        productDispatchButton: {
          backgroundColor: themeColor,
          paddingVertical: 10,
          paddingHorizontal: 15,
          borderRadius: 8,
          alignSelf: "flex-end",
          marginTop: 10,
        },
        closeModalButton: {
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 8,
          backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#e0e0e0",
          alignSelf: "center",
          width: "50%",
          alignItems: "center",
        },
        // Add these new styles to your StyleSheet

        productPreviewContainer: {
          paddingTop: 8,
          paddingBottom: 5,
        },
        productPreviewItem: {
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.05)",
        },
        productPreviewName: {
          fontSize: 13,
          fontWeight: "500",
          color: isDark ? colors.text : "#333",
        },
        productPreviewDetails: {
          fontSize: 12,
          color: isDark ? colors.textSecondary : "#666",
          marginTop: 2,
        },
        moreProductsText: {
          fontSize: 12,
          color: themeColor,
          fontStyle: "italic",
          marginTop: 5,
        },
        processButton: {
          color: themeColor,
          fontWeight: "500",
          fontSize: 14,
        },
        pendingIndicator: {
          position: "absolute",
          top: 10,
          right: 10,
          backgroundColor: themeColor,
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 2,
        },
        pendingIndicatorText: {
          color: "white",
          fontSize: 12,
          fontWeight: "500",
        },
        orderSummaryBar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 15,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.05)",
        },
        orderCountText: {
          fontSize: 15,
          fontWeight: "500",
          color: isDark ? colors.textSecondary : "#555",
        },
        // In your styles:
        orderCard: {
          backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
          borderRadius: scale(10),
          padding: scale(15),
          marginBottom: scale(10),
          marginHorizontal: scale(15),
          width:
            isTablet && screenWidth > 768
              ? screenWidth * 0.45 - scale(30)
              : undefined,
          alignSelf: isTablet && screenWidth > 768 ? "flex-start" : undefined,
          elevation: 2,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 2,
        },
      }),
    [isDark, colors, themeColor]
  );

  // Extract order card component to improve readability
  const OrderCard = useCallback(
    ({ item, onPress }) => {
      // Count how many products remain to be dispatched
      const pendingItems = item.items.filter((i) => i.dispatched !== "Y");

      return (
        <View
          style={[
            styles.orderCard,
            { borderLeftWidth: 4, borderLeftColor: "#2ecc71" },
          ]}
        >
          {/* Order header section */}
          <TouchableOpacity onPress={onPress} style={{ paddingBottom: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Text style={styles.orderIdText}>Order ID: {item.orderId}</Text>
              <View
                style={[styles.statusBadge, { backgroundColor: "#2ecc71" }]}
              >
                <Text style={styles.statusText}>Approved</Text>
              </View>
            </View>
            <Text style={styles.customerText}>{item.customerName}</Text>

            {/* Add this to show customer code */}
            {item.customerCode && (
              <Text
                style={[
                  styles.detailText,
                  { color: isDark ? "#8e9eab" : "#777" },
                ]}
              >
                Customer Code: {item.customerCode}
              </Text>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 5,
              }}
            >
              <Text style={styles.detailText}>Date: {item.date}</Text>
              <Text style={[styles.detailText, { fontWeight: "500" }]}>
                Pending: {pendingItems.length}/{item.items.length}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Products preview section */}
          <View style={styles.divider} />

          <View style={{ marginTop: 5 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 5,
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 14,
                  color: isDark ? colors.text : "#333",
                }}
              >
                Pending Products
              </Text>
              <TouchableOpacity onPress={onPress}>
                <Text style={styles.processButton}>Process →</Text>
              </TouchableOpacity>
            </View>

            {/* Show first 2 products with overflow indicator */}
            {pendingItems.slice(0, 2).map((product, idx) => (
              <View
                key={idx}
                style={{
                  paddingVertical: 6,
                  borderBottomWidth:
                    idx < Math.min(pendingItems.length, 2) - 1 ? 1 : 0,
                  borderBottomColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.05)",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: isDark ? colors.text : "#333",
                  }}
                >
                  • {product.productName}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textSecondary : "#666",
                  }}
                >
                  Qty: {product.quantity} {product.unit}
                </Text>
              </View>
            ))}

            {/* Show "more items" indicator if there are more than 2 products */}
            {pendingItems.length > 2 && (
              <Text style={styles.moreProductsText}>
                +{pendingItems.length - 2} more product
                {pendingItems.length - 2 > 1 ? "s" : ""}
              </Text>
            )}

            <Text style={[styles.totalText, { marginTop: 10 }]}>
              Total: ₹{formatIndianNumber(item.totalAmount)}
            </Text>
          </View>
        </View>
      );
    },
    [styles, isDark, colors, formatIndianNumber]
  );

  // Extract ProductDispatchItem component
  const ProductDispatchItem = useCallback(
    ({ item, index }) => {
      return (
        <View style={styles.productDispatchCard}>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{item.productName}</Text>

            {item.dispatched === "Y" && (
              <View
                style={[styles.statusBadge, { backgroundColor: "#2ecc71" }]}
              >
                <Text style={styles.statusText}>Dispatched</Text>
              </View>
            )}
          </View>
          {item.comments ? (
            <Text style={styles.detailText}>
              Dispatch Notes: {item.comments}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 5,
            }}
          >
            <Text style={styles.productDetail}>
              Qty: {item.quantity} {item.unit}
            </Text>
            <Text style={[styles.productDetail, { fontWeight: "500" }]}>
              ₹{item.amount}
            </Text>
          </View>

          {/* Comment field for this specific product */}
          {item.dispatched !== "Y" && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={isDark ? colors.textSecondary : "#666"}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={{
                    color: isDark ? colors.textSecondary : "#666",
                    fontSize: 14,
                  }}
                >
                  Dispatch Notes:
                </Text>
              </View>
              <TextInput
                style={styles.productRemarkInput}
                placeholder="Add dispatch notes (optional)"
                placeholderTextColor={
                  isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
                }
                value={productRemarks[index] || ""}
                onChangeText={(text) => {
                  setProductRemarks((prev) => ({
                    ...prev,
                    [index]: text,
                  }));
                }}
                multiline={true}
                numberOfLines={2}
              />

              <TouchableOpacity
                style={[
                  styles.productDispatchButton,
                  dispatchingIndex === index && { opacity: 0.7 },
                ]}
                onPress={() => handleProductDispatch(item, index)}
                disabled={dispatchingIndex !== null}
              >
                <Text style={styles.buttonText}>
                  {dispatchingIndex === index
                    ? "Processing..."
                    : "Confirm Dispatch"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      );
    },
    [
      styles,
      productRemarks,
      dispatchingIndex,
      isDark,
      colors,
      handleProductDispatch,
    ]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Process Orders</Text>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            style={styles.iconStyle}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.filterContainer}>
        {/* Order Summary Bar */}
        <View style={styles.orderSummaryBar}>
          <Text style={styles.orderCountText}>
            {getSortedOrders().length}{" "}
            {getSortedOrders().length === 1 ? "Order" : "Orders"} •{" "}
            {getSortedOrders().reduce(
              (count, order) =>
                count +
                order.items.filter((item) => item.dispatched !== "Y").length,
              0
            )}{" "}
            Products to Dispatch
          </Text>
        </View>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={isDark ? colors.textSecondary : "#666"}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="orderID, customer name, code, product"
            placeholderTextColor={
              isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
            }
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={isDark ? colors.textSecondary : "#666"}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Sort Controls */}
        <View style={styles.sortControls}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              if (sortBy === "date") {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                setSortBy("date");
                setSortDirection("asc"); // Default to oldest first
              }
            }}
          >
            <Text
              style={[
                styles.sortText,
                sortBy === "date" && styles.activeSortText,
              ]}
            >
              Date{" "}
              {sortBy === "date" &&
                (sortDirection === "desc" ? "(Newest)" : "(Oldest)")}
            </Text>
            {sortBy === "date" && (
              <Ionicons
                name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
                size={14}
                color={isDark ? colors.primary : colors.primary}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              if (sortBy === "amount") {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                setSortBy("amount");
                setSortDirection("desc");
              }
            }}
          >
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
                name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
                size={14}
                color={isDark ? colors.primary : colors.primary}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              if (sortBy === "customer") {
                setSortDirection(sortDirection === "asc" ? "desc" : "asc");
              } else {
                setSortBy("customer");
                setSortDirection("asc");
              }
            }}
          >
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
                name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
                size={14}
                color={isDark ? colors.primary : colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
      {/* Orders List */}
      {loading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              marginTop: 10,
              color: isDark ? colors.textSecondary : "#666",
            }}
          >
            Loading orders...
          </Text>
        </View>
      ) : (
        <FlatList
          data={getSortedOrders()}
          keyExtractor={(item) => item.orderId}
          contentContainerStyle={{ paddingVertical: scale(15) }}
          numColumns={isTablet && screenWidth > 768 ? 2 : 1}
          key={isTablet && screenWidth > 768 ? "tablet" : "phone"}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={10}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="checkmark-done-circle-outline"
                size={60}
                color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
              />
              <Text style={styles.emptyText}>No orders to process</Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard item={item} onPress={() => viewOrderDetails(item)} />
          )}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Order Details</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setModalVisible(false);
                      setSelectedOrder(null);
                    }}
                    style={styles.closeButton}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={isDark ? "#fff" : "#000"}
                    />
                  </TouchableOpacity>
                </View>

                {/* Order Summary Section */}
                {selectedOrder && (
                  <View style={styles.orderSummary}>
                    <View style={styles.orderHeaderRow}>
                      <Text style={styles.orderIdText}>
                        {selectedOrder.orderId}{" "}
                      </Text>
                      <Text style={styles.orderDate}>{selectedOrder.date}</Text>
                    </View>
                    {selectedOrder.orderComments ? (
                      <Text style={styles.detailText}>
                        O.Note: {selectedOrder.orderComments}
                      </Text>
                    ) : null}

                    {selectedOrder.managerComments ? (
                      <Text style={styles.detailText}>
                        M.Note: {selectedOrder.managerComments}
                      </Text>
                    ) : null}

                    <View style={styles.orderMetaRow}>
                      <View style={styles.orderMetaItem}>
                        <Ionicons
                          name="person"
                          size={14}
                          color={isDark ? "#aaa" : "#444"}
                        />
                        <Text style={styles.orderMetaText}>
                          {selectedOrder.customerName}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
                <View style={styles.divider} />

                {/* Products to Dispatch Heading */}
                {selectedOrder &&
                  selectedOrder.items.some(
                    (item) => item.dispatched !== "Y"
                  ) && (
                    <Text style={[styles.sectionTitle, { marginTop: 5 }]}>
                      Products to Dispatch
                    </Text>
                  )}

                {/* Product Dispatch Items */}
                {selectedOrder?.items.map((item, index) => (
                  <View key={index} style={styles.productDispatchCard}>
                    <View style={styles.productHeader}>
                      <Text style={styles.productName}>{item.productName}</Text>
                      {item.dispatched === "Y" && (
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: "#2ecc71" },
                          ]}
                        >
                          <Text style={styles.statusText}>Dispatched</Text>
                        </View>
                      )}
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 5,
                      }}
                    >
                      <Text style={styles.productDetail}>
                        Qty: {item.quantity} {item.unit}
                      </Text>
                      <Text
                        style={[styles.productDetail, { fontWeight: "500" }]}
                      >
                        ₹{item.amount}
                      </Text>
                    </View>

                    {item.dispatched !== "Y" && (
                      <>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 8,
                          }}
                        >
                          <Ionicons
                            name="document-text-outline"
                            size={16}
                            color={isDark ? colors.textSecondary : "#666"}
                            style={{ marginRight: 5 }}
                          />
                          <Text
                            style={{
                              color: isDark ? colors.textSecondary : "#666",
                              fontSize: 14,
                            }}
                          >
                            Dispatch Notes:
                          </Text>
                        </View>

                        <TextInput
                          style={styles.productRemarkInput}
                          placeholder="Add dispatch notes (optional)"
                          placeholderTextColor={
                            isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
                          }
                          value={productRemarks[index] || ""}
                          onChangeText={(text) =>
                            setProductRemarks((prev) => ({
                              ...prev,
                              [index]: text,
                            }))
                          }
                          multiline
                        />

                        <TouchableOpacity
                          onPress={() => handleProductDispatch(item, index)}
                          disabled={dispatchingIndex === index}
                          style={styles.productDispatchButton}
                        >
                          {dispatchingIndex === index ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.buttonText}>
                              Confirm Dispatch
                            </Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))}

                {/* Close Modal Button */}
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    setSelectedOrder(null);
                  }}
                  style={styles.closeModalButton}
                >
                  <Text
                    style={{
                      color: isDark ? "#fff" : "#000",
                      fontWeight: "500",
                      fontSize: 16,
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default ProcessOrdersScreen;
