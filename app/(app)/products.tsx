import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Filter, RefreshCw } from "lucide-react-native";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { useFeedback } from "@/context/FeedbackContext";
import { apiCache, BACKEND_URL, fetchWithRetry } from "@/utils/apiManager";
import LoadingIndicator from "@/components/LoadingIndicator";
import { FLOATING_NAV_SPACE } from "@/components/oma/OmaFloatingNav";
import { omaTypography } from "@/utils/typography";

type ProductRecord = {
  "Product CODE": string;
  "Product NAME": string;
  "Rate": string;
  "Product Group Name"?: string;
  "Customer CODE"?: string;
  "Customer NAME"?: string;
  Category: string;
  [key: string]: string | undefined;
};

type ProductSortField = "name" | "code" | "category" | "rate";
type SortDirection = "asc" | "desc";
type ProductDetailTab = "overview" | "customer" | "pricing";

const formatIndianCurrency = (value: string | number) => {
  const parsed = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  if (Number.isNaN(parsed)) {
    return "₹0.00";
  }

  try {
    const [whole, decimal] = parsed.toFixed(2).split(".");
    const lastThree = whole.slice(-3);
    const otherNumbers = whole.slice(0, -3);
    const grouped =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") +
      (otherNumbers ? "," : "") +
      lastThree;
    return `₹${grouped}.${decimal}`;
  } catch {
    return "₹0.00";
  }
};

const compactChipHitSlop = { top: 4, bottom: 4, left: 2, right: 2 };

