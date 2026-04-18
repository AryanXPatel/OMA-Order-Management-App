import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../context/ThemeContext";
import { useFeedback } from "../context/FeedbackContext";
import { apiCache, BACKEND_URL, fetchWithRetry } from "../utils/apiManager";
import LoadingIndicator from "../components/LoadingIndicator";
import { omaTypography } from "../utils/typography";

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

const ProductsScreen = () => {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
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

  const isWideLayout = width >= 420;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 260,
          backgroundColor: isDark
            ? "rgba(0,102,255,0.12)"
            : "rgba(15, 23, 42, 0.06)",
        },
        listContent: {
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 20) + 18,
        },
        headerShell: {
          paddingTop: insets.top + 8,
          paddingBottom: 8,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        },
        iconButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 22,
          elevation: 7,
        },
        headerMeta: {
          alignItems: "center",
          gap: 4,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        headerTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          letterSpacing: -0.8,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
        },
        introCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          marginBottom: 18,
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 9,
        },
        introGlow: {
          position: "absolute",
          top: -30,
          right: -24,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: isDark
            ? "rgba(0,102,255,0.12)"
            : "rgba(17,17,17,0.06)",
        },
        introRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        },
        introLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        },
        introChip: {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        introChipText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        introHeading: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          lineHeight: 28,
          letterSpacing: -0.7,
          marginBottom: 8,
          paddingRight: 32,
        },
        introBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          marginBottom: 18,
        },
        summaryGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
        },
        summaryCard: {
          width: isWideLayout ? "31%" : "48.4%",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderRadius: 20,
          padding: 14,
        },
        summaryValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          marginBottom: 4,
          letterSpacing: -0.6,
        },
        summaryLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          lineHeight: 15,
        },
        sectionLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 10,
          paddingHorizontal: 2,
        },
        searchRow: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 14,
        },
        searchShell: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 4,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 7,
        },
        searchInput: {
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          paddingVertical: 13,
          paddingHorizontal: 10,
        },
        sortPill: {
          minWidth: 112,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          justifyContent: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 7,
        },
        sortPillLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 10,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        sortPillValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        chipRow: {
          flexDirection: "row",
          gap: 10,
          paddingBottom: 6,
          marginBottom: 16,
        },
        chip: {
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        chipActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        chipText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        chipTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        productCard: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        productVisual: {
          width: 82,
          height: 92,
          borderRadius: 20,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginRight: 14,
          padding: 10,
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: colors.border,
        },
        visualBadge: {
          alignSelf: "flex-start",
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: isDark ? colors.text : "#111111",
        },
        visualBadgeText: {
          color: isDark ? colors.background : "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        },
        productBody: {
          flex: 1,
          justifyContent: "center",
        },
        codeRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          marginBottom: 6,
        },
        productCode: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
        productName: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 15,
          lineHeight: 20,
          marginBottom: 10,
        },
        productMetaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        },
        metaTag: {
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        metaTagText: {
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 11,
        },
        priceRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        priceValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 17,
          letterSpacing: -0.5,
        },
        priceLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginTop: 3,
        },
        arrowWrap: {
          marginLeft: 12,
          alignItems: "center",
          justifyContent: "center",
        },
        emptyState: {
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
    [colors, insets.bottom, insets.top, isDark, isWideLayout]
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
      { label: "Visible SKUs", value: `${filteredProducts.length}` },
      { label: "Categories", value: `${Math.max(categories.length - 1, 0)}` },
      {
        label: "Customer-linked",
        value: `${filteredProducts.filter((item) => item["Customer NAME"]).length}`,
      },
    ],
    [categories.length, filteredProducts]
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

  const cycleSort = useCallback(() => {
    const currentIndex = sortOptions.findIndex((option) => option.field === sortBy);
    if (currentIndex === -1 || currentIndex === sortOptions.length - 1) {
      setSortBy(sortOptions[0].field);
      setSortDirection((current) =>
        currentIndex === sortOptions.length - 1
          ? current === "asc"
            ? "desc"
            : "asc"
          : "asc"
      );
      return;
    }

    setSortBy(sortOptions[currentIndex + 1].field);
    setSortDirection("asc");
  }, [sortBy, sortOptions]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    apiCache.set("products", null);
    void loadProducts();
  }, [loadProducts]);

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
          <View style={styles.productVisual}>
            <View style={styles.visualBadge}>
              <Text style={styles.visualBadgeText}>{categoryLabel}</Text>
            </View>

            <View>
              <Ionicons color={colors.text} name="cube-outline" size={22} />
              <Text numberOfLines={1} style={styles.productCode}>
                {item["Product CODE"] || "NO-CODE"}
              </Text>
            </View>
          </View>

          <View style={styles.productBody}>
            <View style={styles.codeRow}>
              <Ionicons
                color={colors.textSecondary}
                name="barcode-outline"
                size={12}
              />
              <Text style={styles.productCode}>{item["Product CODE"]}</Text>
            </View>

            <Text numberOfLines={2} style={styles.productName}>
              {item["Product NAME"] || "Unnamed product"}
            </Text>

            <View style={styles.productMetaRow}>
              <View style={styles.metaTag}>
                <Text style={styles.metaTagText}>{categoryLabel}</Text>
              </View>

              {customerLabel ? (
                <View style={styles.metaTag}>
                  <Text numberOfLines={1} style={styles.metaTagText}>
                    {customerLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceValue}>
                  {formatIndianCurrency(item.Rate || "0")}
                </Text>
                <Text style={styles.priceLabel}>Base rate from product master</Text>
              </View>
            </View>
          </View>

          <View style={styles.arrowWrap}>
            <Ionicons
              color={colors.textSecondary}
              name="chevron-forward"
              size={18}
            />
          </View>
        </TouchableOpacity>
      );
    },
    [colors.text, colors.textSecondary, openProductDetails, styles]
  );

  const headerComponent = (
    <View style={styles.headerShell}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons color={colors.text} name="arrow-back" size={18} />
        </TouchableOpacity>

        <View style={styles.headerMeta}>
          <Text style={styles.eyebrow}>OMA Product Flow</Text>
          <Text style={styles.headerTitle}>Product Catalog</Text>
          <Text style={styles.headerSubtitle}>
            Live catalog search, filters, and detail browse
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleTheme}
          style={styles.iconButton}
        >
          <Ionicons
            color={colors.text}
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={18}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.introCard}>
        <View style={styles.introGlow} />

        <View style={styles.introRow}>
          <Text style={styles.introLabel}>Catalog snapshot</Text>
          <View style={styles.introChip}>
            <Text style={styles.introChipText}>
              {filteredProducts.length} showing
            </Text>
          </View>
        </View>

        <Text style={styles.introHeading}>
          Browse product master data with a stronger catalog rhythm.
        </Text>
        <Text style={styles.introBody}>
          The prototype language is carried into mobile cards and detail views,
          while search, category filtering, and sort behavior still come straight
          from the live Expo app.
        </Text>

        <View style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <View key={card.label} style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{card.value}</Text>
              <Text style={styles.summaryLabel}>{card.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionLabel}>Search</Text>
      <View style={styles.searchRow}>
        <View style={styles.searchShell}>
          <Ionicons color={colors.textSecondary} name="search-outline" size={18} />

          <TextInput
            onChangeText={setSearchQuery}
            placeholder="Search SKU, name, customer, or category..."
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
          onPress={cycleSort}
          style={styles.sortPill}
        >
          <Text style={styles.sortPillLabel}>Sort</Text>
          <Text style={styles.sortPillValue}>
            {sortOptions.find((option) => option.field === sortBy)?.label}
            {sortDirection === "asc" ? " ↑" : " ↓"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Categories</Text>
      <ScrollView
        contentContainerStyle={styles.chipRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {categories.map((category) => {
          const active = selectedCategory === category;
          return (
            <TouchableOpacity
              key={category}
              activeOpacity={0.88}
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
