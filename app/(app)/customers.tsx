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
import { fetchSheetObjects } from "@/utils/fetchSheetObjects";
import LoadingIndicator from "@/components/LoadingIndicator";
import { FLOATING_NAV_SPACE } from "@/components/oma/OmaFloatingNav";
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
  status: string;
  salesOwner: string;
  collectorOwner: string;
  zone: string;
  city: string;
  state: string;
  industry: string;
  channel: string;
  paymentTermsDays: string;
  creditLimit: number;
  riskTier: string;
  customerGroup: string;
  currentExposure: number;
  thirtyDayExposure: number;
  sixtyDayExposure: number;
  ninetyDayExposure: number;
  highRiskExposure: number;
  collectedValue: number;
  invoicedValue: number;
  collectionRate: number;
  averageAgeDays: number;
  lastUpdatedAt: string;
};

type LedgerSummary = Record<
  string,
  {
    balance: number;
    hasCredit: boolean;
    customerGroup: string;
    currentExposure: number;
    thirtyDayExposure: number;
    sixtyDayExposure: number;
    ninetyDayExposure: number;
    highRiskExposure: number;
    collectedValue: number;
    invoicedValue: number;
    collectionRate: number;
    averageAgeDays: number;
    lastUpdatedAt: string;
  }
>;

type MutableCustomerRecord = Omit<
  CustomerRecord,
  "sources" | "salesReps" | "products"
> & {
  orders?: Set<string>;
  sources: string[] | Set<string>;
  salesReps: string[] | Set<string>;
  products: string[] | Set<string>;
};

type SortField = "name" | "orders" | "date" | "spend" | "balance";
type SortDirection = "asc" | "desc";
type PaymentFilter = "all" | "due" | "credit" | "risk";
type DetailTab = "overview" | "activity" | "contacts";

const CUSTOMER_CACHE_KEY = "customers_v2";

const emptyLedgerSummary = {
  balance: 0,
  hasCredit: true,
  customerGroup: "",
  currentExposure: 0,
  thirtyDayExposure: 0,
  sixtyDayExposure: 0,
  ninetyDayExposure: 0,
  highRiskExposure: 0,
  collectedValue: 0,
  invoicedValue: 0,
  collectionRate: 0,
  averageAgeDays: 0,
  lastUpdatedAt: "",
};