const ProductsScreen = () => {
  const { colors, isDark } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProductSortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(
    null
  );
  const [detailTab, setDetailTab] = useState<ProductDetailTab>("overview");

  const contentWidth = Math.min(width - 40, 374);
  const isWideLayout = width >= 560;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: "#101011",
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 180,
          backgroundColor: "rgba(255,255,255,0.015)",
        },
        listContent: {
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20) + FLOATING_NAV_SPACE + 24,
          alignItems: "center",
        },
        headerShell: {
          width: contentWidth,
          paddingTop: insets.top + 10,
          paddingBottom: 6,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        },
        headerTitleCluster: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        headerBackButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#1C1C1E",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          alignItems: "center",
          justifyContent: "center",
        },
        headerActionButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: "#F5F5F7",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#FFFFFF",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 15,
          elevation: 6,
        },
        iconButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#2A2A2C",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.28,
          shadowRadius: 24,
          elevation: 6,
        },
        headerTitle: {
          color: "#F5F5F7",
          fontFamily: omaTypography.bold,
          fontSize: 28,
          lineHeight: 34,
          letterSpacing: -0.8,
        },
        summaryGrid: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 24,
        },
        summaryCard: {
          flex: 1,
          minHeight: 78,
          backgroundColor: "#1C1C1E",
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          justifyContent: "center",
          overflow: "hidden",
        },
        summaryCardAccent: {
          backgroundColor: "rgba(96,165,250,0.07)",
          borderColor: "rgba(96,165,250,0.14)",
        },
        summaryAccentRail: {
          position: "absolute",
          left: 0,
          top: 14,
          bottom: 14,
          width: 3,
          borderRadius: 999,
          backgroundColor: "#EAB308",
        },
        summaryAccentRailBlue: {
          backgroundColor: "#60A5FA",
        },
        summaryValue: {
          color: "#FFFFFF",
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          lineHeight: 27,
          letterSpacing: -0.8,
        },
        summaryValueAccent: {
          color: "#93C5FD",
        },
        summaryLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 1.1,
          marginBottom: 7,
          textTransform: "uppercase",
        },
        summaryLabelAccent: {
          color: "#93C5FD",
        },
        searchRow: {
          flexDirection: "row",
          gap: 8,
          marginBottom: 18,
        },
        searchShell: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#1C1C1E",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          paddingHorizontal: 14,
          paddingVertical: 4,
          minHeight: 52,
        },
        searchInput: {
          flex: 1,
          color: "#F5F5F7",
          fontFamily: omaTypography.medium,
          fontSize: 16,
          paddingVertical: 11,
          paddingHorizontal: 10,
          letterSpacing: -0.35,
        },
        filterButton: {
          width: 52,
          height: 52,
          flexShrink: 0,
          backgroundColor: "#1C1C1E",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          alignItems: "center",
          justifyContent: "center",
        },
        categoryRail: {
          flexDirection: "row",
          gap: 8,
          paddingBottom: 14,
          marginBottom: 2,
        },
        chip: {
          minHeight: 36,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: "#1C1C1E",
          borderWidth: 1,
          borderColor: "transparent",
        },
        chipActive: {
          backgroundColor: "#F5F5F7",
          borderColor: "#F5F5F7",
        },
        chipText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          letterSpacing: -0.2,
        },
        chipTextActive: {
          color: "#101011",
        },
        sortRail: {
          alignItems: "flex-start",
          marginBottom: 14,
        },
        sortRailMeta: {
          color: "#8E8E93",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          letterSpacing: -0.15,
          marginBottom: 8,
        },
        sortChipRow: {
          flexDirection: "row",
          gap: 7,
        },
        sortChip: {
          minHeight: 30,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: "#1C1C1E",
        },
        sortChipActive: {
          backgroundColor: "#2C2C2E",
        },
        sortChipText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        sortChipTextActive: {
          color: "#FFFFFF",
        },
        productCard: {
          width: contentWidth,
          backgroundColor: "#1C1C1E",
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.02)",
          padding: 16,
          marginBottom: 12,
          overflow: "hidden",
        },
        productCardTop: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        },
        productTitleWrap: {
          flex: 1,
          minWidth: 0,
        },
        productBottomRow: {
          flexDirection: "row",
          alignItems: "center",
        },
        productStatusRow: {
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          flex: 1,
        },
        productCode: {
          color: "#8E8E93",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          letterSpacing: -0.25,
          textTransform: "uppercase",
        },
        productName: {
          color: "#FFFFFF",
          fontFamily: omaTypography.bold,
          fontSize: 17,
          lineHeight: 20,
          letterSpacing: -0.45,
          marginBottom: 4,
        },
        metaTag: {
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
          backgroundColor: "#242426",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
        },
        metaTagCustomer: {
          maxWidth: contentWidth - 32,
        },
        metaTagText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          letterSpacing: -0.15,
        },
        priceValue: {
          color: "#FFFFFF",
          fontFamily: omaTypography.bold,
          fontSize: 16,
          lineHeight: 20,
          letterSpacing: -0.5,
          textAlign: "right",
          maxWidth: 112,
        },
        emptyState: {
          width: contentWidth,
          alignItems: "center",
          paddingVertical: 56,
          paddingHorizontal: 20,
        },
        emptyTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          marginTop: 14,
          marginBottom: 6,
        },
        emptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          textAlign: "center",
          lineHeight: 19,
        },
        detailScreen: {
          flex: 1,
          backgroundColor: colors.background,
        },
        detailHeader: {
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 16,
        },
        detailHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        },
        detailHeaderInfo: {
          flex: 1,
          paddingHorizontal: 14,
        },
        detailHeaderTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          letterSpacing: -0.8,
        },
        detailHeaderCode: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginTop: 4,
        },
        detailHero: {
          borderRadius: 30,
          backgroundColor: isDark ? colors.surfaceVariant : "#111111",
          overflow: "hidden",
        },
        detailVisual: {
          height: 220,
          padding: 18,
          justifyContent: "space-between",
        },
        detailVisualGlow: {
          position: "absolute",
          top: -32,
          right: -24,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        detailVisualTagRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        },
        detailVisualIcon: {
          width: 64,
          height: 64,
          borderRadius: 22,
          backgroundColor: "rgba(255,255,255,0.1)",
          alignItems: "center",
          justifyContent: "center",
        },
        detailStatusPill: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 7,
          backgroundColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.18)",
        },
        detailStatusText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        detailTitleCard: {
          marginHorizontal: 16,
          marginTop: -34,
          marginBottom: 12,
          borderRadius: 24,
          padding: 16,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        detailTitleRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        },
        detailName: {
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 19,
          lineHeight: 24,
          letterSpacing: -0.6,
        },
        detailPrice: {
          color: colors.primary,
          fontFamily: omaTypography.extrabold,
          fontSize: 20,
          letterSpacing: -0.6,
        },
        detailSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginTop: 8,
          lineHeight: 18,
        },
        detailTagWrap: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 14,
        },
        detailTag: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 7,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        detailTagText: {
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        tabRow: {
          flexDirection: "row",
          gap: 10,
          paddingHorizontal: 16,
          marginBottom: 12,
        },
        tabButton: {
          flex: 1,
          borderRadius: 18,
          paddingVertical: 12,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
        },
        tabButtonActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        tabButtonText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        tabButtonTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        detailScrollContent: {
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 24) + 28,
        },
        detailSectionCard: {
          backgroundColor: colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
        },
        detailSectionTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          marginBottom: 14,
        },
        detailStatsGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
        },
        detailStatCard: {
          width: isWideLayout ? "48%" : "100%",
          borderRadius: 18,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        detailStatLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 6,
        },
        detailStatValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          letterSpacing: -0.5,
        },
        detailStatValueSmall: {
          fontSize: 14,
          lineHeight: 20,
        },
        infoCard: {
          borderRadius: 18,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        infoCardText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 20,
        },
        pricingHero: {
          borderRadius: 24,
          padding: 18,
          backgroundColor: isDark ? colors.surfaceVariant : "#111111",
        },
        pricingHeroLabel: {
          color: isDark ? colors.textSecondary : "rgba(255,255,255,0.68)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          marginBottom: 8,
          letterSpacing: 0.7,
        },
        pricingHeroValue: {
          color: isDark ? colors.text : "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 32,
          lineHeight: 36,
          letterSpacing: -1,
          marginBottom: 8,
        },
        pricingHeroBody: {
          color: isDark ? colors.textSecondary : "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
        },
      }),
    [colors, contentWidth, insets.bottom, insets.top, isDark, isWideLayout]
  );

  const extractCategories = useCallback((catalog: ProductRecord[]) => {
    const nextCategories = new Set<string>(["All"]);
    catalog.forEach((product) => {
      const category = product.Category?.trim();
      if (category) {
        nextCategories.add(category);
      }
    });
    setCategories(Array.from(nextCategories));
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const cachedProducts = apiCache.get("products") as ProductRecord[] | null;
      if (cachedProducts?.length) {
        setProducts(cachedProducts);
        extractCategories(cachedProducts);
        setLoading(false);
      }

      setLoading((current) => (cachedProducts?.length ? current : true));

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Product_Master!A1:F`,
        {},
        3,
        2000
      );

      if (!response.data?.values) {
        throw new Error("Invalid response from Product Master API");
      }

      const [headerRow, ...productRows] = response.data.values as string[][];
      const nextProducts = productRows.map((row) => {
        const product = headerRow.reduce<Record<string, string>>(
          (record, key, index) => {
            record[key] = row[index] || "";
            return record;
          },
          {}
        );

        return {
          ...product,
          Category: product["Product Group Name"] || "",
        } as ProductRecord;
      });

      setProducts(nextProducts);
      extractCategories(nextProducts);
      apiCache.set("products", nextProducts);
    } catch {
      showFeedback({
        type: "error",
        title: "Product Load Error",
        message: "Failed to load product data. Pull to refresh and try again.",
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [extractCategories, showFeedback]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    let nextProducts = [...products];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (normalizedQuery) {
      nextProducts = nextProducts.filter((product) => {
        const name = product["Product NAME"]?.toLowerCase() || "";
        const code = product["Product CODE"]?.toLowerCase() || "";
        const category = product.Category?.toLowerCase() || "";
        const customerCode = product["Customer CODE"]?.toLowerCase() || "";
        const customerName = product["Customer NAME"]?.toLowerCase() || "";

        return (
          name.includes(normalizedQuery) ||
          code.includes(normalizedQuery) ||
          category.includes(normalizedQuery) ||
          customerCode.includes(normalizedQuery) ||
          customerName.includes(normalizedQuery)
        );
      });
    }

    if (selectedCategory !== "All") {
      nextProducts = nextProducts.filter(
        (product) => product.Category === selectedCategory
      );
    }

    nextProducts.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = (a["Product NAME"] || "").localeCompare(
            b["Product NAME"] || ""
          );
          break;
        case "code":
          comparison = (a["Product CODE"] || "").localeCompare(
            b["Product CODE"] || ""
          );
          break;
        case "category":
          comparison = (a.Category || "").localeCompare(b.Category || "");
          break;
        case "rate":
          comparison =
            Number.parseFloat(a.Rate || "0") - Number.parseFloat(b.Rate || "0");
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return nextProducts;
  }, [products, searchQuery, selectedCategory, sortBy, sortDirection]);

  const summaryCards = useMemo(
    () => [
      { label: "Visible", value: `${filteredProducts.length}` },
      { label: "Categories", value: `${Math.max(categories.length - 1, 0)}` },
    ],
    [categories.length, filteredProducts.length]
  );

  const sortOptions = useMemo<{ field: ProductSortField; label: string }[]>(
    () => [
      { field: "name", label: "Name" },
      { field: "code", label: "Code" },
      { field: "category", label: "Category" },
      { field: "rate", label: "Price" },
    ],
    []
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    apiCache.set("products", null);
    void loadProducts();
  }, [loadProducts]);

  const resetCatalogControls = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("All");
    setSortBy("name");
    setSortDirection("asc");
  }, []);

  const openProductDetails = useCallback((product: ProductRecord) => {
    setDetailTab("overview");
    setSelectedProduct(product);
  }, []);

  const renderProductCard = useCallback(
    ({ item }: { item: ProductRecord }) => {
      const categoryLabel = item.Category || "Uncategorized";
      const customerLabel = item["Customer NAME"] || item["Customer CODE"] || "";

      return (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => openProductDetails(item)}
          style={styles.productCard}
        >
          <View style={styles.productCardTop}>
            <View style={styles.productTitleWrap}>
              <Text numberOfLines={2} style={styles.productName}>
                {item["Product NAME"] || "Unnamed product"}
              </Text>
              <Text numberOfLines={1} style={styles.productCode}>
                SKU: {item["Product CODE"] || "NO-CODE"}
              </Text>
            </View>

            <Text style={styles.priceValue}>
              {formatIndianCurrency(item.Rate || "0")}
            </Text>
          </View>

          <View style={styles.productBottomRow}>
            <View style={styles.productStatusRow}>
              <View style={styles.metaTag}>
                <Text numberOfLines={1} style={styles.metaTagText}>
                  {categoryLabel}
                </Text>
              </View>

              {customerLabel ? (
                <View style={[styles.metaTag, styles.metaTagCustomer]}>
                  <Text numberOfLines={1} style={styles.metaTagText}>
                    {customerLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [openProductDetails, styles]
  );

  const activeSortLabel =
    sortOptions.find((option) => option.field === sortBy)?.label || "Name";
  const activeSortDirection = sortDirection === "asc" ? "ascending" : "descending";
  const linkedProductCount = filteredProducts.filter(
    (item) => item["Customer NAME"] || item["Customer CODE"]
  ).length;

  const headerComponent = (
    <View style={styles.headerShell}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCluster}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={styles.headerBackButton}
          >
            <Ionicons color="#F5F5F7" name="arrow-back" size={18} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Products</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleRefresh}
          style={styles.headerActionButton}
        >
          {refreshing ? (
            <ActivityIndicator color="#101011" size="small" />
          ) : (
            <RefreshCw color="#101011" size={19} strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.summaryGrid}>
        {summaryCards.map((card, index) => (
          <View
            key={card.label}
            style={[styles.summaryCard, index === 1 && styles.summaryCardAccent]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.summaryAccentRail,
                index === 1 && styles.summaryAccentRailBlue,
              ]}
            />
            <Text
              style={[
                styles.summaryLabel,
                index === 1 && styles.summaryLabelAccent,
              ]}
            >
              {card.label}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                index === 1 && styles.summaryValueAccent,
              ]}
            >
              {card.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchShell}>
          <Ionicons color={colors.textSecondary} name="search-outline" size={18} />

          <TextInput
            onChangeText={setSearchQuery}
            placeholder="Search SKUs, names..."
            placeholderTextColor={colors.textPlaceholder}
            style={styles.searchInput}
            value={searchQuery}
          />

          {searchQuery ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setSearchQuery("")}>
              <Ionicons
                color={colors.textSecondary}
                name="close-circle"
                size={18}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={resetCatalogControls}
          style={styles.filterButton}
        >
          <Filter color="#A1A1AA" size={20} strokeWidth={2.25} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.categoryRail}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {categories.map((category) => {
          const active = selectedCategory === category;

          return (
            <TouchableOpacity
              key={category}
              activeOpacity={0.88}
              hitSlop={compactChipHitSlop}
              onPress={() => setSelectedCategory(category)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {category}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.sortRail}>
        <Text style={styles.sortRailMeta}>
          {linkedProductCount} linked · {activeSortLabel} {activeSortDirection}
        </Text>

        <ScrollView
          contentContainerStyle={styles.sortChipRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {sortOptions.map((option) => {
            const active = sortBy === option.field;
            return (
              <TouchableOpacity
                key={option.field}
                activeOpacity={0.9}
                hitSlop={compactChipHitSlop}
                onPress={() => {
                  if (sortBy === option.field) {
                    setSortDirection((current) =>
                      current === "asc" ? "desc" : "asc"
                    );
                  } else {
                    setSortBy(option.field);
                    setSortDirection(
                      option.field === "name" ? "asc" : "desc"
                    );
                  }
                }}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    active && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                  {active
                    ? sortDirection === "asc"
                      ? " ↑"
                      : " ↓"
                    : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      {loading ? (
        <LoadingIndicator message="Loading products..." showTips={true} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredProducts}
          keyExtractor={(item) => item["Product CODE"] || item["Product NAME"] || ""}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                color={colors.textPlaceholder}
                name="cube-outline"
                size={54}
              />
              <Text style={styles.emptyTitle}>No matching products</Text>
              <Text style={styles.emptyBody}>
                Try a different SKU, product name, customer code, or category.
              </Text>
            </View>
          }
          ListHeaderComponent={headerComponent}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          }
          renderItem={renderProductCard}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
        visible={Boolean(selectedProduct)}
      >
        {selectedProduct ? (
          <View style={styles.detailScreen}>
            <View style={styles.topGlow} />

            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedProduct(null)}
                  style={styles.iconButton}
                >
                  <Ionicons color={colors.text} name="arrow-back" size={18} />
                </TouchableOpacity>

                <View style={styles.detailHeaderInfo}>
                  <Text numberOfLines={1} style={styles.detailHeaderTitle}>
                    {selectedProduct["Product NAME"] || "Product detail"}
                  </Text>
                  <Text style={styles.detailHeaderCode}>
                    {selectedProduct["Product CODE"] || "No product code"}
                  </Text>
                </View>

                <View style={styles.iconButton}>
                  <Ionicons color={colors.primary} name="cube-outline" size={18} />
                </View>
              </View>

              <View style={styles.detailHero}>
                <View style={styles.detailVisual}>
                  <View style={styles.detailVisualGlow} />

                  <View style={styles.detailVisualTagRow}>
                    <View style={styles.detailVisualIcon}>
                      <Ionicons color="#ffffff" name="cube-outline" size={28} />
                    </View>

                    <View style={styles.detailStatusPill}>
                      <Text style={styles.detailStatusText}>
                        {selectedProduct.Category || "Catalog"}
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    color="rgba(255,255,255,0.7)"
                    name="scan-outline"
                    size={18}
                  />
                </View>

                <View style={styles.detailTitleCard}>
                  <View style={styles.detailTitleRow}>
                    <Text numberOfLines={3} style={styles.detailName}>
                      {selectedProduct["Product NAME"] || "Unnamed product"}
                    </Text>
                    <Text style={styles.detailPrice}>
                      {formatIndianCurrency(selectedProduct.Rate || "0")}
                    </Text>
                  </View>

                  <Text style={styles.detailSubtitle}>
                    Product master pricing and account linkage, styled closer to the
                    prototype while still driven by the live Expo catalog feed.
                  </Text>

                  <View style={styles.detailTagWrap}>
                    <View style={styles.detailTag}>
                      <Text style={styles.detailTagText}>
                        {selectedProduct.Category || "Uncategorized"}
                      </Text>
                    </View>
                    {selectedProduct["Customer NAME"] ? (
                      <View style={styles.detailTag}>
                        <Text style={styles.detailTagText}>
                          {selectedProduct["Customer NAME"]}
                        </Text>
                      </View>
                    ) : null}
                    {selectedProduct["Customer CODE"] ? (
                      <View style={styles.detailTag}>
                        <Text style={styles.detailTagText}>
                          {selectedProduct["Customer CODE"]}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.tabRow}>
              {[
                { id: "overview", label: "Overview" },
                { id: "customer", label: "Customer" },
                { id: "pricing", label: "Pricing" },
              ].map((tab) => {
                const active = detailTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.88}
                    onPress={() => setDetailTab(tab.id as ProductDetailTab)}
                    style={[styles.tabButton, active && styles.tabButtonActive]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        active && styles.tabButtonTextActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              contentContainerStyle={styles.detailScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {detailTab === "overview" ? (
                <>
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Catalog attributes</Text>

                    <View style={styles.detailStatsGrid}>
                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Product code</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedProduct["Product CODE"] || "Not available"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Category</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedProduct.Category || "Uncategorized"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer code</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedProduct["Customer CODE"] || "Shared catalog item"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer name</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedProduct["Customer NAME"] || "No account mapping"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Context</Text>
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardText}>
                        This screen intentionally stays tied to the real product
                        master columns. The prototype structure is used for rhythm,
                        hierarchy, and detail presentation, not for invented stock
                        or warehouse fields.
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}

              {detailTab === "customer" ? (
                <View style={styles.detailSectionCard}>
                  <Text style={styles.detailSectionTitle}>Account mapping</Text>
                  {selectedProduct["Customer NAME"] || selectedProduct["Customer CODE"] ? (
                    <View style={styles.detailStatsGrid}>
                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer name</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedProduct["Customer NAME"] || "Not available"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer code</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedProduct["Customer CODE"] || "Not available"}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardText}>
                        This SKU does not currently carry a customer-specific mapping
                        in the live product master.
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {detailTab === "pricing" ? (
                <>
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Base rate</Text>
                    <View style={styles.pricingHero}>
                      <Text style={styles.pricingHeroLabel}>Live product master</Text>
                      <Text style={styles.pricingHeroValue}>
                        {formatIndianCurrency(selectedProduct.Rate || "0")}
                      </Text>
                      <Text style={styles.pricingHeroBody}>
                        This is the current rate carried into the app’s browsing and
                        selection flow. No local pricing logic was changed in this
                        UI port.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Pricing note</Text>
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardText}>
                        Sorting by price, browsing by category, and searching by SKU
                        or customer stay attached to the same live data source used
                        before this redesign.
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
};

export default ProductsScreen;


