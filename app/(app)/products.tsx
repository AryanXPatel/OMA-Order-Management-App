import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { useFeedback } from "../context/FeedbackContext";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StatusBar,
  RefreshControl,
  Image,
} from "react-native";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import LoadingIndicator from "../components/LoadingIndicator";
import { scale, moderateScale, isTablet } from "../utils/responsive";
import { useWindowDimensions } from "react-native";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

const ProductsScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const { showFeedback } = useFeedback();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: isDark ? colors.background : "#f4f4f8",
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
        searchContainer: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "white",
          paddingHorizontal: 15,
          borderRadius: 20,
          marginHorizontal: 15,
          marginVertical: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 2,
          elevation: 2,
        },
        searchInput: {
          flex: 1,
          paddingVertical: 12,
          paddingHorizontal: 8,
          color: isDark ? colors.text : "#333",
          fontSize: 15,
        },
        controlsContainer: {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 15,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
          marginBottom: 5,
        },
        viewToggle: {
          flexDirection: "row",
          alignItems: "center",
        },
        viewToggleButton: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 15,
          marginRight: 5,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
        },
        activeViewToggle: {
          backgroundColor: isDark ? colors.primary : colors.primary,
        },
        sortButton: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 15,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
        },
        sortText: {
          fontSize: 13,
          marginRight: 4,
          color: isDark ? colors.textSecondary : "#666",
        },
        activeSortText: {
          color: isDark ? colors.primary : colors.primary,
        },
        categoriesContainer: {
          marginVertical: 5,
          paddingHorizontal: 10,
        },
        categoryScroll: {
          paddingVertical: 5,
          paddingHorizontal: 5,
        },
        categoryChip: {
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 20,
          marginHorizontal: 5,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
        },
        activeCategoryChip: {
          backgroundColor: isDark ? colors.primary : colors.primary,
        },
        categoryText: {
          fontSize: 13,
          color: isDark ? colors.textSecondary : "#555",
        },
        activeCategoryText: {
          color: "white",
        },
        listItem: {
          flexDirection: "row",
          backgroundColor: isDark ? colors.surfaceVariant : "white",
          borderRadius: 10,
          padding: 15,
          marginHorizontal: 15,
          marginBottom: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.1,
          shadowRadius: 2,
          elevation: 1,
        },
        productInfo: {
          flex: 1,
        },
        productName: {
          fontSize: 16,
          fontWeight: "600",
          color: isDark ? colors.text : "#222",
          marginBottom: 4,
        },
        productCode: {
          fontSize: 13,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 2,
        },
        productCategory: {
          fontSize: 13,
          color: isDark ? colors.textSecondary : "#666",
          marginBottom: 5,
        },
        rateContainer: {
          justifyContent: "center",
          alignItems: "flex-end",
          paddingLeft: 10,
        },
        productRate: {
          fontSize: 17,
          fontWeight: "700",
          color: isDark ? colors.success : colors.success,
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
        iconStyle: {
          color: isDark ? colors.text : "#FFF",
        },
      }),
    [isDark, colors]
  );

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState(["All"]);

  // Memoize sort options to prevent recreating on every render
  const sortOptions = useMemo(
    () => [
      { field: "name", label: "Name" },
      { field: "code", label: "Code" },
      { field: "category", label: "Category" },
      { field: "rate", label: "Price" },
    ],
    []
  );

  useEffect(() => {
    loadProducts();
  }, []);

  // Filter and sort products - memoized to prevent unnecessary recalculations
  useEffect(() => {
    const filterAndSortProducts = () => {
      // Use a local variable to avoid multiple spread operations
      let result = [...products];

      // Apply search filter with improved matching
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        result = result.filter(
          (product) =>
            product["Product NAME"]?.toLowerCase().includes(query) ||
            product["Product CODE"]?.toLowerCase().includes(query) ||
            product["Category"]?.toLowerCase().includes(query) ||
            product["Customer CODE"]?.toLowerCase().includes(query) || // Add customer code search
            product["Customer NAME"]?.toLowerCase().includes(query) // Add customer name search
        );
      }

      // Apply category filter
      if (selectedCategory && selectedCategory !== "All") {
        result = result.filter(
          (product) => product["Category"] === selectedCategory
        );
      }

      // Apply sorting
      result.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case "name":
            comparison = a["Product NAME"].localeCompare(b["Product NAME"]);
            break;
          case "code":
            comparison = a["Product CODE"].localeCompare(b["Product CODE"]);
            break;
          case "rate":
            const rateA = parseFloat(a["Rate"] || 0);
            const rateB = parseFloat(b["Rate"] || 0);
            comparison = rateA - rateB;
            break;
          case "category":
            comparison = (a["Category"] || "").localeCompare(
              b["Category"] || ""
            );
            break;
          default:
            comparison = 0;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });

      setFilteredProducts(result);
    };

    filterAndSortProducts();
  }, [products, searchQuery, sortBy, sortDirection, selectedCategory]);

  // Load products with memoization to prevent recreation on every render
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);

      // Check cache first for immediate display
      const cachedProducts = apiCache.get("products");
      if (cachedProducts) {
        setProducts(cachedProducts);
        extractCategories(cachedProducts);
        setLoading(false);
      }

      // Fetch fresh data
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Product_Master!A1:F`,
        {},
        3,
        2000
      );

      if (response.data && response.data.values) {
        const header = response.data.values[0];
        const productsData = response.data.values.slice(1);

        // Map data more efficiently with reduced allocations
        const formattedProducts = productsData.map((row) => {
          const product = {};
          for (let i = 0; i < header.length; i++) {
            product[header[i]] = row[i] || "";
          }

          // Add the Product Group Name as Category
          product["Category"] = product["Product Group Name"] || "";

          return product;
        });

        setProducts(formattedProducts);
        apiCache.set("products", formattedProducts);
        extractCategories(formattedProducts);
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Product Load Error",
        message: "Failed to load product data. Please try refreshing.",
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFeedback]);

  // Extract categories more efficiently
  const extractCategories = useCallback((products) => {
    // Extract unique categories from products using Set for deduplication
    const uniqueCategories = new Set(["All"]);

    products.forEach((product) => {
      if (product["Category"] && product["Category"].trim()) {
        uniqueCategories.add(product["Category"].trim());
      }
    });

    setCategories(Array.from(uniqueCategories));
  }, []);

  // Handle refresh with memoization
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    apiCache.set("products", null); // Clear cache to force refresh
    loadProducts();
  }, [loadProducts]);

  // Format currency with memoization
  const formatIndianCurrency = useCallback((value) => {
    try {
      const num = parseFloat(value);
      if (isNaN(num)) return "₹0.00";

      const parts = num.toFixed(2).split(".");
      const lastThree = parts[0].substring(parts[0].length - 3);
      const otherNumbers = parts[0].substring(0, parts[0].length - 3);
      const formatted =
        otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") +
        (otherNumbers ? "," : "") +
        lastThree;
      return `₹${formatted}.${parts[1]}`;
    } catch (error) {
      return "₹0.00";
    }
  }, []);

  // Cycle sort with memoization
  const cycleSort = useCallback(() => {
    const currentIndex = sortOptions.findIndex(
      (option) => option.field === sortBy
    );
    // If we're on the last option or not found
    if (currentIndex === -1 || currentIndex === sortOptions.length - 1) {
      // Go to first option and toggle direction if we were on the last
      setSortBy(sortOptions[0].field);
      if (currentIndex === sortOptions.length - 1) {
        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      } else {
        setSortDirection("asc");
      }
    } else {
      // Move to next option
      setSortBy(sortOptions[currentIndex + 1].field);
      setSortDirection("asc");
    }
  }, [sortBy, sortDirection, sortOptions]);

  // Memoize the empty state renderer
  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="cube-outline"
          size={60}
          color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
        />
        <Text style={styles.emptyText}>
          {searchQuery ? "No products match your search" : "No products found"}
        </Text>
      </View>
    ),
    [isDark, searchQuery, styles]
  );

  // Extract product item rendering for better performance
  const renderProductItem = useCallback(
    ({ item }) => (
      <TouchableOpacity style={styles.listItem}>
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{item["Product NAME"]}</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Text style={styles.productCode}>Code: {item["Product CODE"]}</Text>
            {item["Category"] && (
              <View
                style={{
                  marginLeft: 8,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: isDark
                    ? "rgba(52, 152, 219, 0.2)"
                    : "rgba(52, 152, 219, 0.1)",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? "#3498db" : "#2980b9",
                  }}
                >
                  {item["Category"]}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.rateContainer}>
          <Text style={styles.productRate}>
            {formatIndianCurrency(item["Rate"])}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [isDark, formatIndianCurrency, styles]
  );

  // Memoize the category item renderer
  const renderCategoryItem = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={[
          styles.categoryChip,
          selectedCategory === item && styles.activeCategoryChip,
        ]}
        onPress={() => setSelectedCategory(item)}
      >
        <Text
          style={[
            styles.categoryText,
            selectedCategory === item && styles.activeCategoryText,
          ]}
        >
          {item}
        </Text>
      </TouchableOpacity>
    ),
    [selectedCategory, styles]
  );

  // Memoize styles to prevent recreation on every render

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Products</Text>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            style={styles.iconStyle}
          />
        </TouchableOpacity>
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
          placeholder="Search name, code, customer or category"
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

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.sortButton} onPress={cycleSort}>
          <Text style={[styles.sortText, styles.activeSortText]}>
            Sort:{" "}
            {sortOptions.find((option) => option.field === sortBy)?.label ||
              "Name"}
            {sortBy === "rate"
              ? sortDirection === "asc"
                ? " (Low-High)"
                : " (High-Low)"
              : sortDirection === "asc"
              ? " (A-Z)"
              : " (Z-A)"}
          </Text>
          <Ionicons
            name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
            size={14}
            color={isDark ? colors.primary : colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <View style={{ height: 50, marginVertical: 4 }}>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoryScroll}
          renderItem={renderCategoryItem}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
        />
      </View>

      {/* Products List */}
      {loading ? (
        <LoadingIndicator message="Loading products..." showTips={true} />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item["Product CODE"]}
          renderItem={renderProductItem}
          contentContainerStyle={{ paddingVertical: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={renderEmpty}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          getItemLayout={(data, index) => ({
            length: 70, // Approximate height of each item
            offset: 70 * index,
            index,
          })}
        />
      )}
    </View>
  );
};

export default ProductsScreen;
