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
  Linking,
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
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { ThemeContext } from "@/context/ThemeContext";
import { useFeedback } from "@/context/FeedbackContext";
import { apiCache, BACKEND_URL, fetchWithRetry } from "@/utils/apiManager";
import LoadingIndicator from "@/components/LoadingIndicator";
import { omaTypography } from "@/utils/typography";

type ContactInfo = {
  number: string;
  label: string;
};

type CustomerRecord = {
  name: string;
  code: string;
  contacts: ContactInfo[];
  rawContact?: string;
  totalSpend: number;
  orderCount: number;
  lastOrderDate: string;
  latestOrderId: string;
  sources: string[];
  salesReps: string[];
  products: string[];
  productCount: number;
  isNew: boolean;
  balance: number;
  hasCredit: boolean;
  formattedBalance: string;
};

type LedgerSummary = Record<
  string,
  {
    balance: number;
    hasCredit: boolean;
  }
>;

type SortField = "name" | "orders" | "date" | "spend" | "balance";
type SortDirection = "asc" | "desc";
type PaymentFilter = "all" | "due" | "credit";
type DetailTab = "overview" | "activity" | "contacts";

const parseContactInfo = (contactString: string) => {
  try {
    if (!contactString) {
      return [] as ContactInfo[];
    }

    const cleanedString = contactString.replace(/["\\]/g, "");

    return cleanedString
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const numberMatch = part.match(/\d{10,}/);
        if (!numberMatch) {
          return null;
        }

        let label = "";
        const lower = part.toLowerCase();
        if (lower.includes("mobile")) {
          label = "Mobile";
        } else if (lower.includes("home")) {
          label = "Home";
        } else if (lower.includes("office")) {
          label = "Office";
        } else if (lower.includes("land")) {
          label = "Landline";
        } else if (lower.includes("work")) {
          label = "Work";
        } else {
          const labelMatch = part.match(/([A-Za-z]+)[\s:]*\d+/);
          label = labelMatch?.[1]?.trim() || "";
        }

        return {
          number: numberMatch[0],
          label,
        };
      })
      .filter((item): item is ContactInfo => item !== null);
  } catch (error) {
    console.error("Error parsing contact info:", error);
    return [];
  }
};

