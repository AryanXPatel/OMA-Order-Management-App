import React, { useState, useEffect, useContext } from "react";
import { scale, moderateScale, isTablet } from "../utils/responsive";
import { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
  TextInput,
  SectionList,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import LoadingIndicator from "../components/LoadingIndicator";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

// HELPER FUNCTIONS
// Update parseDate function at the top to handle both date formats and "Unknown Date"
const parseDate = (dateStr) => {
  try {
    if (!dateStr || dateStr === "Unknown Date") {
      return 0; // Return lowest date value for unknown dates
    }

    // Extract just date part in case there's time info
    const datePart = dateStr.split(" ")[0];

    // Now parse the date
    const [day, month, year] = datePart.split("/").map(Number);
    return new Date(year, month - 1, day).getTime();
  } catch (e) {
    console.log("Date parsing error:", e, dateStr);
    return 0; // Return lowest date value on error
  }
};

// Format Indian number with commas
const formatIndianNumber = (num) => {
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
};

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Add this component definition before the MyOrdersScreen component

const OrderItem = React.memo(
  ({
    item,
    isDark,
    colors,
    themeColor,
    formatIndianNumber,
    viewOrderDetails,
    styles, // Pass the styles object
  }) => {
    // Count dispatched items
    const dispatchedCount = item.items.filter((i) => i.dispatched).length;
    const isFullyDispatched =
      dispatchedCount === item.items.length && item.items.length > 0;

    // Get status color - add dispatched case (blue)
    const statusColor = isFullyDispatched
      ? "#00bcd4" // Blue for fully dispatched orders
      : item.status === "approved"
      ? "#27ae60" // Green for approved
      : item.status === "rejected"
      ? "#e74c3c" // Red for rejected
      : "#f39c12"; // Orange for pending

    return (
      <View
        style={[
          styles.orderCard,
          { borderLeftWidth: 4, borderLeftColor: statusColor },
        ]}
      >
        <View style={styles.orderHeader}>
          <Text style={styles.orderIdText}>Order ID: {item.orderId}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {isFullyDispatched
                ? "Dispatched"
                : item.status === "approved"
                ? "Approved"
                : item.status === "rejected"
                ? "Rejected"
                : "Pending"}
            </Text>
          </View>
        </View>
        <Text style={styles.customerText}>{item.customerName}</Text>
        <Text style={styles.detailText}>Date: {item.date}</Text>
        <Text style={styles.detailText}>
          Items: {item.items.length} |
          {dispatchedCount > 0 &&
            ` Dispatched: ${dispatchedCount}/${item.items.length}`}
        </Text>
        {/* Rejection reason if any */}
        {item.status === "rejected" && item.rejectionReason && (
          <View style={styles.rejectionContainer}>
            <Text style={styles.rejectionLabel}>Reason for rejection:</Text>
            <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
          </View>
        )}
        <View style={styles.divider} />
        {/* Products preview */}
        <View style={styles.productsPreview}>
          {item.items.slice(0, 2).map((product, idx) => (
            <View key={idx} style={styles.productItem}>
              <Text style={styles.productName}>• {product.productName}</Text>
              <Text style={styles.productDetail}>
                {product.quantity} {product.unit} × ₹{product.rate} = ₹
                {product.amount}
              </Text>

              {product.dispatched && (
                <View
                  style={[styles.dispatchedTag, { backgroundColor: "#00bcd4" }]}
                >
                  <Ionicons name="checkmark" size={12} color="#fff" />
                  <Text style={styles.dispatchedText}>Dispatched</Text>
                </View>
              )}
            </View>
          ))}

          {item.items.length > 2 && (
            <Text style={styles.moreItemsText}>
              +{item.items.length - 2} more items
            </Text>
          )}
        </View>
        <View style={styles.orderFooter}>
          <Text style={styles.totalText}>
            Total: ₹{formatIndianNumber(item.totalAmount)}
          </Text>

          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() => viewOrderDetails(item)}
          >
            <Text style={styles.viewDetailsText}>View Details</Text>
            <Ionicons name="chevron-forward" size={16} color={themeColor} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const MyOrdersScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, pending, approved, rejected, dispatched
  const [displayLimit, setDisplayLimit] = useState(20);

  // Color definitions
  const themeColor = "#8e44ad"; // Purple theme for My Orders

  useEffect(() => {
    const loadUserRole = async () => {
      const role = await AsyncStorage.getItem("userRole");
      setUsername(role || "");
    };

    loadUserRole();
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);

      // Try to get from cache first
      const cachedOrders = apiCache.get("myOrders");
      if (cachedOrders) {
        setOrders(cachedOrders);
        setLoading(false);
      }

      // Get current user role instead of username
      const userRole = await AsyncStorage.getItem("userRole");
      if (!userRole) {
        throw new Error("User not found. Please log in again.");
      }

      // Fetch all orders from the API
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        // Process each row
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
          approved: row[12] || "",
          managerComments: row[13] || "",
          dispatched: row[14] || "",
          dispatchComments: row[15] || "",
          dispatchTime: row[16] || "", // Column Q (dispatch time)
        }));

        // Filter orders by current user role (Manager or User)
        // Instead of matching exact username, just show all orders for that role
        const userOrders =
          userRole === "Manager"
            ? allRows // Managers see all orders
            : allRows.filter((row) => row.user === userRole); // Users see their own orders

        // Rest of the function remains the same
        // Group the orders by orderId
        const groupedOrders = {};
        userOrders.forEach((order) => {
          // Your existing grouping logic
          if (!groupedOrders[order.orderId]) {
            groupedOrders[order.orderId] = {
              orderId: order.orderId,
              date: order.orderTime || order.sysTime, // Use orderTime if set, else sysTime
              customerName: order.customerName,
              user: order.user,
              source: order.source,
              items: [],
              totalAmount: 0,
              status:
                order.approved === "Y"
                  ? "approved"
                  : order.approved === "N"
                  ? "rejected"
                  : "pending",
              rejectionReason: order.rejectionReason,
              orderComments: order.orderComments, // O.NOTE - Column D - ORDER COMMENTS
              managerComments: order.managerComments, // M.NOTE - Column N - MANAGER COMMENTS
              dispatchComments: order.comments, // D.NOTE - Column P - DISPATCH COMMENTS
            };
          }

          // ...existing code...
          groupedOrders[order.orderId].items.push({
            productName: order.productName,
            quantity: order.quantity,
            unit: order.unit,
            rate: order.rate,
            amount: order.amount,
            actualRowIndex: order.actualRowIndex,
            approved: order.approved,
            rejected: order.approved === "N",
            dispatched: order.dispatched === "Y",
            rejectionReason: order.rejectionReason,
            comments: order.dispatchComments, // Use dispatchComments for consistency
            dispatchTime: order.dispatchTime, // Only include once
          });

          // Update status for the whole order
          const items = groupedOrders[order.orderId].items;
          const allDispatched =
            items.length > 0 && items.every((i) => i.dispatched);
          const anyRejected = items.some((i) => i.approved === "N");

          if (anyRejected) {
            groupedOrders[order.orderId].status = "rejected";
            groupedOrders[order.orderId].rejectionReason =
              order.rejectionReason;
          } else if (allDispatched) {
            groupedOrders[order.orderId].status = "dispatched";
          } else if (items.every((i) => i.approved === "Y")) {
            groupedOrders[order.orderId].status = "approved";
          } else {
            groupedOrders[order.orderId].status = "pending";
          }

          // Add to total amount
          const cleanAmount = order.amount.replace(/,/g, "");
          groupedOrders[order.orderId].totalAmount += parseFloat(
            cleanAmount || 0
          );
        });

        // Convert to array and sort (keep existing code)
        const ordersList = Object.values(groupedOrders).sort((a, b) => {
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          return dateB - dateA;
        });

        setOrders(ordersList);
        apiCache.set("myOrders", ordersList);
      }
    } catch (error) {
      Alert.alert(
        "Error",
        `Failed to load orders: ${error.message || "Please try again."}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    apiCache.set("myOrders", null); // Clear cache to force refresh
    await loadOrders();
  };

  const debouncedSearch = useCallback(
    debounce((text) => {
      setSearchQuery(text);
    }, 300),
    []
  );

  const getGroupedOrdersByDate = useMemo(() => {
    // Apply search filter if there is a search query
    let filteredOrders = orders;
    if (searchQuery) {
      filteredOrders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          order.customerName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== "all") {
      if (filterStatus === "dispatched") {
        // For dispatched filter, check if all items in the order are dispatched
        filteredOrders = filteredOrders.filter(
          (order) =>
            order.items.length > 0 &&
            order.items.every((item) => item.dispatched)
        );
      } else {
        // For other filters (pending, approved, rejected)
        filteredOrders = filteredOrders.filter(
          (order) => order.status === filterStatus
        );
      }
    }

    // Group by date
    const grouped = {};
    filteredOrders.forEach((order) => {
      // Use the mapped .date property
      const dateString = order.date || "Unknown Date";
      const datePart = dateString.split(" ")[0];

      if (!grouped[datePart]) {
        grouped[datePart] = [];
      }
      grouped[datePart].push(order);
    });

    // Convert to array format expected by SectionList
    return Object.keys(grouped)
      .sort((a, b) => parseDate(b) - parseDate(a))
      .map((date) => ({
        date,
        data: grouped[date],
      }));
  }, [orders, searchQuery, filterStatus]); // Dependencies

  const renderOrderItem = ({ item }) => {
    // Count dispatched items
    const dispatchedCount = item.items.filter((i) => i.dispatched).length;
    const isFullyDispatched =
      dispatchedCount === item.items.length && item.items.length > 0;

    // Get status color - add dispatched case (blue)
    const statusColor = isFullyDispatched
      ? "#00bcd4" // Blue for fully dispatched orders
      : item.status === "approved"
      ? "#27ae60" // Green for approved
      : item.status === "rejected"
      ? "#e74c3c" // Red for rejected
      : "#f39c12"; // Orange for pending
    return (
      <View
        style={[
          styles.orderCard,
          { borderLeftWidth: 4, borderLeftColor: statusColor },
        ]}
      >
        <View style={styles.orderHeader}>
          <Text style={styles.orderIdText}>Order ID:{item.orderId}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {isFullyDispatched
                ? "Dispatched"
                : item.status === "approved"
                ? "Approved"
                : item.status === "rejected"
                ? "Rejected"
                : "Pending"}
            </Text>
          </View>
        </View>

        <Text style={styles.customerText}>{item.customerName}</Text>
        <Text style={styles.detailText}>Date: {item.date}</Text>
        {item.orderComments ? (
          <Text style={styles.detailText}>Comments: {item.orderComments}</Text>
        ) : null}
        <Text style={styles.detailText}>
          Items: {item.items.length} |
          {dispatchedCount > 0 &&
            ` Dispatched: ${dispatchedCount}/${item.items.length}`}
        </Text>

        {/* Rejection reason if any */}
        {item.status === "rejected" && item.rejectionReason && (
          <View style={styles.rejectionContainer}>
            <Text style={styles.rejectionLabel}>Reason for rejection:</Text>
            <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Products preview */}
        <View style={styles.productsPreview}>
          {item.items.slice(0, 2).map((product, idx) => (
            <View key={idx} style={styles.productItem}>
              <Text style={styles.productName}>• {product.productName}</Text>
              <Text style={styles.productDetail}>
                {product.quantity} {product.unit} × ₹{product.rate} = ₹
                {product.amount}
              </Text>

              {product.dispatched && (
                <View
                  style={[styles.dispatchedTag, { backgroundColor: "#00bcd4" }]}
                >
                  <Ionicons name="checkmark" size={12} color="#fff" />
                  <Text style={styles.dispatchedText}>Dispatched</Text>
                </View>
              )}
            </View>
          ))}

          {item.items.length > 2 && (
            <Text style={styles.moreItemsText}>
              +{item.items.length - 2} more items
            </Text>
          )}
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.totalText}>
            Total: ₹{formatIndianNumber(item.totalAmount)}
          </Text>

          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() => viewOrderDetails(item)}
          >
            <Text style={styles.viewDetailsText}>View Details</Text>
            <Ionicons name="chevron-forward" size={16} color={themeColor} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const viewOrderDetails = (order) => {
    // Store order details to view in the details screen
    AsyncStorage.setItem("selectedOrder", JSON.stringify(order))
      .then(() => {
        router.push("/(app)/order-details");
      })
      .catch((err) => {
        Alert.alert("Error", "Failed to view order details");
      });
  };

  const renderSectionHeader = ({ section: { date } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{date}</Text>
    </View>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : "#f5f5f5",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 50,
      paddingBottom: 15,
      paddingHorizontal: 20,
      backgroundColor: isDark ? colors.surfaceVariant : themeColor,
    },
    headerTitle: {
      color: isDark ? colors.text : "#FFF",
      fontSize: 20,
      fontWeight: "bold",
    },
    iconStyle: {
      color: isDark ? colors.text : "#FFF",
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? colors.surfaceVariant : "white",
      marginHorizontal: 15,
      marginVertical: 10,
      paddingHorizontal: 15,
      borderRadius: 25,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 2,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      paddingRight: 10,
      fontSize: 15,
      color: isDark ? colors.text : "#000",
    },
    // filterContainer: {
    //   flexDirection: "row",
    //   paddingHorizontal: 15,
    //   marginBottom: 10,
    // },
    // filterButton: {
    //   paddingVertical: scale(10),
    //   paddingHorizontal: scale(16),
    //   borderRadius: 20,
    //   borderWidth: 1.5,
    //   marginRight: scale(10),
    //   minWidth: 80,
    //   backgroundColor: isDark ? "rgba(50, 50, 50, 0.8)" : "#FFFFFF", // Add background color
    //   alignItems: "center", // Center the text horizontally
    //   justifyContent: "center", // Center the text vertically
    // },
    // filterButtonText: {
    //   fontSize: moderateScale(13),
    //   fontWeight: "600",
    //   textAlign: "center", // Ensure text is centered
    // },
    // activeFilter: {
    //   backgroundColor: themeColor,
    //   borderColor: themeColor,
    // },
    // activeFilterText: {
    //   color: "#fff",
    // },
    infoText: {
      color: isDark ? colors.textSecondary : "#666",
      fontSize: 13,
      textAlign: "center",
      paddingHorizontal: 15,
      marginTop: 5,
    },
    orderCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      borderRadius: 12,
      padding: 15,
      marginHorizontal: 15,
      marginBottom: 10,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 2,
    },
    orderHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    orderIdText: {
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? colors.text : "#333",
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    statusText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "500",
    },
    customerText: {
      fontSize: 15,
      fontWeight: "500",
      color: isDark ? colors.text : "#333",
      marginBottom: 4,
    },
    detailText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      marginBottom: 2,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      marginVertical: 10,
    },
    productsPreview: {
      marginBottom: 10,
    },
    productItem: {
      marginBottom: 6,
    },
    productName: {
      fontSize: 14,
      fontWeight: "500",
      color: isDark ? colors.text : "#333",
    },
    productDetail: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : "#666",
      marginLeft: 15,
    },
    moreItemsText: {
      fontSize: 13,
      color: themeColor,
      fontStyle: "italic",
      marginTop: 3,
    },
    orderFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 5,
    },
    totalText: {
      fontSize: 15,
      fontWeight: "bold",
      color: isDark ? colors.text : "#333",
    },
    viewDetailsButton: {
      flexDirection: "row",
      alignItems: "center",
    },
    viewDetailsText: {
      fontSize: 14,
      color: themeColor,
      fontWeight: "500",
      marginRight: 2,
    },
    sectionHeader: {
      backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)",
      padding: 10,
      paddingHorizontal: 15,
    },
    sectionHeaderText: {
      fontSize: 14,
      fontWeight: "600",
      color: isDark ? colors.textSecondary : "#666",
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
    rejectionContainer: {
      backgroundColor: isDark
        ? "rgba(231, 76, 60, 0.2)"
        : "rgba(231, 76, 60, 0.1)",
      padding: 10,
      borderRadius: 8,
      marginTop: 8,
    },
    rejectionLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: isDark ? "#e74c3c" : "#c0392b",
      marginBottom: 3,
    },
    rejectionText: {
      fontSize: 13,
      color: isDark ? colors.text : "#333",
      fontStyle: "italic",
    },
    dispatchedTag: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#00bcd4",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      alignSelf: "flex-start",
      marginTop: 3,
    },
    dispatchedText: {
      fontSize: 11,
      color: "#fff",
      marginLeft: 3,
    },
    ordersCountText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      textAlign: "center",
      marginVertical: 10,
    },
    // In your styles:
    quantityInputRow: {
      flexDirection: "row",
      alignItems: "center",
      width: isTablet ? "60%" : "100%",
      alignSelf: isTablet ? "center" : undefined,
    },

    // Make inputs larger on tablet
    quantityInput: {
      flex: 1,
      height: scale(50),
      backgroundColor: isDark ? "rgba(50, 50, 50, 0.8)" : "#f5f6fa",
      borderRadius: scale(8),
      marginHorizontal: scale(10),
      paddingHorizontal: scale(15),
      fontSize: moderateScale(16),
      textAlign: "center",
      color: isDark ? "#ffffff" : "#000",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.2)" : "#e0e0e0",
    },
    // Add these new styles to your StyleSheet
    filterTabsContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 10,
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    filterScrollContainer: {
      paddingHorizontal: 15,
      paddingVertical: 5,
      flexGrow: 1,
    },
    filterPill: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      marginRight: 12,
      backgroundColor: isDark ? "rgba(40,40,40,0.5)" : "#FFFFFF",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 2,
      elevation: 3,
    },
    filterIcon: {
      marginRight: 6,
    },
    filterLabel: {
      fontSize: moderateScale(13),
      fontWeight: "600",
      color: isDark ? "rgba(255,255,255,0.85)" : "#555",
    },
    activeFilterLabel: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    activeFilterIndicator: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#FFF",
      marginLeft: 6,
    },
    orderCountBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 15,
    },
    orderCountText: {
      fontSize: 13,
      fontWeight: "bold",
      color: isDark ? colors.textSecondary : "#666",
    },
    loadMoreButton: {
      backgroundColor: isDark
        ? "rgba(138, 80, 177, 0.1)"
        : "rgba(138, 80, 177, 0.05)",
      paddingVertical: 15,
      borderRadius: 10,
      alignItems: "center",
      margin: 15,
    },
    loadMoreText: {
      color: themeColor,
      fontWeight: "500",
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            style={styles.iconStyle}
          />
        </TouchableOpacity>
      </View>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={isDark ? colors.textSecondary : "#666"}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search orders..."
          placeholderTextColor={
            isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
          }
          value={searchQuery}
          onChangeText={(text) => {
            // Direct UI update
            setSearchQuery(text);
            // Debounced filtering
            debouncedSearch(text);
          }}
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
      {/* Filter buttons */}
      {/* Enhanced Filter Buttons */}
      <View style={styles.filterTabsContainer}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContainer}
          >
            {[
              { id: "all", label: "All", icon: "apps", color: themeColor },
              {
                id: "pending",
                label: "Pending",
                icon: "hourglass-outline",
                color: "#f39c12",
              },
              {
                id: "approved",
                label: "Approved",
                icon: "checkmark-circle-outline",
                color: "#27ae60",
              },
              {
                id: "rejected",
                label: "Rejected",
                icon: "close-circle-outline",
                color: "#e74c3c",
              },
              {
                id: "dispatched",
                label: "Dispatched",
                icon: "paper-plane-outline",
                color: "#00bcd4",
              },
            ].map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterPill,
                  filterStatus === filter.id && {
                    backgroundColor: filter.color,
                  },
                  filterStatus !== filter.id &&
                    isDark && { backgroundColor: "rgba(40, 40, 40, 0.8)" },
                ]}
                onPress={() => setFilterStatus(filter.id)}
              >
                <Ionicons
                  name={filter.icon}
                  size={16}
                  color={
                    filterStatus === filter.id
                      ? "#fff"
                      : isDark
                      ? "#fff"
                      : filter.color
                  }
                  style={styles.filterIcon}
                />
                <Text
                  style={[
                    styles.filterLabel,
                    filterStatus === filter.id && styles.activeFilterLabel,
                    filterStatus !== filter.id && isDark && { color: "#fff" },
                  ]}
                >
                  {filter.label}
                </Text>
                {filterStatus === filter.id && (
                  <View style={styles.activeFilterIndicator} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Order count badge always visible at end of filter bar */}
          {!loading && !refreshing && (
            <View style={styles.orderCountBadge}>
              <Text style={styles.orderCountText}>
                {getGroupedOrdersByDate.reduce(
                  (sum, section) => sum + section.data.length,
                  0
                )}
              </Text>
            </View>
          )}
        </View>
      </View>
      {/* Order list */}
      {loading ? (
        <LoadingIndicator message="Loading your orders..." showTips={true} />
      ) : (
        <SectionList
          sections={getGroupedOrdersByDate.slice(0, displayLimit)}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => (
            <OrderItem
              item={item}
              isDark={isDark}
              colors={colors}
              themeColor={themeColor}
              formatIndianNumber={formatIndianNumber}
              viewOrderDetails={viewOrderDetails}
              styles={styles} // Pass the styles object
            />
          )}
          renderSectionHeader={({ section: { date } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{date}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[themeColor]}
            />
          }
          ListFooterComponent={() =>
            getGroupedOrdersByDate.length > displayLimit ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => setDisplayLimit((prev) => prev + 20)}
              >
                <Text style={styles.loadMoreText}>
                  Load More ({getGroupedOrdersByDate.length - displayLimit}{" "}
                  remaining)
                </Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="document-text-outline"
                size={60}
                color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
              />
              <Text style={styles.emptyText}>
                No orders found
                {filterStatus !== "all" ? ` with status "${filterStatus}"` : ""}
                {searchQuery ? ` matching "${searchQuery}"` : ""}
              </Text>
            </View>
          }
          // Add this for optimal performance
          getItemLayout={(data, index) => ({
            length: 200, // approximate height of each order card
            offset: 200 * index,
            index,
          })}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}
    </View>
  );
};

export default MyOrdersScreen;
