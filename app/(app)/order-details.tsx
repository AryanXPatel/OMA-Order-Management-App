// Add this import near the top
import { APP_VERSION } from "../utils/appConfig";
import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Share,
} from "react-native";
import { useFeedback } from "../context/FeedbackContext";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoadingIndicator from "../components/LoadingIndicator";

const getSourceLabel = (source) => {
  switch ((source || "").toLowerCase()) {
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

// Add above your component
const formatDate = (dateStr) => {
  // Example: "27/04/2025 09:23 AM" -> "27 Apr 2025, 09:23 AM"
  if (!dateStr) return "";
  const [date, time, ampm] = dateStr.split(/[\s:]+/);
  const [day, month, year] = date.split("/");
  const months = [
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
  return `${day} ${months[parseInt(month, 10) - 1]} ${year}, ${time}:${ampm}`;
};
const getUserRoleLabel = (user) => {
  if (!user) return "User";
  const lower = user.toLowerCase();
  if (lower.includes("manager")) return "Manager";
  if (lower.includes("user")) return "User";
  return user;
};

const OrderDetailsScreen = () => {
  const { theme, colors } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const isDark = theme === "dark";
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const themeColor = "#8e44ad"; // Purple theme for My Orders

  // Format Indian number with commas - memoized to prevent recalculation
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

  useEffect(() => {
    const loadOrderDetails = async () => {
      try {
        const orderData = await AsyncStorage.getItem("selectedOrder");
        if (orderData) {
          setOrder(JSON.parse(orderData));
        } else {
          Alert.alert("Error", "Order details not found");
          router.back();
        }
      } catch (error) {
        console.error("Error loading order details:", error);
        showFeedback({
          type: "error",
          title: "Data Load Error",
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

  // Share order details - memoized to prevent recreation on each render
  const shareOrder = useCallback(async () => {
    if (!order) return;

    // Determine order status
    let shareStatus = "⏳ Pending";
    const items = order.items || [];
    const allDispatched = items.length > 0 && items.every((i) => i.dispatched);
    const anyRejected = items.some((i) => i.approved === "N");

    if (anyRejected) {
      shareStatus = "❌ Rejected";
    } else if (allDispatched) {
      shareStatus = "🚚 Dispatched";
    } else if (items.every((i) => i.approved === "Y")) {
      shareStatus = "✅️ Approved";
    }

    let message = `📋 *ORDER DETAILS* #${order.orderId}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    message += `*Customer:* ${order.customerName}\n`;
    message += `*Date:* ${order.date}\n`;
    message += `*Status:* ${shareStatus}\n`;
    message += `*Source:* ${getSourceLabel(order.source)}\n`;
    message += `*Created by:* ${getUserRoleLabel(order.user)}\n\n`;

    // Add notes if they exist
    if (
      order.orderComments ||
      order.managerComments ||
      order.dispatchComments
    ) {
      message += `📝 *NOTES*\n`;
      message += `─────────────────────────\n`;
      if (order.orderComments)
        message += `• *O.NOTE:* ${order.orderComments}\n`;
      if (order.managerComments)
        message += `• *M.NOTE:* ${order.managerComments}\n`;
      if (order.dispatchComments)
        message += `• *D.NOTE:* ${order.dispatchComments}\n`;
      message += `\n`;
    }

    message += `🛒 *PRODUCTS*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    order.items.forEach((item, index) => {
      message += `${index + 1}. *${item.productName}*\n`;
      message += `   • *Quantity:* ${item.quantity} ${item.unit}\n`;
      message += `   • *Rate:* ₹${item.rate}\n`;
      message += `   • *Amount:* ₹${item.amount}\n`;
      message += `   • *Status:* ${
        item.dispatched
          ? "🚚 Dispatched"
          : item.approved === "Y"
          ? "✅️ Approved"
          : item.approved === "N"
          ? "❌ Rejected"
          : "⏳ Pending"
      }\n`;

      if (item.dispatched && item.dispatchTime) {
        message += `   • *Dispatch Time:* ${item.dispatchTime}\n`;
      }

      if (item.approved === "N" && item.rejectionReason) {
        message += `   • *Rejection Reason:* ${item.rejectionReason}\n`;
      }

      message += `\n`;
    });

    message += `💰 *TOTAL:* ₹${formatIndianNumber(order.totalAmount)}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `*Order Management App* • v${APP_VERSION}`;

    try {
      await Share.share({
        message: message,
        title: `Order #${order.orderId} Details`,
      });
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Share Failed",
        message:
          "Could not share order details. Please check your device permissions.",
        autoDismiss: true,
      });
    }
  }, [order, formatIndianNumber, showFeedback]);

  // Determine status color - memoized
  const getStatusColor = useCallback((status) => {
    switch (status) {
      case "dispatched":
        return "#00bcd4"; // Blue for dispatched
      case "approved":
      case "Y":
        return "#27ae60"; // Green for approved
      case "rejected":
      case "N":
        return "#e74c3c"; // Red for rejected
      default:
        return "#f39c12"; // Orange for pending
    }
  }, []);

  // Memoize styles to prevent recalculation on each render
  const styles = useMemo(
    () =>
      StyleSheet.create({
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
        orderSummary: {
          backgroundColor: isDark ? colors.surfaceVariant : "white",
          margin: 15,
          marginBottom: 10,
          borderRadius: 12,
          padding: 15,
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
          marginBottom: 10,
        },
        orderIdText: {
          fontSize: 18,
          fontWeight: "bold",
          color: isDark ? colors.text : "#333",
        },
        statusBadge: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
        },
        statusText: {
          color: "#fff",
          fontSize: 12,
          fontWeight: "600",
        },
        customerText: {
          fontSize: 16,
          fontWeight: "500",
          color: isDark ? colors.text : "#333",
          marginBottom: 8,
        },
        detailRow: {
          flexDirection: "row",
          marginBottom: 5,
        },
        detailLabel: {
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          width: 80,
        },
        detailValue: {
          fontSize: 14,
          color: isDark ? colors.text : "#333",
          flex: 1,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: "600",
          color: isDark ? colors.text : "#333",
          marginHorizontal: 15,
          marginTop: 15,
          marginBottom: 10,
        },
        productCard: {
          backgroundColor: isDark ? colors.surfaceVariant : "white",
          marginHorizontal: 15,
          marginBottom: 10,
          borderRadius: 12,
          padding: 15,
          elevation: 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.1,
          shadowRadius: 1,
        },
        productHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 5,
        },
        productName: {
          fontSize: 15,
          fontWeight: "600",
          color: isDark ? colors.text : "#333",
          flex: 1,
        },
        productStatusBadge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 10,
        },
        productStatusText: {
          color: "#fff",
          fontSize: 11,
          fontWeight: "500",
        },
        productDetail: {
          fontSize: 14,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 3,
        },
        rejectionContainer: {
          backgroundColor: isDark
            ? "rgba(231, 76, 60, 0.2)"
            : "rgba(231, 76, 60, 0.1)",
          padding: 10,
          borderRadius: 8,
          marginTop: 5,
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
          backgroundColor: "#27ae60",
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 10,
          alignSelf: "flex-start",
          marginTop: 5,
        },
        dispatchedText: {
          fontSize: 12,
          color: "#fff",
          marginLeft: 3,
        },
        actionButton: {
          backgroundColor: themeColor,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 10,
          margin: 15,
          marginTop: 20,
        },
        actionButtonText: {
          color: "#fff",
          fontSize: 16,
          fontWeight: "600",
          marginLeft: 8,
        },
        summaryRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingVertical: 10,
          paddingHorizontal: 15,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "#f0f0f0",
          marginTop: 5,
        },
        summaryLabel: {
          fontSize: 16,
          fontWeight: "500",
          color: isDark ? colors.text : "#333",
        },
        summaryValue: {
          fontSize: 16,
          fontWeight: "bold",
          color: isDark ? colors.text : "#333",
        },
        commentsContainer: {
          padding: 15,
          backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#f9f9f9",
          borderRadius: 12,
          marginTop: 5,
          marginBottom: 5,
        },
        commentsTitle: {
          fontSize: 14,
          fontWeight: "500",
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 5,
        },
        commentsText: {
          fontSize: 14,
          color: isDark ? colors.text : "#333",
          fontStyle: "italic",
        },
        emptyStateContainer: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        },
        emptyStateText: {
          fontSize: 16,
          color: isDark ? colors.textSecondary : "#666",
          marginTop: 10,
          textAlign: "center",
        },
        noteContainer: {
          marginTop: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        },
        noteLabel: {
          fontSize: 14,
          fontWeight: "600",
          color: isDark ? colors.primary : themeColor,
          marginBottom: 4,
        },
        noteText: {
          fontSize: 14,
          color: isDark ? colors.text : "#333",
          fontStyle: "italic",
        },
        dispatchTimeText: {
          fontSize: 12,
          color: isDark ? "#00bcd4" : "#00bcd4",
          fontStyle: "italic",
          marginTop: 3,
          marginLeft: 8,
        },
      }),
    [isDark, colors, themeColor]
  );

  // Extract Product Item component to improve readability and maintainability
  const ProductItem = useCallback(
    ({ item }) => {
      // Debug logging to check what's happening with item values
      console.log(
        `Debug: ${item.productName}, dispatched=${
          item.dispatched
        }, dispatchTime=${item.dispatchTime}, type=${typeof item.dispatchTime}`
      );

      return (
        <View
          style={[
            styles.productCard,
            item.dispatched
              ? { borderLeftWidth: 3, borderLeftColor: "#00bcd4" }
              : item.approved === "N"
              ? { borderLeftWidth: 3, borderLeftColor: "#e74c3c" }
              : item.approved === "Y"
              ? { borderLeftWidth: 3, borderLeftColor: "#27ae60" }
              : {},
          ]}
        >
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{item.productName}</Text>
            {item.dispatched ? (
              <View
                style={[
                  styles.productStatusBadge,
                  { backgroundColor: "#00bcd4" },
                ]}
              >
                <Text style={styles.productStatusText}>Dispatched</Text>
              </View>
            ) : item.approved === "Y" ? (
              <View
                style={[
                  styles.productStatusBadge,
                  { backgroundColor: "#27ae60" },
                ]}
              >
                <Text style={styles.productStatusText}>Approved</Text>
              </View>
            ) : item.approved === "N" ? (
              <View
                style={[
                  styles.productStatusBadge,
                  { backgroundColor: "#e74c3c" },
                ]}
              >
                <Text style={styles.productStatusText}>Rejected</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.productStatusBadge,
                  { backgroundColor: "#f39c12" },
                ]}
              >
                <Text style={styles.productStatusText}>Pending</Text>
              </View>
            )}
          </View>

          {/* Display dispatch time immediately after product name - more tolerant condition */}
          {item.dispatched ? (
            <Text style={styles.dispatchTimeText}>
              Dispatched on: {item.dispatchTime || "Not recorded"}
            </Text>
          ) : null}

          <Text style={styles.productDetail}>
            Quantity: {item.quantity} {item.unit}
          </Text>
          <Text style={styles.productDetail}>
            Rate: ₹{item.rate} per {item.unit}
          </Text>
          <Text style={styles.productDetail}>Amount: ₹{item.amount}</Text>

          {/* Dispatch tag */}
          {item.dispatched && (
            <View
              style={[styles.dispatchedTag, { backgroundColor: "#00bcd4" }]}
            >
              <Ionicons name="checkmark" size={12} color="#fff" />
              <Text style={styles.dispatchedText}>Dispatched</Text>
            </View>
          )}

          {/* Rejection reason if any */}
          {item.approved === "N" && item.rejectionReason && (
            <View style={styles.rejectionContainer}>
              <Text style={styles.rejectionLabel}>Rejection reason:</Text>
              <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
            </View>
          )}

          {/* Comments section */}
          {item.comments && (
            <View style={styles.commentsContainer}>
              <Text style={styles.commentsTitle}>Comments:</Text>
              <Text style={styles.commentsText}>{item.comments}</Text>
            </View>
          )}
        </View>
      );
    },
    [styles]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <LoadingIndicator message="Loading order details..." />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={60}
            color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
          />
          <Text style={styles.emptyStateText}>Order details not available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <TouchableOpacity onPress={shareOrder}>
          <Ionicons name="share-outline" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        initialNumToRender={4}
      >
        {/* Order Summary */}
        <View style={styles.orderSummary}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderIdText}>Order ID:{order.orderId}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(order.status) },
              ]}
            >
              <Text style={styles.statusText}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Text>
            </View>
          </View>

          <Text style={styles.customerText}>{order.customerName}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>{formatDate(order.date)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Source:</Text>
            <Text style={styles.detailValue}>
              {getSourceLabel(order.source)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created by:</Text>
            <Text style={styles.detailValue}>
              {getUserRoleLabel(order.user)}
            </Text>
          </View>
          {/* Add Order Comments (O.NOTE) */}
          {order.orderComments && (
            <View style={styles.noteContainer}>
              <Text style={styles.noteLabel}>O.NOTE:</Text>
              <Text style={styles.noteText}>{order.orderComments}</Text>
            </View>
          )}

          {/* Add Manager Comments (M.NOTE) */}
          {order.managerComments && (
            <View style={styles.noteContainer}>
              <Text style={styles.noteLabel}>M.NOTE:</Text>
              <Text style={styles.noteText}>{order.managerComments}</Text>
            </View>
          )}
        </View>

        {/* Rejection reason if rejected */}
        {order.status === "rejected" && order.rejectionReason && (
          <View style={[styles.rejectionContainer, { marginHorizontal: 15 }]}>
            <Text style={styles.rejectionLabel}>Reason for rejection:</Text>
            <Text style={styles.rejectionText}>{order.rejectionReason}</Text>
          </View>
        )}

        {/* Products section */}
        <Text style={styles.sectionTitle}>Products ({order.items.length})</Text>

        {/* Using the extracted ProductItem component */}
        {order.items.map((item, index) => (
          <ProductItem key={`product-${index}`} item={item} />
        ))}

        {/* Order total */}
        <View
          style={[
            styles.summaryRow,
            { backgroundColor: isDark ? colors.surfaceVariant : "white" },
          ]}
        >
          <Text style={styles.summaryLabel}>Total Amount</Text>
          <Text style={styles.summaryValue}>
            ₹{formatIndianNumber(order.totalAmount)}
          </Text>
        </View>

        {/* Share button */}
        <TouchableOpacity style={styles.actionButton} onPress={shareOrder}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>Share Order Details</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default OrderDetailsScreen;
