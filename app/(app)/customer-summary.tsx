import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
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
import { BACKEND_URL, apiCache, fetchWithRetry } from "../utils/apiManager";
import {
  calculateLedgerStats,
  fetchCustomerLedger,
  formatIndianNumber,
} from "../utils/ledgerUtils";
import { omaTypography } from "../utils/typography";

type CustomerOption = {
  "Customer CODE": string;
  "Customer NAME": string;
};

type LedgerEntry = {
  Date: string;
  Amount: string;
  DC: string;
  Company_Year: string;
  Description: string;
  Customer_CODE: string;
  Customer_Group: string;
  VOUCHER_NUMBER: string;
  Customer_NAME: string;
  Customer_City: string;
  GST_Number: string;
  Mobile: string;
};

type DetailTab = "overview" | "ledger" | "history";

type HistoryGroup = {
  date: string;
  transactions: LedgerEntry[];
  totalAmount: number;
};

type LedgerBucket = {
  key: string;
  label: string;
  count: number;
  credit: number;
  debit: number;
  net: number;
  latestDate: string;
  latestVoucher: string;
};

type FinancialFamily = {
  key: string;
  label: string;
  value: number;
  count: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
};

type CustomerProfile = {
  group: string;
  city: string;
  mobile: string;
  gst: string;
};

const ALPHABET = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode(65 + index)
);

const parseTransactionDate = (dateStr: string) => {
  if (!dateStr) {
    return 0;
  }

  const [day, month, year] = dateStr.split("/").map(Number);
  if (!day || !month || !year) {
    return 0;
  }

  return new Date(year, month - 1, day).getTime();
};

const parseAmountValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "") : String(value);
  const amount = Number.parseFloat(normalized);
  return Number.isNaN(amount) ? 0 : Math.abs(amount);
};

const formatCurrency = (value: string | number) =>
  `₹${formatIndianNumber(
    typeof value === "number" ? value : parseAmountValue(value)
  )}`;