const parseDate = (dateStr: string) => {
  try {
    if (!dateStr || dateStr === "No orders yet") {
      return 0;
    }

    let normalized = dateStr;
    if (normalized.split("/").length === 2) {
      normalized = `${normalized}/${new Date().getFullYear()}`;
    }

    const [day, month, year] = normalized.split("/").map(Number);
    if (!day || !month) {
      return 0;
    }

    let fullYear = year;
    if (!year) {
      fullYear = new Date().getFullYear();
    } else if (year < 100) {
      fullYear = year < 50 ? 2000 + year : 1900 + year;
    }

    const parsed = new Date(fullYear, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  } catch {
    return 0;
  }
};

const splitOrderId = (orderId: string) => {
  if (!orderId) {
    return ["", "0"];
  }

  const parts = orderId.split("_");
  return [parts[0] || "", parts[1] || "0"];
};

const formatIndianNumber = (value: number) => {
  try {
    const [whole, decimal] = value.toFixed(2).split(".");
    const lastThree = whole.slice(-3);
    const otherNumbers = whole.slice(0, -3);
    const grouped =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") +
      (otherNumbers ? "," : "") +
      lastThree;
    return `${grouped}.${decimal}`;
  } catch {
    return "0.00";
  }
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

const CustomersScreen = () => {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchingMaster, setSearchingMaster] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [displayLimit, setDisplayLimit] = useState(20);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(
    null
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [callOptions, setCallOptions] = useState<ContactInfo[]>([]);
  const [customerToCall, setCustomerToCall] = useState<CustomerRecord | null>(
    null
  );

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
          top: -36,
          right: -28,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: isDark
            ? "rgba(192,132,252,0.12)"
            : "rgba(17,17,17,0.06)",
        },
        introRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        },
        introLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        },
        introCountChip: {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        introCountText: {
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
          paddingRight: 36,
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
        searchShell: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 4,
          marginBottom: 14,
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
        chipRow: {
          flexDirection: "row",
          gap: 10,
          paddingBottom: 6,
          marginBottom: 12,
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
        sortCard: {
          backgroundColor: colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 16,
        },
        sortRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        },
        sortTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        sortHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        sortChipRow: {
          flexDirection: "row",
          gap: 8,
        },
        sortChip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        sortChipActive: {
          backgroundColor: isDark
            ? "rgba(0,102,255,0.18)"
            : "rgba(17,17,17,0.08)",
        },
        sortChipText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        sortChipTextActive: {
          color: colors.text,
        },
        customerCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        customerTopRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 16,
        },
        avatar: {
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        avatarText: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
          letterSpacing: -0.4,
        },
        identityColumn: {
          flex: 1,
        },
        identityRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 4,
        },
        customerName: {
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
          lineHeight: 20,
        },
        customerSubtext: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        statusPill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
        },
        statusText: {
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        },
        balancePanel: {
          borderRadius: 22,
          padding: 16,
          marginBottom: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        balanceRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        },
        balanceLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        balanceValue: {
          fontFamily: omaTypography.extrabold,
          fontSize: 23,
          letterSpacing: -0.8,
        },
        balanceMetaColumn: {
          alignItems: "flex-end",
        },
        balanceMetaLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 4,
        },
        balanceMetaValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        metaGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        },
        metaPill: {
          minWidth: isWideLayout ? "31.4%" : "48%",
          flexGrow: 1,
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        metaLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 10,
          marginBottom: 2,
        },
        metaValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          lineHeight: 16,
        },
        actionsRow: {
          flexDirection: "row",
          gap: 10,
        },
        actionButton: {
          flex: 1,
          borderRadius: 18,
          paddingVertical: 12,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        actionButtonMuted: {
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        actionButtonPrimary: {
          backgroundColor: isDark ? colors.text : "#111111",
        },
        actionButtonSecondary: {
          backgroundColor: colors.primary,
        },
        actionButtonTextMuted: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        actionButtonTextOnDark: {
          color: isDark ? colors.background : "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        actionButtonTextSecondary: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
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
        loadMoreButton: {
          marginTop: 4,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingVertical: 16,
          alignItems: "center",
          justifyContent: "center",
        },
        loadMoreText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
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
          padding: 20,
          backgroundColor: isDark ? colors.surfaceVariant : "#111111",
          overflow: "hidden",
        },
        detailHeroGlow: {
          position: "absolute",
          top: -30,
          right: -20,
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        detailHeroLabel: {
          color: "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        detailHeroValue: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 34,
          lineHeight: 38,
          letterSpacing: -1.1,
          marginBottom: 8,
        },
        detailHeroSubtext: {
          color: "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          marginBottom: 18,
          paddingRight: 24,
        },
        detailHeroStatsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 18,
        },
        detailHeroStat: {
          flex: 1,
          borderRadius: 18,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        detailHeroStatLabel: {
          color: "rgba(255,255,255,0.6)",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        detailHeroStatValue: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        detailHeroActions: {
          flexDirection: "row",
          gap: 10,
        },
        detailHeroAction: {
          flex: 1,
          borderRadius: 18,
          paddingVertical: 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        detailHeroActionPrimary: {
          backgroundColor: "#ffffff",
        },
        detailHeroActionSecondary: {
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.18)",
        },
        detailHeroActionTextPrimary: {
          color: "#111111",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        detailHeroActionTextSecondary: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
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
        infoCardAction: {
          marginTop: 12,
          alignSelf: "flex-start",
          borderRadius: 14,
          backgroundColor: colors.primary,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        infoCardActionText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        chipWrap: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        },
        detailTag: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        detailTagText: {
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        contactRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 18,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 10,
        },
        contactLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        contactValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        callSheetBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.48)",
          justifyContent: "flex-end",
        },
        callSheet: {
          backgroundColor: colors.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 20) + 12,
        },
        callSheetHandle: {
          alignSelf: "center",
          width: 48,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginBottom: 14,
        },
        callSheetTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 20,
          marginBottom: 4,
        },
        callSheetSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginBottom: 18,
        },
        callOption: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderRadius: 20,
          padding: 14,
          marginBottom: 10,
        },
        callIcon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
          marginRight: 14,
        },
        callOptionLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        callOptionNumber: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        cancelButton: {
          marginTop: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
        },
        cancelButtonText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
      }),
    [colors, insets.bottom, insets.top, isDark, isWideLayout]
  );

  const fetchLedgerSummary = useCallback(async (): Promise<LedgerSummary> => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Ledger!A1:G`,
        {},
        2,
        1500
      );

      const dataRows = response.data?.values?.slice(1) || [];
      const balances: Record<string, { totalCredit: number; totalDebit: number }> =
        {};

      dataRows.forEach((row: string[]) => {
        if (row.length < 6) {
          return;
        }

        const customerCode = row[5];
        const amount = Number.parseFloat(row[1] || "0");
        const dcType = row[2];

        if (!customerCode || Number.isNaN(amount)) {
          return;
        }

        balances[customerCode] ??= { totalCredit: 0, totalDebit: 0 };

        if (dcType === "C") {
          balances[customerCode].totalCredit += amount;
        } else if (dcType === "D") {
          balances[customerCode].totalDebit += amount;
        }
      });

      return Object.entries(balances).reduce<LedgerSummary>((summary, [code, row]) => {
        const balance = row.totalDebit - row.totalCredit;
        summary[code] = {
          balance,
          hasCredit: balance <= 0,
        };
        return summary;
      }, {});
    } catch {
      return {};
    }
  }, []);

  const fetchCustomerCodes = useCallback(async () => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      const rows = response.data?.values?.slice(1) || [];

      return rows.reduce<Record<string, string>>((map, row: string[]) => {
        const code = row[0];
        const name = row[1];
        if (name) {
          map[name] = code || "";
        }
        return map;
      }, {});
    } catch {
      return {};
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const cachedCustomers = apiCache.get("customers") as CustomerRecord[] | null;
      if (cachedCustomers?.length) {
        setCustomers(cachedCustomers);
        setLoading(false);
      }

      setLoading((current) => (cachedCustomers?.length ? current : true));

      const [customerCodesMap, ledgerSummary] = await Promise.all([
        fetchCustomerCodes(),
        fetchLedgerSummary(),
      ]);

      const masterResponse = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:C`,
        {},
        3,
        3000
      );

      if (!masterResponse.data?.values) {
        throw new Error("Invalid response from Customer Master API");
      }

      const masterCustomers: Record<
        string,
        CustomerRecord & {
          orders?: Set<string>;
          sources: string[] | Set<string>;
          salesReps: string[] | Set<string>;
          products: string[] | Set<string>;
        }
      > = {};

      masterResponse.data.values.slice(1).forEach((row: string[]) => {
        if (row.length < 2) {
          return;
        }

        const code = row[0] || "";
        const name = row[1] || "";
        const contactString = row[2] || "";

        if (!name) {
          return;
        }

        masterCustomers[name] = {
          name,
          code,
          contacts: parseContactInfo(contactString),
          rawContact: contactString,
          totalSpend: 0,
          orderCount: 0,
          lastOrderDate: "No orders yet",
          latestOrderId: "",
          sources: [],
          salesReps: [],
          products: [],
          productCount: 0,
          isNew: true,
          balance: ledgerSummary[code]?.balance || 0,
          hasCredit:
            ledgerSummary[code]?.hasCredit !== undefined
              ? ledgerSummary[code].hasCredit
              : true,
          formattedBalance: formatIndianNumber(
            Math.abs(ledgerSummary[code]?.balance || 0)
          ),
        };
      });

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        3,
        3000
      );

      const orderRows = response.data?.values || [];
      orderRows.forEach((row: string[]) => {
        const customerName = row[4] || "";
        if (!customerName) {
          return;
        }

        if (!masterCustomers[customerName]) {
          const code = customerCodesMap[customerName] || "";
          masterCustomers[customerName] = {
            name: customerName,
            code,
            contacts: [],
            totalSpend: 0,
            orderCount: 0,
            lastOrderDate: "No orders yet",
            latestOrderId: "",
            sources: new Set<string>(),
            salesReps: new Set<string>(),
            products: new Set<string>(),
            productCount: 0,
            isNew: false,
            balance: ledgerSummary[code]?.balance || 0,
            hasCredit:
              ledgerSummary[code]?.hasCredit !== undefined
                ? ledgerSummary[code].hasCredit
                : true,
            formattedBalance: formatIndianNumber(
              Math.abs(ledgerSummary[code]?.balance || 0)
            ),
          };
        } else {
          masterCustomers[customerName].isNew = false;
        }

        const customer = masterCustomers[customerName];
        const amount = Number.parseFloat((row[10] || "0").replace(/,/g, ""));
        customer.totalSpend += Number.isNaN(amount) ? 0 : amount;

        customer.orders ??= new Set<string>();
        customer.orders.add(row[5] || "");
        customer.orderCount = customer.orders.size;

        const currentDate = parseDate(row[0] || "");
        const lastDate = parseDate(customer.lastOrderDate);
        if (!lastDate || currentDate > lastDate) {
          customer.lastOrderDate = row[0] || "No orders yet";
          customer.latestOrderId = row[5] || "";
        }

        if (!(customer.sources instanceof Set)) {
          customer.sources = new Set(customer.sources);
        }
        if (!(customer.salesReps instanceof Set)) {
          customer.salesReps = new Set(customer.salesReps);
        }
        if (!(customer.products instanceof Set)) {
          customer.products = new Set(customer.products);
        }

        if (row[11]) {
          customer.sources.add(row[11]);
        }
        if (row[2]) {
          customer.salesReps.add(row[2]);
        }
        if (row[6]) {
          customer.products.add(row[6]);
        }
      });

      const customerList = Object.values(masterCustomers).map((customer) => {
        const sources = Array.isArray(customer.sources)
          ? customer.sources
          : Array.from(customer.sources);
        const salesReps = Array.isArray(customer.salesReps)
          ? customer.salesReps
          : Array.from(customer.salesReps);
        const products = Array.isArray(customer.products)
          ? customer.products
          : Array.from(customer.products);

        return {
          ...customer,
          sources,
          salesReps,
          products,
          productCount: products.length,
        };
      });

      setCustomers(customerList);
      apiCache.set("customers", customerList);
    } catch (error: any) {
      showFeedback({
        type: "error",
        title: "Load Failed",
        message: `Could not load customer data: ${
          error?.message || "Unknown error"
        }`,
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchCustomerCodes, fetchLedgerSummary, showFeedback]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const searchCustomers = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        return;
      }

      try {
        setSearchingMaster(true);

        const [ledgerSummary, response] = await Promise.all([
          fetchLedgerSummary(),
          fetchWithRetry(
            `${BACKEND_URL}/api/sheets/Customer_Master!A1:C`,
            {},
            2,
            1500
          ),
        ]);

        if (!response.data?.values) {
          throw new Error("Invalid response from Customer Master API");
        }

        const matches = response.data.values
          .slice(1)
          .filter((row: string[]) => {
            const code = (row[0] || "").toLowerCase();
            const name = (row[1] || "").toLowerCase();
            const normalizedQuery = query.toLowerCase();
            return code.includes(normalizedQuery) || name.includes(normalizedQuery);
          })
          .map((row: string[]) => {
            const code = row[0] || "";
            const name = row[1] || "";
            const contactString = row[2] || "";
            const ledger = ledgerSummary[code] || {
              balance: 0,
              hasCredit: true,
            };

            return {
              name,
              code,
              contacts: parseContactInfo(contactString),
              rawContact: contactString,
              totalSpend: 0,
              orderCount: 0,
              lastOrderDate: "No orders yet",
              latestOrderId: "",
              sources: [],
              salesReps: [],
              products: [],
              productCount: 0,
              isNew: true,
              balance: ledger.balance,
              hasCredit: ledger.hasCredit,
              formattedBalance: formatIndianNumber(Math.abs(ledger.balance)),
            } as CustomerRecord;
          });

        if (!matches.length) {
          return;
        }

        setCustomers((current) => {
          const merged = [...current];
          matches.forEach((customer) => {
            if (
              !merged.some(
                (existing) =>
                  existing.code === customer.code || existing.name === customer.name
              )
            ) {
              merged.push(customer);
            }
          });
          return merged;
        });
      } catch {
        showFeedback({
          type: "error",
          title: "Search Failed",
          message: "Could not search the customer master right now.",
          autoDismiss: true,
        });
      } finally {
        setSearchingMaster(false);
      }
    },
    [fetchLedgerSummary, showFeedback]
  );

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setSearchingMaster(false);
      return;
    }

    const timeout = setTimeout(() => {
      void searchCustomers(trimmedQuery);
    }, 320);

    return () => clearTimeout(timeout);
  }, [searchCustomers, searchQuery]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    apiCache.set("customers", null);
    void loadCustomers();
  }, [loadCustomers]);

  const openCustomerDetails = useCallback((customer: CustomerRecord) => {
    setDetailTab("overview");
    setSelectedCustomer(customer);
  }, []);

  const callCustomer = useCallback(
    (customer: CustomerRecord) => {
      if (!customer.contacts?.length) {
        showFeedback({
          type: "error",
          title: "No Contact Found",
          message: "This customer does not have a saved phone number yet.",
          autoDismiss: true,
        });
        return;
      }

      if (customer.contacts.length === 1) {
        void Linking.openURL(`tel:${customer.contacts[0].number}`);
        return;
      }

      setCustomerToCall(customer);
      setCallOptions(customer.contacts);
      setCallModalVisible(true);
    },
    [showFeedback]
  );

  const filteredAndSortedCustomers = useMemo(() => {
    let nextCustomers = [...customers];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (normalizedQuery) {
      nextCustomers = nextCustomers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(normalizedQuery) ||
          customer.code.toLowerCase().includes(normalizedQuery)
      );
    }

    if (paymentFilter === "due") {
      nextCustomers = nextCustomers.filter((customer) => customer.balance > 0);
    } else if (paymentFilter === "credit") {
      nextCustomers = nextCustomers.filter((customer) => customer.balance < 0);
    }

    nextCustomers.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "orders":
          comparison = a.orderCount - b.orderCount;
          break;
        case "date": {
          const dateA = parseDate(a.lastOrderDate);
          const dateB = parseDate(b.lastOrderDate);

          if (dateA > 0 && dateB > 0) {
            comparison = dateA - dateB;
          } else if (a.latestOrderId && b.latestOrderId) {
            const [aFY, aNum] = splitOrderId(a.latestOrderId);
            const [bFY, bNum] = splitOrderId(b.latestOrderId);

            if (aFY !== bFY) {
              comparison = bFY.localeCompare(aFY);
            } else {
              comparison =
                Number.parseInt(bNum, 10) - Number.parseInt(aNum, 10);
            }
          } else if (dateA > 0) {
            comparison = -1;
          } else if (dateB > 0) {
            comparison = 1;
          } else {
            comparison = a.name.localeCompare(b.name);
          }
          break;
        }
        case "spend":
          comparison = a.totalSpend - b.totalSpend;
          break;
        case "balance":
          comparison = Math.abs(a.balance) - Math.abs(b.balance);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return nextCustomers;
  }, [customers, paymentFilter, searchQuery, sortBy, sortDirection]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Visible Accounts",
        value: `${filteredAndSortedCustomers.length}`,
      },
      {
        label: "Outstanding",
        value: `${filteredAndSortedCustomers.filter((item) => item.balance > 0).length}`,
      },
      {
        label: "New Accounts",
        value: `${filteredAndSortedCustomers.filter((item) => item.isNew).length}`,
      },
    ],
    [filteredAndSortedCustomers]
  );

  const sortOptions = useMemo<
    { field: SortField; label: string; hint?: string }[]
  >(
    () => [
      { field: "name", label: "Name" },
      { field: "orders", label: "Orders" },
      { field: "date", label: "Recent" },
      { field: "spend", label: "Spending" },
      { field: "balance", label: "Payment" },
    ],
    []
  );

  const renderCustomerCard = useCallback(
    ({ item }: { item: CustomerRecord }) => {
      const accentColor = item.isNew
        ? colors.accentBlue
        : item.balance > 0
        ? colors.accentRed
        : item.balance < 0
        ? colors.accentGreen
        : colors.accentBlue;

      const badgeLabel = item.isNew
        ? "New"
        : item.balance > 0
        ? "Outstanding"
        : item.balance < 0
        ? "Advance"
        : "Active";

      const badgeBackground = item.isNew
        ? isDark
          ? "rgba(0,102,255,0.18)"
          : "rgba(0,102,255,0.08)"
        : item.balance > 0
        ? isDark
          ? "rgba(248,113,113,0.18)"
          : "rgba(248,113,113,0.09)"
        : item.balance < 0
        ? isDark
          ? "rgba(74,222,128,0.18)"
          : "rgba(74,222,128,0.09)"
        : isDark
        ? "rgba(255,255,255,0.08)"
        : "rgba(15,23,42,0.05)";

      const balanceLabel =
        item.balance > 0
          ? "Outstanding balance"
          : item.balance < 0
          ? "Advance on account"
          : "Ledger position";
      const balanceValue =
        item.balance === 0 ? "Settled" : `₹${item.formattedBalance}`;

      return (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => openCustomerDetails(item)}
          style={styles.customerCard}
        >
          <View style={styles.customerTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>

            <View style={styles.identityColumn}>
              <View style={styles.identityRow}>
                <Text numberOfLines={2} style={styles.customerName}>
                  {item.name}
                </Text>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: badgeBackground,
                      borderColor: accentColor,
                    },
                  ]}
                >
                  <Text style={[styles.statusText, { color: accentColor }]}>
                    {badgeLabel}
                  </Text>
                </View>
              </View>

              <Text numberOfLines={2} style={styles.customerSubtext}>
                {item.code
                  ? `ID ${item.code}`
                  : "Customer master record"}{" "}
                · Last order {item.lastOrderDate || "No orders yet"}
              </Text>
            </View>

            <Ionicons
              color={colors.textSecondary}
              name="chevron-forward"
              size={18}
            />
          </View>

          <View style={styles.balancePanel}>
            <View style={styles.balanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.balanceLabel}>{balanceLabel}</Text>
                <Text style={[styles.balanceValue, { color: accentColor }]}>
                  {balanceValue}
                </Text>
              </View>

              <View style={styles.balanceMetaColumn}>
                <Text style={styles.balanceMetaLabel}>Orders tracked</Text>
                <Text style={styles.balanceMetaValue}>{item.orderCount}</Text>
              </View>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaPill}>
              <Ionicons
                color={colors.textSecondary}
                name="calendar-outline"
                size={16}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Last order</Text>
                <Text numberOfLines={2} style={styles.metaValue}>
                  {item.lastOrderDate || "No orders yet"}
                </Text>
              </View>
            </View>

            <View style={styles.metaPill}>
              <Ionicons
                color={colors.textSecondary}
                name="pricetag-outline"
                size={16}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Lifetime spend</Text>
                <Text numberOfLines={1} style={styles.metaValue}>
                  ₹{formatIndianNumber(item.totalSpend)}
                </Text>
              </View>
            </View>

            <View style={styles.metaPill}>
              <Ionicons
                color={colors.textSecondary}
                name="cube-outline"
                size={16}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Product mix</Text>
                <Text style={styles.metaValue}>
                  {item.productCount || 0} SKUs
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => callCustomer(item)}
              style={[styles.actionButton, styles.actionButtonMuted]}
            >
              <Ionicons color={colors.text} name="call-outline" size={16} />
              <Text style={styles.actionButtonTextMuted}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push(
                  "/(app)/new-order?customer=" + encodeURIComponent(item.name)
                )
              }
              style={[styles.actionButton, styles.actionButtonPrimary]}
            >
              <Ionicons
                color={isDark ? colors.background : "#ffffff"}
                name="add-outline"
                size={16}
              />
              <Text style={styles.actionButtonTextOnDark}>New Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openCustomerDetails(item)}
              style={[styles.actionButton, styles.actionButtonSecondary]}
            >
              <Ionicons color="#ffffff" name="layers-outline" size={16} />
              <Text style={styles.actionButtonTextSecondary}>Profile</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [callCustomer, colors, isDark, openCustomerDetails, styles]
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
          <Text style={styles.eyebrow}>OMA Customer Flow</Text>
          <Text style={styles.headerTitle}>Client Roster</Text>
          <Text style={styles.headerSubtitle}>
            Live master, payment, and order history
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
          <Text style={styles.introLabel}>Accounts snapshot</Text>
          <View style={styles.introCountChip}>
            <Text style={styles.introCountText}>
              {filteredAndSortedCustomers.length} visible
            </Text>
          </View>
        </View>

        <Text style={styles.introHeading}>
          Cleaner scanning for dense customer books.
        </Text>
        <Text style={styles.introBody}>
          Search by name or code, isolate payment position fast, and drop into a
          richer detail view without losing the live OMA data shape.
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
      <View style={styles.searchShell}>
        <Ionicons color={colors.textSecondary} name="search-outline" size={18} />

        <TextInput
          onChangeText={(text) => {
            setSearchQuery(text);
            setDisplayLimit(20);
          }}
          placeholder="Search by client name or ID..."
          placeholderTextColor={colors.textPlaceholder}
          style={styles.searchInput}
          value={searchQuery}
        />

        {searchingMaster ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : searchQuery ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setSearchQuery("")}>
            <Ionicons
              color={colors.textSecondary}
              name="close-circle"
              size={18}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Payment Filter</Text>
      <ScrollView
        contentContainerStyle={styles.chipRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {[
          { id: "all", label: "All Accounts" },
          { id: "due", label: "Outstanding" },
          { id: "credit", label: "Advance Payment" },
        ].map((filter) => {
          const active = paymentFilter === filter.id;

          return (
            <TouchableOpacity
              key={filter.id}
              activeOpacity={0.88}
              onPress={() => setPaymentFilter(filter.id as PaymentFilter)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.sortCard}>
        <View style={styles.sortRow}>
          <Text style={styles.sortTitle}>Sort customers</Text>
          <Text style={styles.sortHint}>
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </Text>
        </View>

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

  const selectedAccent = selectedCustomer
    ? selectedCustomer.isNew
      ? colors.accentBlue
      : selectedCustomer.balance > 0
      ? colors.accentRed
      : selectedCustomer.balance < 0
      ? colors.accentGreen
      : colors.accentBlue
    : colors.accentBlue;

  const selectedBalanceLabel = selectedCustomer
    ? selectedCustomer.balance > 0
      ? "Outstanding balance"
      : selectedCustomer.balance < 0
      ? "Advance payment"
      : "Ledger settled"
    : "";

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      {loading ? (
        <LoadingIndicator message="Loading customers..." showTips={true} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredAndSortedCustomers.slice(0, displayLimit)}
          keyExtractor={(item) => item.code || item.name}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                color={colors.textPlaceholder}
                name="people-outline"
                size={54}
              />
              <Text style={styles.emptyTitle}>No matching accounts</Text>
              <Text style={styles.emptyBody}>
                Try a different customer name, code, or payment filter.
              </Text>
            </View>
          }
          ListFooterComponent={
            displayLimit < filteredAndSortedCustomers.length ? (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setDisplayLimit((current) => current + 20)}
                style={styles.loadMoreButton}
              >
                <Text style={styles.loadMoreText}>
                  Show {filteredAndSortedCustomers.length - displayLimit} more
                  accounts
                </Text>
              </TouchableOpacity>
            ) : null
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
          renderItem={renderCustomerCard}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedCustomer(null)}
        visible={Boolean(selectedCustomer)}
      >
        {selectedCustomer ? (
          <View style={styles.detailScreen}>
            <View style={styles.topGlow} />

            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedCustomer(null)}
                  style={styles.iconButton}
                >
                  <Ionicons color={colors.text} name="arrow-back" size={18} />
                </TouchableOpacity>

                <View style={styles.detailHeaderInfo}>
                  <Text numberOfLines={1} style={styles.detailHeaderTitle}>
                    {selectedCustomer.name}
                  </Text>
                  <Text style={styles.detailHeaderCode}>
                    {selectedCustomer.code || "No customer code"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(17,17,17,0.05)",
                      borderColor: selectedAccent,
                    },
                  ]}
                >
                  <Text style={[styles.statusText, { color: selectedAccent }]}>
                    {selectedCustomer.isNew
                      ? "New"
                      : selectedCustomer.balance > 0
                      ? "Outstanding"
                      : selectedCustomer.balance < 0
                      ? "Advance"
                      : "Active"}
                  </Text>
                </View>
              </View>

              <View style={styles.detailHero}>
                <View style={styles.detailHeroGlow} />
                <Text style={styles.detailHeroLabel}>{selectedBalanceLabel}</Text>
                <Text style={styles.detailHeroValue}>
                  {selectedCustomer.balance === 0
                    ? "Settled"
                    : `₹${selectedCustomer.formattedBalance}`}
                </Text>
                <Text style={styles.detailHeroSubtext}>
                  Real OMA customer master, payment position, product footprint,
                  and latest order activity in a denser mobile layout.
                </Text>

                <View style={styles.detailHeroStatsRow}>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Orders</Text>
                    <Text style={styles.detailHeroStatValue}>
                      {selectedCustomer.orderCount}
                    </Text>
                  </View>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Spend</Text>
                    <Text style={styles.detailHeroStatValue}>
                      ₹{formatIndianNumber(selectedCustomer.totalSpend)}
                    </Text>
                  </View>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Products</Text>
                    <Text style={styles.detailHeroStatValue}>
                      {selectedCustomer.productCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailHeroActions}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => callCustomer(selectedCustomer)}
                    style={[
                      styles.detailHeroAction,
                      styles.detailHeroActionSecondary,
                    ]}
                  >
                    <Ionicons color="#ffffff" name="call-outline" size={16} />
                    <Text style={styles.detailHeroActionTextSecondary}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() =>
                      router.push(
                        "/(app)/new-order?customer=" +
                          encodeURIComponent(selectedCustomer.name)
                      )
                    }
                    style={[
                      styles.detailHeroAction,
                      styles.detailHeroActionPrimary,
                    ]}
                  >
                    <Ionicons color="#111111" name="add-outline" size={16} />
                    <Text style={styles.detailHeroActionTextPrimary}>
                      New Order
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.tabRow}>
              {[
                { id: "overview", label: "Overview" },
                { id: "activity", label: "Activity" },
                { id: "contacts", label: "Contacts" },
              ].map((tab) => {
                const active = detailTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.88}
                    onPress={() => setDetailTab(tab.id as DetailTab)}
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
                    <Text style={styles.detailSectionTitle}>Performance</Text>

                    <View style={styles.detailStatsGrid}>
                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer code</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.code || "Not assigned"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Last order</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedCustomer.lastOrderDate || "No orders yet"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Sales reps</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.salesReps.length || 0}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Order sources</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.sources.length || 0}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {selectedCustomer.isNew ? (
                    <View style={styles.detailSectionCard}>
                      <Text style={styles.detailSectionTitle}>
                        Ready for first conversion
                      </Text>
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardText}>
                          This account exists in the live customer master, but no
                          order history has been recorded yet.
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() =>
                            router.push(
                              "/(app)/new-order?customer=" +
                                encodeURIComponent(selectedCustomer.name)
                            )
                          }
                          style={styles.infoCardAction}
                        >
                          <Text style={styles.infoCardActionText}>
                            Create first order
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}

              {detailTab === "activity" ? (
                <>
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Products ordered</Text>
                    {selectedCustomer.products.length ? (
                      <View style={styles.chipWrap}>
                        {selectedCustomer.products.map((product) => (
                          <View key={product} style={styles.detailTag}>
                            <Text style={styles.detailTagText}>{product}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardText}>
                          No product history available yet for this account.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Order sources</Text>
                    {selectedCustomer.sources.length ? (
                      <View style={styles.chipWrap}>
                        {selectedCustomer.sources.map((source) => (
                          <View key={source} style={styles.detailTag}>
                            <Text style={styles.detailTagText}>
                              {source || "App"}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardText}>
                          No source signals have been captured for this customer
                          yet.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Sales coverage</Text>
                    {selectedCustomer.salesReps.length ? (
                      <View style={styles.chipWrap}>
                        {selectedCustomer.salesReps.map((rep) => (
                          <View key={rep} style={styles.detailTag}>
                            <Text style={styles.detailTagText}>{rep}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardText}>
                          No sales-rep activity is attached to this account yet.
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              ) : null}

              {detailTab === "contacts" ? (
                <>
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Reach the buyer</Text>
                    {selectedCustomer.contacts.length ? (
                      selectedCustomer.contacts.map((contact, index) => (
                        <TouchableOpacity
                          key={`${contact.number}-${index}`}
                          activeOpacity={0.88}
                          onPress={() => void Linking.openURL(`tel:${contact.number}`)}
                          style={styles.contactRow}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.contactLabel}>
                              {contact.label || `Phone ${index + 1}`}
                            </Text>
                            <Text style={styles.contactValue}>{contact.number}</Text>
                          </View>

                          <Ionicons
                            color={colors.primary}
                            name="call-outline"
                            size={18}
                          />
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardText}>
                          No contact numbers are stored in the live customer
                          master for this account.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Record snapshot</Text>
                    <View style={styles.detailStatsGrid}>
                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Customer code</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.code || "Not available"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Raw contact</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedCustomer.rawContact || "Not available"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setCallModalVisible(false)}
        transparent
        visible={callModalVisible}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCallModalVisible(false)}
          style={styles.callSheetBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.callSheet}>
            <View style={styles.callSheetHandle} />
            <Text style={styles.callSheetTitle}>
              Call {customerToCall?.name || "Customer"}
            </Text>
            <Text style={styles.callSheetSubtitle}>
              Choose the number you want to dial.
            </Text>

            {callOptions.map((contact, index) => (
              <TouchableOpacity
                key={`${contact.number}-${index}`}
                activeOpacity={0.88}
                onPress={() => {
                  setCallModalVisible(false);
                  void Linking.openURL(`tel:${contact.number}`);
                }}
                style={styles.callOption}
              >
                <View style={styles.callIcon}>
                  <Ionicons color="#ffffff" name="call-outline" size={18} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.callOptionLabel}>
                    {contact.label || `Phone ${index + 1}`}
                  </Text>
                  <Text style={styles.callOptionNumber}>{contact.number}</Text>
                </View>

                <Ionicons
                  color={colors.textSecondary}
                  name="chevron-forward"
                  size={16}
                />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setCallModalVisible(false)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default CustomersScreen;