const parseAmount = (value: string | number | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getLedgerForCode = (ledgerSummary: LedgerSummary, code: string) =>
  ledgerSummary[code] || emptyLedgerSummary;

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

const compactChipHitSlop = { top: 4, bottom: 4, left: 2, right: 2 };

const CustomersScreen = () => {
  const { colors, isDark } = useContext(ThemeContext);
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
          paddingTop: insets.top + 12,
          paddingBottom: 4,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
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
        headerMeta: {
          flex: 1,
          alignItems: "flex-start",
          paddingHorizontal: 14,
          gap: 4,
        },
        eyebrow: {
          color: "#8E8E93",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        },
        headerTitle: {
          color: "#F5F5F7",
          fontFamily: omaTypography.bold,
          fontSize: 28,
          lineHeight: 34,
          letterSpacing: -0.8,
        },
        headerSubtitle: {
          color: "#A1A1AA",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
        },
        summaryGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
        },
        statsStrip: {
          marginBottom: 12,
        },
        summaryCard: {
          flex: 1,
          backgroundColor: "#242426",
          borderRadius: 14,
          minHeight: 50,
          paddingHorizontal: 11,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          justifyContent: "center",
        },
        summaryValue: {
          color: "#FFFFFF",
          fontFamily: omaTypography.extrabold,
          fontSize: 19,
          marginBottom: 2,
          letterSpacing: -0.5,
        },
        summaryLabel: {
          color: "#A1A1AA",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          lineHeight: 14,
        },
        searchShell: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#1C1C1E",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          paddingHorizontal: 14,
          paddingVertical: 4,
          marginBottom: 10,
          minHeight: 50,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 20,
          elevation: 7,
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
        controlPanel: {
          backgroundColor: "#171718",
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          padding: 10,
          marginBottom: 14,
        },
        controlPanelHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 2,
          marginBottom: 8,
        },
        controlPanelTitle: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          letterSpacing: -0.25,
        },
        controlPanelMeta: {
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        chipRow: {
          flexDirection: "row",
          gap: 8,
          paddingBottom: 8,
        },
        chip: {
          minHeight: 36,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: "#1C1C1E",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        chipActive: {
          backgroundColor: "#F5F5F7",
          borderColor: "#F5F5F7",
        },
        chipText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        chipTextActive: {
          color: "#101011",
        },
        sortChipRow: {
          flexDirection: "row",
          gap: 8,
          paddingTop: 2,
        },
        sortChip: {
          minHeight: 34,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: "#242426",
        },
        sortChipActive: {
          backgroundColor: "#343436",
        },
        sortChipText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        sortChipTextActive: {
          color: "#FFFFFF",
        },
        customerCard: {
          width: contentWidth,
          backgroundColor: "#1F1F21",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.07)",
          padding: 14,
          marginBottom: 12,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 22,
          elevation: 6,
        },
        customerAccent: {
          position: "absolute",
          left: 0,
          top: 18,
          width: 4,
          height: 30,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
        },
        customerTopRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        },
        avatar: {
          width: 42,
          height: 42,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2A2A2C",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        avatarText: {
          color: "#F5F5F7",
          fontFamily: omaTypography.extrabold,
          fontSize: 15,
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
          color: "#F5F5F7",
          fontFamily: omaTypography.bold,
          fontSize: 16,
          lineHeight: 20,
        },
        customerSubtext: {
          color: "#A1A1AA",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 16,
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
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.07)",
          paddingTop: 10,
          marginBottom: 10,
        },
        balanceRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        },
        balanceLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        balanceValue: {
          fontFamily: omaTypography.extrabold,
          fontSize: 21,
          letterSpacing: -0.6,
        },
        balanceMetaColumn: {
          alignItems: "flex-end",
        },
        balanceMetaLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          marginBottom: 3,
        },
        balanceMetaValue: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        metaGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 10,
        },
        metaPill: {
          minWidth: "48%",
          flexGrow: 1,
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: "rgba(255,255,255,0.035)",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        metaLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 9,
          marginBottom: 2,
        },
        metaValue: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          lineHeight: 15,
        },
        actionsRow: {
          flexDirection: "row",
          gap: 10,
        },
        actionButton: {
          flex: 1,
          borderRadius: 16,
          minHeight: 44,
          paddingVertical: 10,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        actionButtonMuted: {
          backgroundColor: "#2A2A2C",
        },
        actionButtonPrimary: {
          backgroundColor: "#F5F5F7",
        },
        actionButtonSecondary: {
          backgroundColor: "#2F80ED",
        },
        actionButtonTextMuted: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        actionButtonTextOnDark: {
          color: "#101011",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        actionButtonTextSecondary: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
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
        loadMoreButton: {
          width: contentWidth,
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
          backgroundColor: "#101011",
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
          color: "#F5F5F7",
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          letterSpacing: -0.8,
        },
        detailHeaderCode: {
          color: "#8E8E93",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginTop: 4,
        },
        detailHero: {
          borderRadius: 30,
          padding: 20,
          backgroundColor: "#1C1C1E",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
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
          backgroundColor: "#242426",
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
          backgroundColor: "#2A2A2C",
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
          backgroundColor: "#1C1C1E",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
        },
        tabButtonActive: {
          backgroundColor: "#F5F5F7",
          borderColor: "#F5F5F7",
        },
        tabButtonText: {
          color: "#A1A1AA",
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        tabButtonTextActive: {
          color: "#101011",
        },
        detailScrollContent: {
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 24) + 28,
        },
        detailSectionCard: {
          backgroundColor: "#1C1C1E",
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          padding: 18,
          marginBottom: 14,
        },
        detailSectionTitle: {
          color: "#F5F5F7",
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
          backgroundColor: "#242426",
        },
        detailStatLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 6,
        },
        detailStatValue: {
          color: "#F5F5F7",
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
          backgroundColor: "#242426",
        },
        infoCardText: {
          color: "#B5B5BB",
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
          backgroundColor: "#242426",
        },
        detailTagText: {
          color: "#F5F5F7",
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        contactRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 18,
          padding: 14,
          backgroundColor: "#242426",
          marginBottom: 10,
        },
        contactLabel: {
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        contactValue: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        callSheetBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.48)",
          justifyContent: "flex-end",
        },
        callSheet: {
          backgroundColor: "#1C1C1E",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 20) + 12,
        },
        callSheetHandle: {
          alignSelf: "center",
          width: 48,
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.2)",
          marginBottom: 14,
        },
        callSheetTitle: {
          color: "#F5F5F7",
          fontFamily: omaTypography.extrabold,
          fontSize: 20,
          marginBottom: 4,
        },
        callSheetSubtitle: {
          color: "#A1A1AA",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginBottom: 18,
        },
        callOption: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#242426",
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
          color: "#8E8E93",
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        callOptionNumber: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        cancelButton: {
          marginTop: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
        },
        cancelButtonText: {
          color: "#F5F5F7",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
      }),
    [colors, contentWidth, insets.bottom, insets.top, isWideLayout]
  );

  const fetchLedgerSummary = useCallback(async (): Promise<LedgerSummary> => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Account_Snapshot!A1:Z`,
        {},
        2,
        1500
      );

      const rows = fetchSheetObjects(response.data?.values || [], [
        "customer_code",
        "total_exposure",
      ]);

      return rows.reduce<LedgerSummary>((summary, row) => {
        const customerCode = row.customer_code;
        const balance = parseAmount(row.total_exposure);

        if (!customerCode) {
          return summary;
        }

        summary[customerCode] = {
          balance,
          hasCredit: balance <= 0,
          customerGroup: row.customer_group || "",
          currentExposure: parseAmount(row.current_exposure),
          thirtyDayExposure: parseAmount(row.thirty_day_exposure),
          sixtyDayExposure: parseAmount(row.sixty_day_exposure),
          ninetyDayExposure: parseAmount(row.ninety_day_exposure),
          highRiskExposure: parseAmount(row.high_risk_exposure),
          collectedValue: parseAmount(row.collected_value),
          invoicedValue: parseAmount(row.invoiced_value),
          collectionRate: parseAmount(row.collection_rate),
          averageAgeDays: parseAmount(row.average_age_days),
          lastUpdatedAt: row.last_updated_at || "",
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

      const rows = (response.data?.values?.slice(1) || []) as string[][];

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
      const cachedCustomers = apiCache.get(CUSTOMER_CACHE_KEY) as
        | CustomerRecord[]
        | null;
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
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:Z`,
        {},
        3,
        3000
      );

      if (!masterResponse.data?.values) {
        throw new Error("Invalid response from Customer Master API");
      }

      const masterCustomers: Record<string, MutableCustomerRecord> = {};

      const masterRows = fetchSheetObjects(masterResponse.data.values, [
        "Customer CODE",
        "Customer NAME",
      ]);

      masterRows.forEach((row) => {
        const code = row["Customer CODE"] || "";
        const name = row["Customer NAME"] || "";
        const contactString = row.Contact || "";

        if (!name) {
          return;
        }

        const ledger = getLedgerForCode(ledgerSummary, code);

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
          balance: ledger.balance,
          hasCredit: ledger.hasCredit,
          formattedBalance: formatIndianNumber(Math.abs(ledger.balance)),
          status: row.customer_status || "",
          salesOwner: row.sales_owner || "",
          collectorOwner: row.collector_owner || "",
          zone: row.zone || "",
          city: row.city || "",
          state: row.state || "",
          industry: row.industry || "",
          channel: row.channel || "",
          paymentTermsDays: row.payment_terms_days || "",
          creditLimit: parseAmount(row.credit_limit),
          riskTier: row.risk_tier || "",
          customerGroup: ledger.customerGroup,
          currentExposure: ledger.currentExposure,
          thirtyDayExposure: ledger.thirtyDayExposure,
          sixtyDayExposure: ledger.sixtyDayExposure,
          ninetyDayExposure: ledger.ninetyDayExposure,
          highRiskExposure: ledger.highRiskExposure,
          collectedValue: ledger.collectedValue,
          invoicedValue: ledger.invoicedValue,
          collectionRate: ledger.collectionRate,
          averageAgeDays: ledger.averageAgeDays,
          lastUpdatedAt: ledger.lastUpdatedAt,
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
          const ledger = getLedgerForCode(ledgerSummary, code);
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
            balance: ledger.balance,
            hasCredit: ledger.hasCredit,
            formattedBalance: formatIndianNumber(Math.abs(ledger.balance)),
            status: "",
            salesOwner: "",
            collectorOwner: "",
            zone: "",
            city: "",
            state: "",
            industry: "",
            channel: "",
            paymentTermsDays: "",
            creditLimit: 0,
            riskTier: "",
            customerGroup: ledger.customerGroup,
            currentExposure: ledger.currentExposure,
            thirtyDayExposure: ledger.thirtyDayExposure,
            sixtyDayExposure: ledger.sixtyDayExposure,
            ninetyDayExposure: ledger.ninetyDayExposure,
            highRiskExposure: ledger.highRiskExposure,
            collectedValue: ledger.collectedValue,
            invoicedValue: ledger.invoicedValue,
            collectionRate: ledger.collectionRate,
            averageAgeDays: ledger.averageAgeDays,
            lastUpdatedAt: ledger.lastUpdatedAt,
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

        const sourcesSet =
          customer.sources instanceof Set
            ? customer.sources
            : new Set(customer.sources);
        const salesRepsSet =
          customer.salesReps instanceof Set
            ? customer.salesReps
            : new Set(customer.salesReps);
        const productsSet =
          customer.products instanceof Set
            ? customer.products
            : new Set(customer.products);

        customer.sources = sourcesSet;
        customer.salesReps = salesRepsSet;
        customer.products = productsSet;

        if (row[11]) {
          sourcesSet.add(row[11]);
        }
        if (row[2]) {
          salesRepsSet.add(row[2]);
        }
        if (row[6]) {
          productsSet.add(row[6]);
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
      apiCache.set(CUSTOMER_CACHE_KEY, customerList);
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
            `${BACKEND_URL}/api/sheets/Customer_Master!A1:Z`,
            {},
            2,
            1500
          ),
        ]);

        if (!response.data?.values) {
          throw new Error("Invalid response from Customer Master API");
        }

        const matches = fetchSheetObjects(response.data.values, [
          "Customer CODE",
          "Customer NAME",
        ])
          .filter((row) => {
            const code = (row["Customer CODE"] || "").toLowerCase();
            const name = (row["Customer NAME"] || "").toLowerCase();
            const normalizedQuery = query.toLowerCase();
            return code.includes(normalizedQuery) || name.includes(normalizedQuery);
          })
          .map((row) => {
            const code = row["Customer CODE"] || "";
            const name = row["Customer NAME"] || "";
            const contactString = row.Contact || "";
            const ledger = getLedgerForCode(ledgerSummary, code);

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
              status: row.customer_status || "",
              salesOwner: row.sales_owner || "",
              collectorOwner: row.collector_owner || "",
              zone: row.zone || "",
              city: row.city || "",
              state: row.state || "",
              industry: row.industry || "",
              channel: row.channel || "",
              paymentTermsDays: row.payment_terms_days || "",
              creditLimit: parseAmount(row.credit_limit),
              riskTier: row.risk_tier || "",
              customerGroup: ledger.customerGroup,
              currentExposure: ledger.currentExposure,
              thirtyDayExposure: ledger.thirtyDayExposure,
              sixtyDayExposure: ledger.sixtyDayExposure,
              ninetyDayExposure: ledger.ninetyDayExposure,
              highRiskExposure: ledger.highRiskExposure,
              collectedValue: ledger.collectedValue,
              invoicedValue: ledger.invoicedValue,
              collectionRate: ledger.collectionRate,
              averageAgeDays: ledger.averageAgeDays,
              lastUpdatedAt: ledger.lastUpdatedAt,
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
    apiCache.set(CUSTOMER_CACHE_KEY, null);
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
    } else if (paymentFilter === "risk") {
      nextCustomers = nextCustomers.filter(
        (customer) =>
          customer.highRiskExposure > 0 ||
          ["high", "medium"].includes(customer.riskTier.toLowerCase())
      );
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
        label: "Visible",
        value: `${filteredAndSortedCustomers.length}`,
      },
      {
        label: "Outstanding",
        value: `${filteredAndSortedCustomers.filter((item) => item.balance > 0).length}`,
      },
      {
        label: "At risk",
        value: `${
          filteredAndSortedCustomers.filter(
            (item) =>
              item.highRiskExposure > 0 ||
              ["high", "medium"].includes(item.riskTier.toLowerCase())
          ).length
        }`,
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
          <View style={[styles.customerAccent, { backgroundColor: accentColor }]} />
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
                · {item.channel || item.industry || "Direct"} ·{" "}
                {item.city || item.zone || "Unmapped"} ·{" "}
                {item.riskTier || "Unrated"} risk
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
                <Text style={styles.balanceMetaLabel}>Collection</Text>
                <Text style={styles.balanceMetaValue}>
                  {item.collectionRate
                    ? `${Math.round(item.collectionRate)}%`
                    : "No receipts"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaPill}>
              <Ionicons
                color={colors.textSecondary}
                name="person-outline"
                size={16}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Owner</Text>
                <Text numberOfLines={2} style={styles.metaValue}>
                  {item.salesOwner || item.collectorOwner || "Unassigned"}
                </Text>
              </View>
            </View>

            <View style={styles.metaPill}>
              <Ionicons
                color={colors.textSecondary}
                name="calendar-outline"
                size={16}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Terms</Text>
                <Text numberOfLines={1} style={styles.metaValue}>
                  {item.paymentTermsDays
                    ? `${item.paymentTermsDays} days`
                    : "Not set"}
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
                router.push({
                  pathname: "/(app)/new-order",
                  params: { customer: item.name },
                })
              }
              style={[styles.actionButton, styles.actionButtonPrimary]}
            >
              <Ionicons
                color="#101011"
                name="add-outline"
                size={16}
              />
              <Text style={styles.actionButtonTextOnDark}>New Order</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [callCustomer, colors, isDark, openCustomerDetails, styles]
  );

  const activeSortLabel =
    sortOptions.find((option) => option.field === sortBy)?.label || "Name";
  const activeSortDirection = sortDirection === "asc" ? "ascending" : "descending";

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
          <Text style={styles.eyebrow}>OMA</Text>
          <Text style={styles.headerTitle}>Clients</Text>
          <Text style={styles.headerSubtitle}>
            Master, risk, terms, and order history
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleRefresh}
          style={styles.iconButton}
        >
          {refreshing ? (
            <ActivityIndicator color="#F5F5F7" size="small" />
          ) : (
            <Ionicons color="#F5F5F7" name="pulse-outline" size={18} />
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.summaryGrid, styles.statsStrip]}>
        {summaryCards.map((card) => (
          <View key={card.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{card.value}</Text>
            <Text style={styles.summaryLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

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

      <View style={styles.controlPanel}>
        <View style={styles.controlPanelHeader}>
          <Text style={styles.controlPanelTitle}>Exposure</Text>
          <Text style={styles.controlPanelMeta}>
            {activeSortLabel} {activeSortDirection}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.chipRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {[
            { id: "all", label: "All Clients" },
            { id: "due", label: "Outstanding" },
            { id: "credit", label: "Advance" },
            { id: "risk", label: "At risk" },
          ].map((filter) => {
            const active = paymentFilter === filter.id;

            return (
              <TouchableOpacity
                key={filter.id}
                activeOpacity={0.88}
                hitSlop={compactChipHitSlop}
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
                  {selectedCustomer.channel ||
                    selectedCustomer.industry ||
                    "Customer master"}
                  {" · "}
                  {selectedCustomer.city ||
                    selectedCustomer.zone ||
                    selectedCustomer.state ||
                    "Location not set"}
                  {" · "}
                  {selectedCustomer.salesOwner || "Owner not assigned"}
                </Text>

                <View style={styles.detailHeroStatsRow}>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Orders</Text>
                    <Text style={styles.detailHeroStatValue}>
                      {selectedCustomer.orderCount}
                    </Text>
                  </View>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Limit</Text>
                    <Text style={styles.detailHeroStatValue}>
                      {selectedCustomer.creditLimit
                        ? `₹${formatIndianNumber(selectedCustomer.creditLimit)}`
                        : "Unset"}
                    </Text>
                  </View>
                  <View style={styles.detailHeroStat}>
                    <Text style={styles.detailHeroStatLabel}>Risk</Text>
                    <Text style={styles.detailHeroStatValue}>
                      {selectedCustomer.riskTier || "Unrated"}
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
                        {
                          pathname: "/(app)/new-order",
                          params: { customer: selectedCustomer.name },
                        }
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
                        <Text style={styles.detailStatLabel}>Sales owner</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedCustomer.salesOwner || "Unassigned"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Payment terms</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.paymentTermsDays
                            ? `${selectedCustomer.paymentTermsDays} days`
                            : "Not set"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>
                      Collections position
                    </Text>

                    <View style={styles.detailStatsGrid}>
                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Collector</Text>
                        <Text
                          style={[
                            styles.detailStatValue,
                            styles.detailStatValueSmall,
                          ]}
                        >
                          {selectedCustomer.collectorOwner || "Unassigned"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Collection rate</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.collectionRate
                            ? `${selectedCustomer.collectionRate.toFixed(1)}%`
                            : "0%"}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>90+ exposure</Text>
                        <Text style={styles.detailStatValue}>
                          ₹{formatIndianNumber(selectedCustomer.ninetyDayExposure)}
                        </Text>
                      </View>

                      <View style={styles.detailStatCard}>
                        <Text style={styles.detailStatLabel}>Average age</Text>
                        <Text style={styles.detailStatValue}>
                          {selectedCustomer.averageAgeDays
                            ? `${Math.round(selectedCustomer.averageAgeDays)}d`
                            : "0d"}
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
                              {
                                pathname: "/(app)/new-order",
                                params: { customer: selectedCustomer.name },
                              }
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