const cleanDescription = (description: string) => {
  if (!description) {
    return "Manual Adjustment";
  }

  return description.replace(/^Default\s+/i, "").trim() || "Manual Adjustment";
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

const CustomerSummaryScreen = () => {
  const { colors, isDark, toggleTheme } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [selectedLetter, setSelectedLetter] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(
    null
  );
  const [browserExpanded, setBrowserExpanded] = useState(true);

  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedTransaction, setSelectedTransaction] =
    useState<LedgerEntry | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const isWideLayout = width >= 420;
  const trimmedSearchQuery = searchQuery.trim();
  const shouldShowSearchResults = trimmedSearchQuery.length >= 2;

  useEffect(() => {
    const preloadData = async () => {
      try {
        await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
          {},
          1,
          1000
        );
      } catch {
        // Warm-up only.
      }
    };

    preloadData();
  }, []);

  const fetchCustomers = async (letter: string) => {
    if (!letter) {
      return;
    }

    setIsCustomerLoading(true);
    try {
      const cacheKey = `customers_${letter}`;
      const cachedCustomers = apiCache.get(cacheKey) as
        | CustomerOption[]
        | undefined;

      if (cachedCustomers?.length) {
        setCustomers(cachedCustomers);
        return;
      }

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (!Array.isArray(response.data?.values)) {
        throw new Error("Invalid response from backend");
      }

      const customerData = response.data.values.slice(1) as string[][];
      const filteredCustomers = customerData
        .filter((row) => row[1]?.startsWith(letter))
        .map((row) => ({
          "Customer CODE": row[0] || "",
          "Customer NAME": row[1] || "",
        }))
        .sort((left, right) =>
          left["Customer NAME"].localeCompare(right["Customer NAME"])
        );

      setCustomers(filteredCustomers);
      apiCache.set(cacheKey, filteredCustomers);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch customers.";
      showFeedback({
        type: "error",
        title: "Customer Load Error",
        message,
        autoDismiss: false,
      });
    } finally {
      setIsCustomerLoading(false);
    }
  };

  const searchCustomers = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
          {},
          2,
          1500
        );

        if (!Array.isArray(response.data?.values)) {
          throw new Error("Invalid response from backend");
        }

        const customerData = response.data.values.slice(1) as string[][];
        const results = customerData
          .filter(
            (row) =>
              row[1]?.toLowerCase().includes(query.toLowerCase()) ||
              row[0]?.toLowerCase().includes(query.toLowerCase())
          )
          .map((row) => ({
            "Customer CODE": row[0] || "",
            "Customer NAME": row[1] || "",
          }))
          .sort((left, right) =>
            left["Customer NAME"].localeCompare(right["Customer NAME"])
          );

        setSearchResults(results);
      } catch {
        showFeedback({
          type: "error",
          title: "Search Error",
          message: "Failed to search customers. Please try again.",
          autoDismiss: true,
        });
      } finally {
        setIsSearching(false);
      }
    },
    [showFeedback]
  );

  useEffect(() => {
    if (trimmedSearchQuery.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (trimmedSearchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setBrowserExpanded(true);
    const timeout = setTimeout(() => {
      searchCustomers(trimmedSearchQuery);
    }, 280);

    return () => clearTimeout(timeout);
  }, [searchCustomers, trimmedSearchQuery]);

  const loadCustomerLedger = async (customer: CustomerOption) => {
    const customerName = customer["Customer NAME"];
    if (!customerName) {
      showFeedback({
        type: "error",
        title: "Invalid Customer",
        message: "Customer name is missing.",
        autoDismiss: true,
      });
      return;
    }

    try {
      setLedgerLoading(true);
      setSelectedCustomer(customer);
      setActiveTab("overview");
      setBrowserExpanded(false);
      const customerInitial = customerName.charAt(0).toUpperCase();
      setSelectedLetter(customerInitial);
      setSearchQuery("");
      setSearchResults([]);

      if (customerInitial && customerInitial !== selectedLetter) {
        void fetchCustomers(customerInitial);
      }

      const ledgerEntries = (await fetchCustomerLedger(customerName)) as LedgerEntry[];
      setLedgerData(Array.isArray(ledgerEntries) ? ledgerEntries : []);
    } catch {
      showFeedback({
        type: "error",
        title: "Ledger Load Failed",
        message: "Could not load customer ledger data. Please try again.",
        autoDismiss: false,
      });
      setLedgerData([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const customerStats = useMemo(
    () => (selectedCustomer ? calculateLedgerStats(ledgerData) : null),
    [selectedCustomer, ledgerData]
  );

  const sortedLedgerEntries = useMemo(() => {
    return [...ledgerData].sort((left, right) => {
      const leftDate = parseTransactionDate(left.Date);
      const rightDate = parseTransactionDate(right.Date);
      return rightDate - leftDate;
    });
  }, [ledgerData]);

  const historyGroups = useMemo<HistoryGroup[]>(() => {
    const groups = new Map<string, HistoryGroup>();

    sortedLedgerEntries.forEach((entry) => {
      const dateKey = entry.Date || "Undated";
      const amount = parseAmountValue(entry.Amount);
      const signedAmount = entry.DC === "C" ? -amount : amount;

      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: dateKey,
          transactions: [],
          totalAmount: 0,
        });
      }

      const group = groups.get(dateKey);
      if (!group) {
        return;
      }

      group.transactions.push(entry);
      group.totalAmount += signedAmount;
    });

    return Array.from(groups.values()).sort((left, right) => {
      return parseTransactionDate(right.date) - parseTransactionDate(left.date);
    });
  }, [sortedLedgerEntries]);

  const ledgerBuckets = useMemo<LedgerBucket[]>(() => {
    const buckets = new Map<string, LedgerBucket>();

    sortedLedgerEntries.forEach((entry) => {
      const key = entry.Description || "Other Transactions";
      const amount = parseAmountValue(entry.Amount);
      const existing = buckets.get(key);

      if (!existing) {
        buckets.set(key, {
          key,
          label: cleanDescription(key),
          count: 1,
          credit: entry.DC === "C" ? amount : 0,
          debit: entry.DC === "D" ? amount : 0,
          net: entry.DC === "D" ? amount : -amount,
          latestDate: entry.Date,
          latestVoucher: entry.VOUCHER_NUMBER,
        });
        return;
      }

      existing.count += 1;
      existing.credit += entry.DC === "C" ? amount : 0;
      existing.debit += entry.DC === "D" ? amount : 0;
      existing.net += entry.DC === "D" ? amount : -amount;

      if (
        parseTransactionDate(entry.Date) > parseTransactionDate(existing.latestDate)
      ) {
        existing.latestDate = entry.Date;
        existing.latestVoucher = entry.VOUCHER_NUMBER;
      }
    });

    return Array.from(buckets.values()).sort(
      (left, right) =>
        Math.max(right.credit, right.debit) - Math.max(left.credit, left.debit)
    );
  }, [sortedLedgerEntries]);

  const customerProfile = useMemo<CustomerProfile>(() => {
    const anchorEntry = sortedLedgerEntries[0];
    return {
      group: anchorEntry?.Customer_Group || "Not available",
      city: anchorEntry?.Customer_City || "Not available",
      mobile: anchorEntry?.Mobile || "Not available",
      gst: anchorEntry?.GST_Number || "Not available",
    };
  }, [sortedLedgerEntries]);

  const recentTransactions = useMemo(
    () => sortedLedgerEntries.slice(0, 4),
    [sortedLedgerEntries]
  );

  const uniqueVoucherCount = useMemo(() => {
    return new Set(
      sortedLedgerEntries
        .map((entry) => entry.VOUCHER_NUMBER)
        .filter((voucher) => Boolean(voucher))
    ).size;
  }, [sortedLedgerEntries]);

  const uniqueYears = useMemo(() => {
    return new Set(
      sortedLedgerEntries
        .map((entry) => entry.Company_Year)
        .filter((year) => Boolean(year))
    ).size;
  }, [sortedLedgerEntries]);

  const financialFamilies = useMemo<FinancialFamily[]>(() => {
    const families = {
      invoices: {
        key: "invoices",
        label: "Invoices",
        value: 0,
        count: 0,
        icon: "receipt-outline" as const,
        color: colors.accentBlue,
      },
      collections: {
        key: "collections",
        label: "Collections",
        value: 0,
        count: 0,
        icon: "arrow-down-circle-outline" as const,
        color: colors.accentGreen,
      },
      adjustments: {
        key: "adjustments",
        label: "Adjustments",
        value: 0,
        count: 0,
        icon: "git-compare-outline" as const,
        color: colors.accentOrange,
      },
    };

    sortedLedgerEntries.forEach((entry) => {
      const description = cleanDescription(entry.Description).toLowerCase();
      const amount = parseAmountValue(entry.Amount);

      if (description.includes("invoice")) {
        families.invoices.value += amount;
        families.invoices.count += 1;
      } else if (
        description.includes("payment") ||
        description.includes("receipt")
      ) {
        families.collections.value += amount;
        families.collections.count += 1;
      } else {
        families.adjustments.value += amount;
        families.adjustments.count += 1;
      }
    });

    return Object.values(families);
  }, [colors.accentBlue, colors.accentGreen, colors.accentOrange, sortedLedgerEntries]);

  const creditTotal = customerStats?.totalCreditRaw ?? 0;
  const debitTotal = customerStats?.totalDebitRaw ?? 0;
  const balanceAmount = Math.abs(creditTotal - debitTotal);
  const creditRatio =
    creditTotal + debitTotal > 0 ? creditTotal / (creditTotal + debitTotal) : 0.5;
  const debitRatio = 1 - creditRatio;

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
            ? "rgba(0,102,255,0.14)"
            : "rgba(15,23,42,0.06)",
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        },
        scrollContent: {
          paddingBottom: 40,
        },
        header: {
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
          paddingBottom: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        headerAction: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isDark ? colors.surfaceVariant : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        headerTextWrap: {
          flex: 1,
          paddingHorizontal: 16,
        },
        headerEyebrow: {
          color: colors.textSecondary,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
          marginBottom: 4,
        },
        headerTitle: {
          color: colors.text,
          fontSize: 24,
          lineHeight: 28,
          fontFamily: omaTypography.extrabold,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        contentSection: {
          paddingHorizontal: 20,
          gap: 18,
        },
        card: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.22 : 0.08,
          shadowRadius: 18,
          elevation: 3,
        },
        sectionEyebrow: {
          color: colors.textSecondary,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        sectionTitle: {
          color: colors.text,
          fontSize: 20,
          lineHeight: 24,
          fontFamily: omaTypography.extrabold,
          marginTop: 6,
        },
        sectionCopy: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        sectionHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        compactButton: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        compactButtonText: {
          color: colors.text,
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        searchWrap: {
          marginTop: 18,
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 6,
          gap: 10,
        },
        searchInput: {
          flex: 1,
          minHeight: 44,
          color: colors.text,
          fontSize: 15,
          fontFamily: omaTypography.medium,
        },
        helperRow: {
          marginTop: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        helperText: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
          flex: 1,
        },
        selectedPill: {
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: isDark
            ? "rgba(74,222,128,0.12)"
            : "rgba(34,197,94,0.10)",
        },
        selectedPillText: {
          color: colors.success,
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        },
        lettersWrap: {
          marginTop: 16,
        },
        lettersContent: {
          paddingRight: 12,
          gap: 10,
        },
        letterButton: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        letterButtonActive: {
          backgroundColor: colors.text,
          borderColor: colors.text,
        },
        letterButtonText: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.bold,
        },
        letterButtonTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        customerList: {
          marginTop: 18,
          gap: 12,
        },
        customerOption: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 14,
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        customerOptionActive: {
          borderColor: colors.accentBlue,
          backgroundColor: isDark
            ? "rgba(0,102,255,0.14)"
            : "rgba(0,102,255,0.08)",
        },
        customerAvatar: {
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: isDark ? colors.surfaceVariant : colors.surface,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
        },
        customerAvatarText: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.bold,
        },
        customerOptionBody: {
          flex: 1,
          gap: 2,
        },
        customerOptionName: {
          color: colors.text,
          fontSize: 15,
          lineHeight: 20,
          fontFamily: omaTypography.bold,
        },
        customerOptionCode: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        mutedState: {
          marginTop: 20,
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          alignItems: "center",
        },
        mutedStateText: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
          fontFamily: omaTypography.medium,
        },
        heroCard: {
          borderRadius: 32,
          padding: 22,
          backgroundColor: isDark ? colors.surface : "#0f172a",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: isDark ? colors.border : "rgba(255,255,255,0.08)",
        },
        heroGlowPrimary: {
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: 110,
          top: -80,
          right: -60,
          backgroundColor: "rgba(0,102,255,0.24)",
        },
        heroGlowSecondary: {
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: 90,
          bottom: -70,
          left: -20,
          backgroundColor: "rgba(74,222,128,0.18)",
        },
        heroContent: {
          position: "relative",
          zIndex: 1,
        },
        heroTopRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        },
        heroLabel: {
          color: "rgba(255,255,255,0.72)",
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        heroName: {
          color: "#ffffff",
          fontSize: 26,
          lineHeight: 30,
          fontFamily: omaTypography.extrabold,
          marginTop: 10,
        },
        heroMeta: {
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
          marginTop: 8,
        },
        statusBadge: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
        },
        statusBadgeCredit: {
          backgroundColor: "rgba(74,222,128,0.16)",
          borderColor: "rgba(74,222,128,0.28)",
        },
        statusBadgeDebit: {
          backgroundColor: "rgba(251,146,60,0.14)",
          borderColor: "rgba(251,146,60,0.28)",
        },
        statusBadgeText: {
          color: "#ffffff",
          fontSize: 11,
          fontFamily: omaTypography.bold,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        },
        heroBalance: {
          color: "#ffffff",
          fontSize: 34,
          lineHeight: 38,
          fontFamily: omaTypography.extrabold,
          marginTop: 26,
        },
        heroBalanceCaption: {
          color: "rgba(255,255,255,0.74)",
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
          marginTop: 8,
          maxWidth: "90%",
        },
        heroMetricRow: {
          marginTop: 22,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        heroMetricCard: {
          flexGrow: 1,
          minWidth: isWideLayout ? "31%" : "47%",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        heroMetricLabel: {
          color: "rgba(255,255,255,0.62)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: omaTypography.bold,
        },
        heroMetricValue: {
          color: "#ffffff",
          fontSize: 16,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
          marginTop: 6,
        },
        heroMetricMeta: {
          color: "rgba(255,255,255,0.68)",
          fontSize: 11,
          lineHeight: 15,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        tabWrap: {
          flexDirection: "row",
          backgroundColor: colors.cardMuted,
          borderRadius: 22,
          padding: 6,
          borderWidth: 1,
          borderColor: colors.border,
        },
        tabButton: {
          flex: 1,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 10,
          alignItems: "center",
        },
        tabButtonActive: {
          backgroundColor: colors.card,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.18 : 0.06,
          shadowRadius: 10,
          elevation: 2,
        },
        tabText: {
          color: colors.textSecondary,
          fontSize: 13,
          fontFamily: omaTypography.bold,
        },
        tabTextActive: {
          color: colors.text,
        },
        gridWrap: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginHorizontal: -6,
          marginTop: 4,
        },
        gridItem: {
          width: "50%",
          paddingHorizontal: 6,
          marginBottom: 12,
        },
        metricCard: {
          minHeight: 118,
          borderRadius: 22,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
        },
        metricCardLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.9,
          fontFamily: omaTypography.bold,
        },
        metricCardValue: {
          color: colors.text,
          fontSize: 18,
          lineHeight: 22,
          fontFamily: omaTypography.extrabold,
          marginTop: 10,
        },
        metricCardMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 16,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        panel: {
          borderRadius: 26,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          gap: 16,
        },
        panelHeader: {
          gap: 4,
        },
        panelTitle: {
          color: colors.text,
          fontSize: 18,
          lineHeight: 22,
          fontFamily: omaTypography.extrabold,
        },
        panelSubtitle: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
        },
        flowBar: {
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          flexDirection: "row",
          backgroundColor: colors.cardMuted,
        },
        flowCredit: {
          backgroundColor: colors.accentGreen,
        },
        flowDebit: {
          backgroundColor: colors.accentOrange,
        },
        flowLegendRow: {
          flexDirection: "row",
          gap: 10,
        },
        flowLegendCard: {
          flex: 1,
          borderRadius: 18,
          backgroundColor: colors.cardMuted,
          padding: 14,
          borderWidth: 1,
          borderColor: colors.border,
        },
        legendDotRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        },
        legendDot: {
          width: 10,
          height: 10,
          borderRadius: 5,
        },
        legendLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
        },
        legendValue: {
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.extrabold,
        },
        familyGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          marginHorizontal: -6,
        },
        familyItem: {
          width: "50%",
          paddingHorizontal: 6,
          marginBottom: 12,
        },
        familyCard: {
          borderRadius: 20,
          padding: 16,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 132,
        },
        familyIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        },
        familyLabel: {
          color: colors.text,
          fontSize: 14,
          lineHeight: 18,
          fontFamily: omaTypography.bold,
        },
        familyValue: {
          color: colors.text,
          fontSize: 16,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
          marginTop: 8,
        },
        familyMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 16,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        contextGrid: {
          gap: 12,
        },
        contextRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        contextRowLast: {
          paddingBottom: 0,
          borderBottomWidth: 0,
        },
        contextIcon: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        contextBody: {
          flex: 1,
        },
        contextLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        contextValue: {
          color: colors.text,
          fontSize: 14,
          lineHeight: 19,
          fontFamily: omaTypography.bold,
          marginTop: 4,
        },
        listWrap: {
          gap: 12,
        },
        transactionCard: {
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          gap: 12,
        },
        transactionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        },
        transactionTitle: {
          color: colors.text,
          fontSize: 14,
          lineHeight: 19,
          fontFamily: omaTypography.bold,
        },
        transactionMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 16,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        transactionAmountWrap: {
          alignItems: "flex-end",
          gap: 6,
        },
        transactionAmount: {
          fontSize: 15,
          lineHeight: 19,
          fontFamily: omaTypography.extrabold,
        },
        transactionDirectionBadge: {
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        transactionDirectionText: {
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontFamily: omaTypography.bold,
        },
        positiveText: {
          color: colors.accentGreen,
        },
        negativeText: {
          color: colors.accentOrange,
        },
        creditBadge: {
          backgroundColor: isDark
            ? "rgba(74,222,128,0.14)"
            : "rgba(34,197,94,0.12)",
        },
        debitBadge: {
          backgroundColor: isDark
            ? "rgba(251,146,60,0.14)"
            : "rgba(251,146,60,0.12)",
        },
        emptyTab: {
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 24,
          alignItems: "center",
        },
        emptyTabText: {
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
          fontFamily: omaTypography.medium,
        },
        bucketCard: {
          borderRadius: 24,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          gap: 14,
        },
        bucketHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        },
        bucketTitle: {
          color: colors.text,
          fontSize: 16,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
        },
        bucketSubtitle: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 17,
          fontFamily: omaTypography.medium,
          marginTop: 6,
        },
        bucketNet: {
          fontSize: 14,
          lineHeight: 18,
          fontFamily: omaTypography.extrabold,
          textAlign: "right",
        },
        bucketTotals: {
          flexDirection: "row",
          gap: 10,
        },
        bucketAmountCard: {
          flex: 1,
          borderRadius: 18,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
        },
        bucketAmountLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.7,
          fontFamily: omaTypography.bold,
        },
        bucketAmountValue: {
          color: colors.text,
          fontSize: 15,
          lineHeight: 19,
          fontFamily: omaTypography.extrabold,
          marginTop: 8,
        },
        historyGroup: {
          borderRadius: 24,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          gap: 14,
        },
        historyHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        },
        historyDate: {
          color: colors.text,
          fontSize: 16,
          lineHeight: 20,
          fontFamily: omaTypography.extrabold,
        },
        historyMeta: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 16,
          fontFamily: omaTypography.medium,
          marginTop: 4,
        },
        historyTotalBadge: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        historyTotalText: {
          fontSize: 12,
          fontFamily: omaTypography.bold,
        },
        historyList: {
          gap: 10,
        },
        historyRow: {
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        historyRowFirst: {
          paddingTop: 0,
          borderTopWidth: 0,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: "rgba(2,6,23,0.55)",
          justifyContent: "center",
          paddingHorizontal: 20,
        },
        modalCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 6,
        },
        modalHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        },
        modalTitle: {
          color: colors.text,
          fontSize: 20,
          lineHeight: 24,
          fontFamily: omaTypography.extrabold,
          flex: 1,
        },
        modalBalanceWrap: {
          marginTop: 18,
          borderRadius: 22,
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          alignItems: "center",
        },
        modalAmount: {
          fontSize: 28,
          lineHeight: 32,
          fontFamily: omaTypography.extrabold,
        },
        modalDescription: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
          fontFamily: omaTypography.medium,
          marginTop: 8,
        },
        modalGrid: {
          marginTop: 18,
          gap: 12,
        },
        modalRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        modalRowLast: {
          paddingBottom: 0,
          borderBottomWidth: 0,
        },
        modalLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          lineHeight: 16,
          fontFamily: omaTypography.bold,
          textTransform: "uppercase",
          letterSpacing: 0.7,
          width: "38%",
        },
        modalValue: {
          color: colors.text,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: omaTypography.medium,
          flex: 1,
          textAlign: "right",
        },
      }),
    [colors, insets.top, isDark, isWideLayout]
  );

  const renderCustomerOption = (customer: CustomerOption) => {
    const isActive =
      selectedCustomer?.["Customer CODE"] === customer["Customer CODE"];

    return (
      <TouchableOpacity
        key={`${customer["Customer CODE"]}-${customer["Customer NAME"]}`}
        style={[
          styles.customerOption,
          isActive ? styles.customerOptionActive : null,
        ]}
        onPress={() => loadCustomerLedger(customer)}
        activeOpacity={0.9}
      >
        <View style={styles.customerAvatar}>
          <Text style={styles.customerAvatarText}>
            {getInitials(customer["Customer NAME"])}
          </Text>
        </View>
        <View style={styles.customerOptionBody}>
          <Text numberOfLines={2} style={styles.customerOptionName}>
            {customer["Customer NAME"]}
          </Text>
          <Text style={styles.customerOptionCode}>
            Code {customer["Customer CODE"]}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={isActive ? colors.accentBlue : colors.textSecondary}
        />
      </TouchableOpacity>
    );
  };

  const renderTransactionCard = (
    transaction: LedgerEntry,
    addTopBorder: boolean
  ) => {
    const isCredit = transaction.DC === "C";
    const amountStyle = isCredit ? styles.positiveText : styles.negativeText;
    const badgeStyle = isCredit ? styles.creditBadge : styles.debitBadge;
    const badgeText = isCredit ? "Credit" : "Debit";

    return (
      <TouchableOpacity
        key={`${transaction.VOUCHER_NUMBER}-${transaction.Date}-${transaction.Amount}`}
        style={[styles.historyRow, addTopBorder ? null : styles.historyRowFirst]}
        activeOpacity={0.88}
        onPress={() => {
          setSelectedTransaction(transaction);
          setModalVisible(true);
        }}
      >
        <View style={styles.transactionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.transactionTitle}>
              {cleanDescription(transaction.Description)}
            </Text>
            <Text style={styles.transactionMeta}>
              {transaction.Date || "No date"}{" "}
              {transaction.VOUCHER_NUMBER
                ? `• Voucher ${transaction.VOUCHER_NUMBER}`
                : ""}
            </Text>
            <Text style={styles.transactionMeta}>
              {transaction.Company_Year || "Year unavailable"}
            </Text>
          </View>

          <View style={styles.transactionAmountWrap}>
            <Text style={[styles.transactionAmount, amountStyle]}>
              {badgeText.toUpperCase()} {formatCurrency(transaction.Amount)}
            </Text>
            <View style={[styles.transactionDirectionBadge, badgeStyle]}>
              <Text style={[styles.transactionDirectionText, amountStyle]}>
                {badgeText}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderOverviewTab = () => {
    if (ledgerLoading) {
      return (
        <View style={styles.emptyTab}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (!ledgerData.length) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabText}>
            No ledger lines are available for this customer yet.
          </Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.gridWrap}>
          <View style={styles.gridItem}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardLabel}>Total credits</Text>
              <Text style={styles.metricCardValue}>{formatCurrency(creditTotal)}</Text>
              <Text style={styles.metricCardMeta}>
                Collections and receipts posted
              </Text>
            </View>
          </View>
          <View style={styles.gridItem}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardLabel}>Total debits</Text>
              <Text style={styles.metricCardValue}>{formatCurrency(debitTotal)}</Text>
              <Text style={styles.metricCardMeta}>
                Invoice and debit-side exposure
              </Text>
            </View>
          </View>
          <View style={styles.gridItem}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardLabel}>Ledger lines</Text>
              <Text style={styles.metricCardValue}>{ledgerData.length}</Text>
              <Text style={styles.metricCardMeta}>
                {uniqueVoucherCount} voucher references tracked
              </Text>
            </View>
          </View>
          <View style={styles.gridItem}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardLabel}>Active years</Text>
              <Text style={styles.metricCardValue}>{uniqueYears || 1}</Text>
              <Text style={styles.metricCardMeta}>
                Latest movement {sortedLedgerEntries[0]?.Date || "not available"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionEyebrow}>Financial hierarchy</Text>
            <Text style={styles.panelTitle}>Credit and debit stack</Text>
            <Text style={styles.panelSubtitle}>
              Credits versus debits, then chunked by invoice, collections, and
              adjustment families.
            </Text>
          </View>

          <View style={styles.flowBar}>
            <View style={[styles.flowCredit, { flex: Math.max(creditRatio, 0.12) }]} />
            <View style={[styles.flowDebit, { flex: Math.max(debitRatio, 0.12) }]} />
          </View>

          <View style={styles.flowLegendRow}>
            <View style={styles.flowLegendCard}>
              <View style={styles.legendDotRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: colors.accentGreen }]}
                />
                <Text style={styles.legendLabel}>Credits</Text>
              </View>
              <Text style={styles.legendValue}>{formatCurrency(creditTotal)}</Text>
            </View>

            <View style={styles.flowLegendCard}>
              <View style={styles.legendDotRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: colors.accentOrange }]}
                />
                <Text style={styles.legendLabel}>Debits</Text>
              </View>
              <Text style={styles.legendValue}>{formatCurrency(debitTotal)}</Text>
            </View>
          </View>

          <View style={styles.familyGrid}>
            {financialFamilies.map((family) => (
              <View key={family.key} style={styles.familyItem}>
                <View style={styles.familyCard}>
                  <View
                    style={[
                      styles.familyIconWrap,
                      { backgroundColor: `${family.color}18` },
                    ]}
                  >
                    <Ionicons name={family.icon} size={18} color={family.color} />
                  </View>
                  <Text style={styles.familyLabel}>{family.label}</Text>
                  <Text style={styles.familyValue}>
                    {formatCurrency(family.value)}
                  </Text>
                  <Text style={styles.familyMeta}>
                    {family.count} matching documents
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionEyebrow}>Client context</Text>
            <Text style={styles.panelTitle}>Profile anchors from the live ledger</Text>
          </View>

          <View style={styles.contextGrid}>
            {[
              {
                key: "group",
                label: "Customer group",
                value: customerProfile.group,
                icon: "albums-outline" as const,
              },
              {
                key: "city",
                label: "City",
                value: customerProfile.city,
                icon: "location-outline" as const,
              },
              {
                key: "mobile",
                label: "Mobile",
                value: customerProfile.mobile,
                icon: "call-outline" as const,
              },
              {
                key: "gst",
                label: "GST number",
                value: customerProfile.gst,
                icon: "document-text-outline" as const,
              },
            ].map((item, index, items) => (
              <View
                key={item.key}
                style={[
                  styles.contextRow,
                  index === items.length - 1 ? styles.contextRowLast : null,
                ]}
              >
                <View style={styles.contextIcon}>
                  <Ionicons name={item.icon} size={18} color={colors.accentBlue} />
                </View>
                <View style={styles.contextBody}>
                  <Text style={styles.contextLabel}>{item.label}</Text>
                  <Text style={styles.contextValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionEyebrow}>Latest movement</Text>
            <Text style={styles.panelTitle}>Recent transaction cues</Text>
          </View>

          <View style={styles.listWrap}>
            {recentTransactions.map((transaction, index) => (
              <View key={`${transaction.VOUCHER_NUMBER}-${index}`} style={styles.transactionCard}>
                <View style={styles.transactionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.transactionTitle}>
                      {cleanDescription(transaction.Description)}
                    </Text>
                    <Text style={styles.transactionMeta}>
                      {transaction.Date || "No date"}{" "}
                      {transaction.VOUCHER_NUMBER
                        ? `• Voucher ${transaction.VOUCHER_NUMBER}`
                        : ""}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.transactionAmount,
                      transaction.DC === "C"
                        ? styles.positiveText
                        : styles.negativeText,
                    ]}
                  >
                    {transaction.DC === "C" ? "CR" : "DR"}{" "}
                    {formatCurrency(transaction.Amount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </>
    );
  };

  const renderLedgerTab = () => {
    if (ledgerLoading) {
      return (
        <View style={styles.emptyTab}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (!ledgerBuckets.length) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabText}>
            Ledger hierarchy will appear here once entries are loaded.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.listWrap}>
        {ledgerBuckets.map((bucket) => (
          <View key={bucket.key} style={styles.bucketCard}>
            <View style={styles.bucketHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bucketTitle}>{bucket.label}</Text>
                <Text style={styles.bucketSubtitle}>
                  {bucket.count} entries • latest {bucket.latestDate || "No date"}
                </Text>
              </View>

              <Text
                style={[
                  styles.bucketNet,
                  bucket.net <= 0 ? styles.positiveText : styles.negativeText,
                ]}
              >
                {bucket.net <= 0 ? "CR" : "DR"} {formatCurrency(Math.abs(bucket.net))}
              </Text>
            </View>

            <View style={styles.bucketTotals}>
              <View style={styles.bucketAmountCard}>
                <Text style={styles.bucketAmountLabel}>Credits</Text>
                <Text style={[styles.bucketAmountValue, styles.positiveText]}>
                  {formatCurrency(bucket.credit)}
                </Text>
              </View>

              <View style={styles.bucketAmountCard}>
                <Text style={styles.bucketAmountLabel}>Debits</Text>
                <Text style={[styles.bucketAmountValue, styles.negativeText]}>
                  {formatCurrency(bucket.debit)}
                </Text>
              </View>
            </View>

            {bucket.latestVoucher ? (
              <Text style={styles.bucketSubtitle}>
                Most recent voucher: {bucket.latestVoucher}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const renderHistoryTab = () => {
    if (ledgerLoading) {
      return (
        <View style={styles.emptyTab}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (!historyGroups.length) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabText}>
            No transaction history is available for this customer.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.listWrap}>
        {historyGroups.map((group) => (
          <View key={group.date} style={styles.historyGroup}>
            <View style={styles.historyHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>{group.date}</Text>
                <Text style={styles.historyMeta}>
                  {group.transactions.length} transaction
                  {group.transactions.length === 1 ? "" : "s"}
                </Text>
              </View>

              <View style={styles.historyTotalBadge}>
                <Text
                  style={[
                    styles.historyTotalText,
                    group.totalAmount <= 0
                      ? styles.positiveText
                      : styles.negativeText,
                  ]}
                >
                  {group.totalAmount <= 0 ? "CR" : "DR"}{" "}
                  {formatCurrency(Math.abs(group.totalAmount))}
                </Text>
              </View>
            </View>

            <View style={styles.historyList}>
              {group.transactions.map((transaction, index) =>
                renderTransactionCard(transaction, index > 0)
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.back()}
            activeOpacity={0.9}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>Customer finance</Text>
            <Text style={styles.headerTitle}>Client summary</Text>
            <Text style={styles.headerSubtitle}>
              Search, inspect the live ledger, and read the customer at mobile
              detail depth.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerAction}
            onPress={toggleTheme}
            activeOpacity={0.9}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.contentSection}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionEyebrow}>Client lookup</Text>
                <Text style={styles.sectionTitle}>Open a customer summary</Text>
                <Text style={styles.sectionCopy}>
                  Search directly or browse the master list by initial, then dive
                  into the live financial detail.
                </Text>
              </View>

              {selectedCustomer && !shouldShowSearchResults ? (
                <TouchableOpacity
                  style={styles.compactButton}
                  onPress={() => setBrowserExpanded((current) => !current)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.compactButtonText}>
                    {browserExpanded ? "Hide list" : "Switch"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.searchWrap}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search customer by name or code"
                placeholderTextColor={colors.textPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {trimmedSearchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setIsSearching(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.helperRow}>
              <Text style={styles.helperText}>
                {shouldShowSearchResults
                  ? "Typing against the full customer master."
                  : selectedLetter
                    ? `Showing customers under ${selectedLetter}.`
                    : "Choose a letter to load the corresponding customers."}
              </Text>

              {selectedCustomer ? (
                <View style={styles.selectedPill}>
                  <Text style={styles.selectedPillText}>
                    Active: {selectedCustomer["Customer CODE"]}
                  </Text>
                </View>
              ) : null}
            </View>

            {isSearching ? (
              <View style={styles.mutedState}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : shouldShowSearchResults ? (
              searchResults.length ? (
                <View style={styles.customerList}>
                  {searchResults.map(renderCustomerOption)}
                </View>
              ) : (
                <View style={styles.mutedState}>
                  <Text style={styles.mutedStateText}>
                    No customers matched "{trimmedSearchQuery}".
                  </Text>
                </View>
              )
            ) : (
              <>
                <View style={styles.lettersWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.lettersContent}
                  >
                    {ALPHABET.map((letter) => {
                      const isActive = selectedLetter === letter;
                      return (
                        <TouchableOpacity
                          key={letter}
                          style={[
                            styles.letterButton,
                            isActive ? styles.letterButtonActive : null,
                          ]}
                          onPress={() => {
                            setSelectedLetter(letter);
                            setBrowserExpanded(true);
                            fetchCustomers(letter);
                          }}
                          activeOpacity={0.88}
                        >
                          <Text
                            style={[
                              styles.letterButtonText,
                              isActive ? styles.letterButtonTextActive : null,
                            ]}
                          >
                            {letter}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {isCustomerLoading ? (
                  <View style={styles.mutedState}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : browserExpanded || !selectedCustomer ? (
                  customers.length ? (
                    <View style={styles.customerList}>
                      {customers.map(renderCustomerOption)}
                    </View>
                  ) : (
                    <View style={styles.mutedState}>
                      <Text style={styles.mutedStateText}>
                        {selectedLetter
                          ? `No customers were returned for ${selectedLetter}.`
                          : "Select an initial to begin browsing."}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.mutedState}>
                    <Text style={styles.mutedStateText}>
                      Viewing {selectedCustomer["Customer NAME"]}. Expand the list
                      whenever you want to switch customers.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {selectedCustomer ? (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroGlowPrimary} />
                <View style={styles.heroGlowSecondary} />

                <View style={styles.heroContent}>
                  <View style={styles.heroTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroLabel}>Client detail view</Text>
                      <Text style={styles.heroName}>
                        {selectedCustomer["Customer NAME"]}
                      </Text>
                      <Text style={styles.heroMeta}>
                        ID {selectedCustomer["Customer CODE"]} •{" "}
                        {customerProfile.group}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        customerStats?.hasCredit
                          ? styles.statusBadgeCredit
                          : styles.statusBadgeDebit,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {customerStats?.hasCredit ? "CR balance" : "DR balance"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.heroBalance}>{formatCurrency(balanceAmount)}</Text>
                  <Text style={styles.heroBalanceCaption}>
                    {customerStats?.hasCredit
                      ? "Credits currently outweigh debits on this live ledger."
                      : "Debit exposure currently outweighs posted credits."}
                  </Text>

                  <View style={styles.heroMetricRow}>
                    <View style={styles.heroMetricCard}>
                      <Text style={styles.heroMetricLabel}>Credits</Text>
                      <Text style={styles.heroMetricValue}>
                        {formatCurrency(creditTotal)}
                      </Text>
                      <Text style={styles.heroMetricMeta}>Collected or adjusted in</Text>
                    </View>

                    <View style={styles.heroMetricCard}>
                      <Text style={styles.heroMetricLabel}>Debits</Text>
                      <Text style={styles.heroMetricValue}>
                        {formatCurrency(debitTotal)}
                      </Text>
                      <Text style={styles.heroMetricMeta}>Invoices or debit-side out</Text>
                    </View>

                    <View style={styles.heroMetricCard}>
                      <Text style={styles.heroMetricLabel}>Activity</Text>
                      <Text style={styles.heroMetricValue}>{ledgerData.length}</Text>
                      <Text style={styles.heroMetricMeta}>
                        lines • {sortedLedgerEntries[0]?.Date || "No date"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.tabWrap}>
                {[
                  { key: "overview", label: "Overview" },
                  { key: "ledger", label: "Ledger" },
                  { key: "history", label: "History" },
                ].map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
                      onPress={() => setActiveTab(tab.key as DetailTab)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[styles.tabText, isActive ? styles.tabTextActive : null]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {activeTab === "overview"
                ? renderOverviewTab()
                : activeTab === "ledger"
                  ? renderLedgerTab()
                  : renderHistoryTab()}
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction detail</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {selectedTransaction ? (
              <>
                <View style={styles.modalBalanceWrap}>
                  <Text
                    style={[
                      styles.modalAmount,
                      selectedTransaction.DC === "C"
                        ? styles.positiveText
                        : styles.negativeText,
                    ]}
                  >
                    {selectedTransaction.DC === "C" ? "CR" : "DR"}{" "}
                    {formatCurrency(selectedTransaction.Amount)}
                  </Text>
                  <Text style={styles.modalDescription}>
                    {cleanDescription(selectedTransaction.Description)}
                  </Text>
                </View>

                <View style={styles.modalGrid}>
                  {[
                    ["Date", selectedTransaction.Date || "Not available"],
                    [
                      "Voucher",
                      selectedTransaction.VOUCHER_NUMBER || "Not available",
                    ],
                    [
                      "Company year",
                      selectedTransaction.Company_Year || "Not available",
                    ],
                    [
                      "Customer code",
                      selectedTransaction.Customer_CODE || "Not available",
                    ],
                    [
                      "Customer group",
                      selectedTransaction.Customer_Group || "Not available",
                    ],
                    ["City", selectedTransaction.Customer_City || "Not available"],
                    ["GST", selectedTransaction.GST_Number || "Not available"],
                    ["Mobile", selectedTransaction.Mobile || "Not available"],
                  ].map(([label, value], index, items) => (
                    <View
                      key={label}
                      style={[
                        styles.modalRow,
                        index === items.length - 1 ? styles.modalRowLast : null,
                      ]}
                    >
                      <Text style={styles.modalLabel}>{label}</Text>
                      <Text style={styles.modalValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default CustomerSummaryScreen;
