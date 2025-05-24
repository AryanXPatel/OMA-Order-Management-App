import React, { useEffect, useState, useContext, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useMemo } from "react";
import {
  scale,
  moderateScale,
  isTablet,
  screenWidth,
} from "../utils/responsive";
import { useFeedback } from "../context/FeedbackContext";
import {
  wakeUpServer,
  preloadData,
  apiCache,
  fetchWithRetry,
  BACKEND_URL,
} from "../utils/apiManager";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  Dimensions,
  StatusBar,
  Animated,
  Easing,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const CARD_WIDTH = isTablet ? screenWidth * 0.3 : screenWidth * 0.42;
export default function MainScreen() {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingApprovals: 0,
    pendingDispatches: 0,
    recentOrders: 0,
    totalCustomers: 0,
  });
  const isDark = theme === "dark";
  // Add these new state variables
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const pulseAnimations = useRef<{ [key: string]: Animated.Value }>({
    approveOrders: new Animated.Value(1),
    processOrders: new Animated.Value(1),
  }).current;

  useEffect(() => {
    const setupApp = async () => {
      setLoading(true);
      await apiCache.loadFromStorage();
      await wakeUpServer();
      await preloadData();

      // Load stats based on role
      await loadStats();

      // Get last login time
      const lastLoginTime = await AsyncStorage.getItem("lastLogin");
      if (lastLoginTime) {
        const date = new Date(lastLoginTime);
        setLastLogin(formatDateTime(date));
      }

      setLoading(false);
    };

    setupApp();

    const keepAliveInterval = setInterval(() => {
      wakeUpServer();
    }, 10 * 60 * 1000);

    return () => clearInterval(keepAliveInterval);
  }, [userRole]);

  useEffect(() => {
    loadUserRole();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // This runs when the screen is focused
      if (userRole) {
        // Force data refresh on screen focus, don't use cache
        loadStats(true); // Pass true to force refresh
      }
      return () => {
        // This runs when the screen is unfocused
      };
    }, [userRole])
  );

  // Adjust the refresh interval
  useEffect(() => {
    // Set up more frequent polling for live updates
    refreshInterval.current = setInterval(async () => {
      if (!loading && !refreshing) {
        // Silent refresh in background
        await silentRefresh();
      }
    }, 120000); // 2 minutes (120000 ms) refresh interval

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [loading, refreshing, userRole]);

  // Add this function for pull-to-refresh
  // Around line 127
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Always force refresh when user pulls to refresh
      await loadStats(true);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const silentRefresh = async () => {
    try {
      // Check if refresh is needed
      const cachedStats = apiCache.get("dashboardStats");
      const currentTime = new Date().getTime();

      // Don't refresh if we refreshed in the last 60 seconds
      if (
        cachedStats &&
        cachedStats.timestamp &&
        currentTime - cachedStats.timestamp < 60000
      ) {
        return;
      }

      // Make API call to fetch latest data
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        const uniqueCustomers = new Set();
        const uniqueRecentOrders = new Set();
        const pendingApprovalOrders = new Set();
        const pendingDispatchOrders = new Set();

        // Process the data with our enhanced function
        processStatsData(response.data.values, {
          uniqueCustomers,
          uniqueRecentOrders,
          pendingApprovalOrders,
          pendingDispatchOrders,
        });

        // Update stats with new values
        const newStats = {
          pendingApprovals: pendingApprovalOrders.size,
          pendingDispatches: pendingDispatchOrders.size,
          recentOrders: uniqueRecentOrders.size,
          totalCustomers: uniqueCustomers.size,
        };

        // Check if any stats changed before updating
        const hasChanges = JSON.stringify(newStats) !== JSON.stringify(stats);

        if (hasChanges) {
          setStats(newStats);
          setLastUpdated(new Date());

          // Apply animations for changed values
          if (stats.pendingApprovals !== newStats.pendingApprovals) {
            pulseAnimation("approveOrders");
          }
          if (stats.pendingDispatches !== newStats.pendingDispatches) {
            pulseAnimation("processOrders");
          }

          // Update cache
          apiCache.set("dashboardStats", {
            data: newStats,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      // Silent error handling - no feedback shown
    }
  };

  const processStatsData = (orders, statsObjects) => {
    const {
      uniqueCustomers,
      uniqueRecentOrders,
      pendingApprovalOrders,
      pendingDispatchOrders,
    } = statsObjects;

    // Get current date for "recent orders" (last 7 days)
    const currentDate = new Date();
    const sevenDaysAgo = new Date(currentDate);
    sevenDaysAgo.setDate(currentDate.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Track order statuses by ID
    const orderStatuses = {};
    const orderDates = {};

    // STEP 1: First pass - gather basic data
    orders.forEach((row) => {
      if (!row || row.length < 13) return;

      const dateStr = row[0] || ""; // SYS-TIME
      const customerName = row[4] || ""; // CUSTOMER NAME (E)
      const orderId = row[5] || ""; // ORDER ID (F)
      const approved = row[12] || ""; // APPROVED BY MANAGER: Y/N/R (M)

      if (!orderId) return;

      // Add unique customers
      if (customerName) uniqueCustomers.add(customerName);

      // Initialize order status tracking
      if (!orderStatuses[orderId]) {
        orderStatuses[orderId] = {
          hasRStatus: false,
          hasPendingStatus: false,
          hasApprovedItems: false,
          hasUndispatchedItems: false,
        };

        // Store date for processing
        orderDates[orderId] = dateStr;
      }

      // Track approval statuses
      if (approved === "R") {
        orderStatuses[orderId].hasRStatus = true;
      } else if (approved === "") {
        orderStatuses[orderId].hasPendingStatus = true;
      } else if (approved === "Y") {
        orderStatuses[orderId].hasApprovedItems = true;
      }
    });

    // STEP 2: Process dispatch status
    orders.forEach((row) => {
      if (!row) return;

      const orderId = row[5] || ""; // ORDER ID (F)
      const approved = row[12] || ""; // APPROVED BY MANAGER: Y/N/R (M)
      const dispatched = row[14] || ""; // ORDER DISPATCHED: Y/N (O)

      if (!orderId || !orderStatuses[orderId]) return;

      // Check dispatch only for approved items
      if (approved === "Y" && dispatched !== "Y") {
        orderStatuses[orderId].hasUndispatchedItems = true;
      }
    });

    // STEP 3: Collect results
    Object.entries(orderStatuses).forEach(([orderId, status]) => {
      // Process approvals
      if (status.hasRStatus || status.hasPendingStatus) {
        pendingApprovalOrders.add(orderId);
      }

      // Process dispatches
      if (status.hasApprovedItems && status.hasUndispatchedItems) {
        pendingDispatchOrders.add(orderId);
      }

      // Process dates for recent orders
      const dateStr = orderDates[orderId];
      if (dateStr) {
        const orderDate = parseIndianDate(dateStr);
        if (orderDate && !isNaN(orderDate.getTime())) {
          if (orderDate >= sevenDaysAgo) {
            uniqueRecentOrders.add(orderId);
          }
        }
      }
    });
  };

  const pulseAnimation = (key) => {
    if (pulseAnimations[key]) {
      pulseAnimations[key].setValue(1);
      Animated.sequence([
        Animated.timing(pulseAnimations[key], {
          toValue: 1.1, // Reduce animation scale from 1.2 to 1.1
          duration: 200, // Reduce duration from 300 to 200
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimations[key], {
          toValue: 1,
          duration: 200, // Reduce duration from 300 to 200
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const formatDateTime = (date) => {
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const loadUserRole = async () => {
    try {
      const role = await AsyncStorage.getItem("userRole");
      if (!role) {
        router.replace("/(auth)/login");
        return;
      }
      setUserRole(role);
    } catch (error) {
      router.replace("/(auth)/login");
    }
  };

  // Add this utility function to get current fiscal year
  const getCurrentFiscalYear = () => {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed (January is 0)
    const currentYear = today.getFullYear();

    // April is month 3 (0-indexed)
    const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
    const fiscalYearEnd = fiscalYearStart + 1;
    return `${fiscalYearStart}-${fiscalYearEnd}`;
  };

  const parseIndianDate = (dateStr) => {
    if (!dateStr) return null;

    try {
      // First handle time component
      const datePart = dateStr.split(" ")[0].trim();

      if (datePart.includes("/")) {
        const parts = datePart.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);

          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(year, month - 1, day, 0, 0, 0, 0);
          }
        }
      }

      // Direct parsing as fallback
      return new Date(dateStr);
    } catch (error) {
      return null;
    }
  };

  const loadStats = async (forceRefresh = false) => {
    try {
      // Check cache first, but only if not forcing a refresh
      const cachedStats = apiCache.get("dashboardStats");
      const currentTime = new Date().getTime();

      if (
        !forceRefresh &&
        cachedStats?.data &&
        cachedStats.timestamp &&
        currentTime - cachedStats.timestamp < 5 * 60 * 1000
      ) {
        setStats(cachedStats.data);
        setLastUpdated(new Date(cachedStats.timestamp));
        return;
      }

      // Fetch orders data
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        // Initialize tracking sets
        const uniqueCustomers = new Set();
        const uniqueRecentOrders = new Set();
        const pendingApprovalOrders = new Set();
        const pendingDispatchOrders = new Set();

        // Process data using optimized function
        processStatsData(response.data.values, {
          uniqueCustomers,
          uniqueRecentOrders,
          pendingApprovalOrders,
          pendingDispatchOrders,
        });

        // Create the stats object
        const statsData = {
          pendingApprovals: pendingApprovalOrders.size,
          pendingDispatches: pendingDispatchOrders.size,
          recentOrders: uniqueRecentOrders.size,
          totalCustomers: uniqueCustomers.size,
        };

        setStats(statsData);
        setLastUpdated(new Date());
        apiCache.set("dashboardStats", {
          data: statsData,
          timestamp: currentTime,
        });
      }
    } catch (error) {
      // Keep existing stats if possible
      if (stats.totalCustomers === 0) {
        setStats({
          pendingApprovals: 0,
          pendingDispatches: 0,
          recentOrders: 0,
          totalCustomers: 0,
        });
      }

      showFeedback({
        type: "error",
        title: "Data Load Error",
        message: "Could not load dashboard statistics. Pull down to retry.",
        autoDismiss: true,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(["userRole", "lastLogin"]);
      router.replace("/(auth)/login");
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Logout Failed",
        message: "Failed to logout. Please try again.",
        autoDismiss: true,
      });
    }
  };

  const MenuCard = React.memo(
    ({ icon, title, onPress, color, badge = null }) => {
      const isLiveCard =
        title === "Approve Orders" || title === "Process Orders";
      const animationKey =
        title === "Approve Orders" ? "approveOrders" : "processOrders";
      const hasUpdates = badge !== null && badge > 0;

      return (
        <Animated.View
          style={[
            // Ensure the animated container maintains the same dimensions as the card
            {
              width: CARD_WIDTH,
              height: isTablet ? 150 : 120,
              marginBottom: scale(15),
              marginRight: isTablet ? scale(15) : 0,
            },
            isLiveCard && hasUpdates
              ? {
                  transform: [{ scale: pulseAnimations[animationKey] }],
                  shadowColor: color,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                  elevation: 8,
                }
              : {},
          ]}
        >
          <TouchableOpacity
            style={[
              styles.menuCard,
              { backgroundColor: color },
              isLiveCard &&
                hasUpdates && {
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.7)",
                },
            ]}
            onPress={onPress}
          >
            <Ionicons name={icon} size={36} color="#FFF" />
            <Text style={styles.menuCardText}>{title}</Text>

            {badge !== null && badge > 0 && (
              <>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    }
  );

  const renderMenuCards = () => {
    // Define menu items based on user role
    const menuItems =
      userRole === "Manager"
        ? [
            {
              icon: "checkmark-circle",
              title: "Approve Orders",
              color: "#2980b9",
              badge: stats.pendingApprovals,
              route: "/(app)/order-approval",
            },
            {
              icon: "bar-chart",
              title: "View Summary",
              color: "#16a085",
              route: "/(app)/customer-summary",
            },
            {
              icon: "add-circle",
              title: "New Order",
              color: "#3498db",
              route: "/(app)/new-order",
            },
            {
              icon: "list",
              title: "Process Orders",
              color: "#e67e22",
              badge: stats.pendingDispatches,
              route: "/(app)/process-orders",
            },
            {
              icon: "cube",
              title: "Products",
              color: "#27ae60",
              route: "/(app)/products",
            },
            {
              icon: "receipt",
              title: "My Orders",
              color: "#8e44ad",
              route: "/(app)/my-orders",
            },
            {
              icon: "people",
              title: "Customers",
              color: "#9b59b6",
              route: "/(app)/customers",
            },
            {
              icon: "analytics",
              title: "Analytics",
              color: "#2c3e50",
              // route: "/(app)/analytics"
            },
          ]
        : [
            {
              icon: "add-circle",
              title: "New Order",
              color: "#3498db",
              route: "/(app)/new-order",
            },
            {
              icon: "list",
              title: "Process Orders",
              color: "#e67e22",
              badge: stats.pendingDispatches,
              route: "/(app)/process-orders",
            },
            {
              icon: "people",
              title: "Customers",
              color: "#9b59b6",
              route: "/(app)/customers",
            },
            {
              icon: "cube",
              title: "Products",
              color: "#27ae60",
              route: "/(app)/products",
            },
            {
              icon: "receipt",
              title: "My Orders",
              color: "#8e44ad",
              route: "/(app)/my-orders",
            },
            {
              icon: "analytics",
              title: "Analytics",
              color: "#2c3e50",
              // route: "/(app)/analytics"
            },
          ];

    // Use numColumns={2} in your FlatList instead of wrapping in a View with flexWrap
    return (
      <FlatList
        data={menuItems}
        numColumns={2}
        columnWrapperStyle={styles.menuGrid}
        renderItem={({ item }) => (
          <MenuCard
            icon={item.icon}
            title={item.title}
            color={item.color}
            badge={item.badge}
            onPress={() => (item.route ? router.push(item.route) : null)}
          />
        )}
        keyExtractor={(item) => item.title}
        scrollEnabled={false}
      />
    );
  };

  const StatCard = React.memo(({ icon, title, value, color }) => (
    <TouchableOpacity style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statIconContainer}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={[styles.statTitle, { color }]}>{title}</Text>
      </View>
    </TouchableOpacity>
  ));

  const styles = StyleSheet.create({
    liveIndicator: {
      position: "absolute",
      bottom: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.3)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#ff3b30",
      marginRight: 4,
    },
    liveText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "bold",
    },
    lastUpdatedContainer: {
      alignItems: "center",
      paddingVertical: 5,
      opacity: 0.7,
    },
    lastUpdatedText: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : "#777",
    },
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : "#f4f4f8",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 50,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: isDark ? colors.surfaceVariant : colors.primary,
    },
    headerTitle: {
      color: isDark ? colors.text : "#FFF",
      fontSize: 20,
      fontWeight: "bold",
    },
    welcomeSection: {
      padding: 20,
      backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
      marginBottom: 15,
      borderRadius: isDark ? 0 : 15,
      marginHorizontal: isDark ? 0 : 15,
      marginTop: isDark ? 0 : 15,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    welcomeText: {
      fontSize: 26,
      fontWeight: "700",
      color: isDark ? colors.text : "#222",
      marginBottom: 8,
    },
    userRole: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : "#666",
      marginBottom: 5,
    },
    lastLogin: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : "#888",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
      marginHorizontal: 20,
      marginBottom: 15,
      marginTop: 10,
    },
    menuGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: isTablet ? "flex-start" : "space-between",
      paddingHorizontal: scale(20),
    },

    menuCard: {
      width: CARD_WIDTH,
      height: isTablet ? 150 : 120,
      borderRadius: scale(15),
      justifyContent: "center",
      alignItems: "center",
      marginBottom: scale(15),
      marginRight: isTablet ? scale(15) : 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 4,
      position: "relative",
    },
    menuCardText: {
      color: "#FFF",
      marginTop: 10,
      fontWeight: "600",
      fontSize: 15,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark
        ? "rgba(231, 76, 60, 0.2)"
        : "rgba(231, 76, 60, 0.1)",
      marginHorizontal: 20,
      marginTop: 20,
      padding: 15,
      borderRadius: 12,
    },
    logoutText: {
      color: isDark ? "#e74c3c" : "#c0392b",
      marginLeft: 10,
      fontWeight: "500",
    },
    themeToggle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isDark
        ? "rgba(255,255,255,0.1)"
        : "rgba(255,255,255,0.3)",
    },
    statsContainer: {
      paddingHorizontal: 20,
      marginBottom: 25,
    },
    statCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#FFF",
      borderRadius: 12,
      padding: 15,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.1,
      shadowRadius: 2,
      elevation: 2,
      flexDirection: "row",
      alignItems: "center",
      borderLeftWidth: 4,
    },
    statIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 15,
    },
    statContent: {
      flex: 1,
    },
    statValue: {
      fontSize: 20,
      fontWeight: "700",
      color: isDark ? colors.text : "#333",
    },
    statTitle: {
      fontSize: 14,
      opacity: 0.8,
    },
    badge: {
      position: "absolute",
      top: 10,
      right: 10,
      backgroundColor: "#e74c3c",
      borderRadius: 12,
      width: 24,
      height: 24,
      justifyContent: "center",
      alignItems: "center",
    },
    badgeText: {
      color: "#FFF",
      fontSize: 12,
      fontWeight: "bold",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 100,
    },
  });

  if (loading || !userRole) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
        <ActivityIndicator
          size="large"
          color={isDark ? colors.primary : colors.primary}
        />
        <Text style={{ color: isDark ? colors.text : "#333", marginTop: 15 }}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Management App</Text>
        <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={22}
            color={isDark ? colors.text : "#FFF"}
          />
        </TouchableOpacity>
      </View>
      <FlatList
        data={[1]} // Use dummy data to render a single item
        keyExtractor={() => "main"}
        renderItem={() => (
          <>
            <View style={styles.welcomeSection}>
              <Text style={styles.welcomeText}>Welcome Back!</Text>
              <Text style={styles.userRole}>Logged in as {userRole}</Text>
              {lastLogin && (
                <Text style={styles.lastLogin}>Last login: {lastLogin}</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Dashboard</Text>

            {lastUpdated && (
              <View style={styles.lastUpdatedContainer}>
                <Text style={styles.lastUpdatedText}>
                  Last updated:{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            )}

            <View style={styles.statsContainer}>
              {userRole === "Manager" && (
                <StatCard
                  icon="checkmark-done-circle"
                  title="Pending Approvals"
                  value={stats.pendingApprovals}
                  color="#2980b9"
                />
              )}
              <StatCard
                icon="cube"
                title="Pending Dispatches"
                value={stats.pendingDispatches}
                color="#e67e22"
              />
              <StatCard
                icon="document-text"
                title="Recent Orders"
                value={stats.recentOrders}
                color="#27ae60"
              />
              <StatCard
                icon="people"
                title="Total Customers"
                value={stats.totalCustomers}
                color="#9b59b6"
              />
            </View>

            {/* Refresh button */}
            <TouchableOpacity
              style={{
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: isDark
                  ? "rgba(52, 152, 219, 0.1)"
                  : "rgba(52, 152, 219, 0.1)",
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginBottom: 15,
              }}
              onPress={() => {
                apiCache.set("dashboardStats", null);
                loadStats(true);
                showFeedback({
                  type: "info",
                  title: "Refreshing Data",
                  message: "Loading latest statistics...",
                  autoDismiss: true,
                });
              }}
            >
              <Ionicons
                name="refresh"
                size={14}
                color={isDark ? colors.primary : colors.primary}
                style={{ marginRight: 4 }}
              />
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.primary : colors.primary,
                }}
              >
                Refresh Stats
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Quick Actions</Text>

            {/* Render menu cards */}
            {renderMenuCards()}

            {/* Clear cache and logout buttons */}
            <TouchableOpacity
              style={[
                styles.logoutButton,
                {
                  backgroundColor: isDark
                    ? "rgba(52, 152, 219, 0.2)"
                    : "rgba(52, 152, 219, 0.1)",
                },
              ]}
              onPress={() => {
                apiCache.clear();
                showFeedback({
                  type: "success",
                  title: "Cache Cleared",
                  message: "App cache has been cleared. Pull down to refresh.",
                  autoDismiss: true,
                });
                onRefresh();
              }}
            >
              <Ionicons
                name="refresh-circle-outline"
                size={24}
                color={isDark ? "#3498db" : "#2980b9"}
              />
              <Text
                style={[
                  styles.logoutText,
                  { color: isDark ? "#3498db" : "#2980b9" },
                ]}
              >
                Clear Cache & Refresh
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Ionicons
                name="log-out-outline"
                size={24}
                color={isDark ? "#e74c3c" : "#c0392b"}
              />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </>
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={isDark ? colors.primary : colors.primary}
          />
        }
      />
    </View>
  );
}
