import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FLOATING_NAV_SPACE } from "@/components/oma/OmaFloatingNav";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useFeedback } from "@/context/FeedbackContext";
import { ThemeContext } from "@/context/ThemeContext";
import {
  apiCache,
  BACKEND_URL,
  fetchWithRetry,
  preloadData,
  wakeUpServer,
} from "@/utils/apiManager";
import { omaTypography } from "@/utils/typography";
import {
  AnalyticsPayload,
  AttentionItem,
  ComparisonMetric,
  FinancialAccount,
  FocusSignal,
  ProductGroupInsight,
  RepInsight,
  SourceInsight,
  Timeframe,
  ToneKey,
  ViewMode,
  buildAnalyticsPayload,
  buildManagerAnalyticsModel,
  buildSparklineArea,
  buildSparklinePath,
  formatCurrencyLabel,
  formatDurationHours,
  formatLastUpdated,
  formatRatio,
  getSparklineMarker,
  hydrateAnalyticsPayload,
} from "@/utils/managerAnalytics";

const CACHE_KEY = "analyticsPayloadV2";

type HeroConfig = {
  label: string;
  chip: string;
  value: string;
  deltaText: string;
  subtitle: string;
  stats: { label: string; value: string }[];
};

type MetricTile = {
  label: string;
  value: string;
  detail: string;
  tone: ToneKey;
};

const paletteMap: Record<
  ViewMode,
  {
    accent: string;
    fillStart: string;
    fillEnd: string;
    glow: string;
  }
> = {
  overview: {
    accent: "#0066FF",
    fillStart: "rgba(0,102,255,0.28)",
    fillEnd: "rgba(0,102,255,0)",
    glow: "rgba(0,102,255,0.22)",
  },
  revenue: {
    accent: "#16a34a",
    fillStart: "rgba(34,197,94,0.24)",
    fillEnd: "rgba(34,197,94,0)",
    glow: "rgba(34,197,94,0.20)",
  },
  execution: {
    accent: "#fb923c",
    fillStart: "rgba(251,146,60,0.26)",
    fillEnd: "rgba(251,146,60,0)",
    glow: "rgba(251,146,60,0.22)",
  },
};

function AnalyticsScreen() {
  const { colors, isDark } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [userRole, setUserRole] = useState("Manager");
  const [timeframe, setTimeframe] = useState<Timeframe>("QTD");
  const [view, setView] = useState<ViewMode>("overview");
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isWideLayout = width >= 420;

  const loadAnalytics = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const storedRole = await AsyncStorage.getItem("userRole");
        if (storedRole) {
          setUserRole(storedRole);
        }

        const cachedPayload = apiCache.get(CACHE_KEY) as AnalyticsPayload | null;
        if (!forceRefresh && cachedPayload?.groupedOrders?.length) {
          setPayload(hydrateAnalyticsPayload(cachedPayload));
          setLoading(false);
          return;
        }

        await wakeUpServer();
        await preloadData();

        const results = await Promise.allSettled([
          fetchWithRetry(`${BACKEND_URL}/api/sheets/New_Order_Table!A2:Q`, {}, 2, 1500),
          fetchWithRetry(`${BACKEND_URL}/api/sheets/Customer_Ledger_2!A1:L`, {}, 2, 1500),
          fetchWithRetry(`${BACKEND_URL}/api/sheets/Customer_Master!A1:C`, {}, 2, 1500),
          fetchWithRetry(`${BACKEND_URL}/api/sheets/Product_Master!A1:F`, {}, 2, 1500),
        ]);

        const readValues = (result: PromiseSettledResult<any>) =>
          result.status === "fulfilled" && Array.isArray(result.value.data?.values)
            ? (result.value.data.values as string[][])
            : [];

        const orderValues = readValues(results[0]);
        const ledgerValues = readValues(results[1]);

        if (!orderValues.length && !ledgerValues.length) {
          throw new Error("No analytics rows were returned from the backend.");
        }

        const nextPayload = buildAnalyticsPayload({
          orderValues,
          ledgerValues,
          customerValues: readValues(results[2]),
          productValues: readValues(results[3]),
        });

        setPayload(nextPayload);
        apiCache.set(CACHE_KEY, nextPayload);
      } catch (error: any) {
        showFeedback({
          type: "error",
          title: "Analytics Error",
          message:
            error?.message || "Could not load analytics. Pull down to retry.",
          autoDismiss: true,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showFeedback]
  );

  useFocusEffect(
    useCallback(() => {
      void loadAnalytics();
    }, [loadAnalytics])
  );

  const model = useMemo(
    () => buildManagerAnalyticsModel(payload, timeframe),
    [payload, timeframe]
  );

  const palette = paletteMap[view];
  const trend = model.trends[view];
  const sparklinePath = useMemo(() => buildSparklinePath(trend), [trend]);
  const sparklineArea = useMemo(() => buildSparklineArea(sparklinePath), [sparklinePath]);
  const sparklineMarker = useMemo(() => getSparklineMarker(trend), [trend]);

  const toneStyles = useMemo(
    () =>
      ({
        blue: {
          bg: isDark ? "rgba(0,102,255,0.18)" : "rgba(0,102,255,0.10)",
          text: colors.accentBlue,
          dot: colors.accentBlue,
        },
        green: {
          bg: isDark ? "rgba(74,222,128,0.18)" : "rgba(34,197,94,0.12)",
          text: colors.accentGreen,
          dot: colors.accentGreen,
        },
        orange: {
          bg: isDark ? "rgba(251,146,60,0.18)" : "rgba(251,146,60,0.12)",
          text: colors.accentOrange,
          dot: colors.accentOrange,
        },
        red: {
          bg: isDark ? "rgba(248,113,113,0.18)" : "rgba(239,68,68,0.10)",
          text: colors.accentRed,
          dot: colors.accentRed,
        },
      }) satisfies Record<ToneKey, { bg: string; text: string; dot: string }>,
    [colors, isDark]
  );

  const formatComparison = useCallback(
    (comparison: ComparisonMetric, variant: "default" | "rate" = "default") => {
      if (variant === "rate") {
        if (comparison.delta === 0) {
          return "Flat vs previous period";
        }

        const prefix = comparison.delta > 0 ? "+" : "";
        return `${prefix}${comparison.delta.toFixed(0)} pts vs previous period`;
      }

      if (comparison.deltaPercent === null) {
        return comparison.current > 0 ? "Fresh activity vs previous period" : "Flat vs previous period";
      }

      if (comparison.deltaPercent === 0) {
        return "Flat vs previous period";
      }

      const prefix = comparison.deltaPercent > 0 ? "+" : "";
      return `${prefix}${Math.round(comparison.deltaPercent)}% vs previous period`;
    },
    []
  );

  const overviewHero = useMemo<HeroConfig>(
    () => ({
      label: `${timeframe} booked demand`,
      chip: `${model.summary.orderCount} orders in motion`,
      value: formatCurrencyLabel(model.summary.totalValue),
      deltaText: formatComparison(model.comparisons.booked),
      subtitle: `Open value ${formatCurrencyLabel(model.summary.openValue)} • ${model.summary.pendingApprovals} approvals waiting • ${formatCurrencyLabel(model.financial.ninetyExposure)} in 90+ AR`,
      stats: [
        {
          label: "Dispatch rate",
          value: formatRatio(model.summary.dispatchRate),
        },
        {
          label: "Collections",
          value: formatCurrencyLabel(model.periodFinancial.collectedValue),
        },
        {
          label: "Avg cycle",
          value: formatDurationHours(model.summary.avgDispatchHours),
        },
      ],
    }),
    [formatComparison, model, timeframe]
  );

  const revenueHero = useMemo<HeroConfig>(
    () => ({
      label: "Live receivable book",
      chip: `${formatRatio(model.financial.collectionRate)} collection rate`,
      value: formatCurrencyLabel(model.financial.totalExposure),
      deltaText: formatComparison(model.comparisons.collections),
      subtitle: `${formatCurrencyLabel(model.financial.highRiskExposure)} is older than 60 days • Avg age ${Math.round(
        model.financial.averageAgeDays
      )} days`,
      stats: [
        {
          label: "This period",
          value: formatCurrencyLabel(model.periodFinancial.collectedValue),
        },
        {
          label: "Current bucket",
          value: formatCurrencyLabel(model.financial.currentExposure),
        },
        {
          label: "90+ bucket",
          value: formatCurrencyLabel(model.financial.ninetyExposure),
        },
      ],
    }),
    [formatComparison, model]
  );

  const executionHero = useMemo<HeroConfig>(
    () => ({
      label: "Order-to-dispatch tempo",
      chip: `${formatRatio(model.summary.dispatchRate)} dispatched`,
      value: formatDurationHours(model.summary.avgDispatchHours),
      deltaText: formatComparison(model.comparisons.dispatchRate, "rate"),
      subtitle: `${model.summary.agedPendingApprovals} approvals are stale • ${model.summary.agedDispatchQueue} dispatches are aging • ${model.summary.highValueOpenOrders} high-value orders still open`,
      stats: [
        {
          label: "Approval queue",
          value: String(model.summary.pendingApprovals),
        },
        {
          label: "Ready queue",
          value: String(model.summary.pendingDispatches),
        },
        {
          label: "Active reps",
          value: String(model.summary.activeReps),
        },
      ],
    }),
    [formatComparison, model]
  );

  const overviewMetrics = useMemo<MetricTile[]>(
    () => [
      {
        label: "Open value",
        value: formatCurrencyLabel(model.summary.openValue),
        detail: `${model.summary.highValueOpenOrders} high-value open orders`,
        tone: "blue",
      },
      {
        label: "Pending approvals",
        value: String(model.summary.pendingApprovals),
        detail: `${formatCurrencyLabel(model.summary.pendingApprovalValue)} waiting review`,
        tone: model.summary.agedPendingApprovals > 0 ? "red" : "orange",
      },
      {
        label: "Active accounts",
        value: String(model.summary.activeCustomers),
        detail: `${model.summary.activeReps} reps contributed`,
        tone: "green",
      },
      {
        label: "Collections",
        value: formatCurrencyLabel(model.periodFinancial.collectedValue),
        detail: formatComparison(model.comparisons.collections),
        tone: "orange",
      },
    ],
    [formatComparison, model]
  );

  const revenueMetrics = useMemo<MetricTile[]>(
    () => [
      {
        label: "Collection rate",
        value: formatRatio(model.financial.collectionRate),
        detail: `${formatCurrencyLabel(model.periodFinancial.collectedValue)} captured in ${timeframe}`,
        tone: "green",
      },
      {
        label: "61-90 days",
        value: formatCurrencyLabel(model.financial.sixtyExposure),
        detail: "Debt entering high-risk aging",
        tone: "orange",
      },
      {
        label: "90+ exposure",
        value: formatCurrencyLabel(model.financial.ninetyExposure),
        detail: "Needs escalated follow-up",
        tone: model.financial.ninetyExposure > 0 ? "red" : "green",
      },
      {
        label: "Top account share",
        value: formatRatio(
          model.financial.totalExposure > 0 && model.financial.topCustomers[0]
            ? (model.financial.topCustomers[0].exposure / model.financial.totalExposure) * 100
            : 0
        ),
        detail: model.financial.topCustomers[0]
          ? `${model.financial.topCustomers[0].name} leads the exposure book`
          : "No concentration detected",
        tone: "blue",
      },
    ],
    [model, timeframe]
  );

  const executionMetrics = useMemo<MetricTile[]>(
    () => [
      {
        label: "Aged approvals",
        value: String(model.summary.agedPendingApprovals),
        detail: `${formatCurrencyLabel(model.summary.pendingApprovalValue)} is waiting manager action`,
        tone: model.summary.agedPendingApprovals > 0 ? "red" : "green",
      },
      {
        label: "Ready to dispatch",
        value: String(model.summary.pendingDispatches),
        detail: `${formatCurrencyLabel(model.summary.pendingDispatchValue)} is staged in ops`,
        tone: model.summary.agedDispatchQueue > 0 ? "orange" : "blue",
      },
      {
        label: "Avg open age",
        value: formatDurationHours(model.summary.averageOpenAgeHours),
        detail: "Measures how long open orders sit in the queue",
        tone: "orange",
      },
      {
        label: "High-value open",
        value: String(model.summary.highValueOpenOrders),
        detail: `Threshold set at ${formatCurrencyLabel(model.summary.highValueThreshold)}`,
        tone: "blue",
      },
    ],
    [model]
  );

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
          height: 280,
          backgroundColor: isDark ? "rgba(0,102,255,0.16)" : "rgba(0,102,255,0.08)",
        },
        scrollContent: {
          paddingTop: insets.top + 12,
          paddingBottom: FLOATING_NAV_SPACE + Math.max(insets.bottom, 12) + 14,
        },
        shell: {
          width: "100%",
          maxWidth: 560,
          alignSelf: "center",
          paddingHorizontal: 16,
        },
        headerCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 10,
        },
        headerTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 16,
        },
        profileBlock: {
          flex: 1,
        },
        profileRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        },
        avatar: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: isDark ? colors.surfaceVariant : "#dcecff",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
        },
        avatarText: {
          color: colors.primary,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.7,
          marginBottom: 2,
        },
        profileName: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 19,
        },
        profileMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginTop: 4,
        },
        headerActions: {
          flexDirection: "row",
          gap: 10,
        },
        actionButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        alertDot: {
          position: "absolute",
          top: 10,
          right: 10,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.accentRed,
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        },
        titleIcon: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          alignItems: "center",
          justifyContent: "center",
        },
        titleWrap: {
          flex: 1,
        },
        title: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          letterSpacing: -1,
        },
        subtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
        },
        headerMetaInline: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        controlCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        controlGroup: {
          marginBottom: 12,
        },
        controlGroupLast: {
          marginBottom: 0,
        },
        controlLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        segmentedRow: {
          flexDirection: "row",
          gap: 8,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderRadius: 20,
          padding: 4,
        },
        segmentButton: {
          flex: 1,
          minHeight: 42,
          borderRadius: 16,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 10,
          flexDirection: "row",
          gap: 6,
        },
        segmentButtonActive: {
          backgroundColor: isDark ? colors.text : "#111111",
        },
        segmentText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        segmentTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        heroCard: {
          backgroundColor: isDark ? "#09111f" : "#0f172a",
          borderRadius: 30,
          paddingTop: 20,
          paddingHorizontal: 20,
          paddingBottom: 14,
          marginBottom: 14,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: isDark ? 0.22 : 0.18,
          shadowRadius: 30,
          elevation: 10,
        },
        heroGlow: {
          position: "absolute",
          top: -34,
          right: -18,
          width: 180,
          height: 180,
          borderRadius: 90,
        },
        heroTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        },
        heroLabel: {
          color: "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
        },
        heroChip: {
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.10)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
        },
        heroChipText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
        },
        heroValue: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 38,
          letterSpacing: -1.6,
          marginBottom: 6,
        },
        heroDelta: {
          fontFamily: omaTypography.semibold,
          fontSize: 12,
          marginBottom: 10,
        },
        heroSubtitle: {
          color: "rgba(255,255,255,0.74)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          paddingRight: 18,
          marginBottom: 16,
        },
        heroStatRow: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 14,
        },
        heroStatCard: {
          flex: 1,
          borderRadius: 18,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        },
        heroStatLabel: {
          color: "rgba(255,255,255,0.56)",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        heroStatValue: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        sparklineShell: {
          height: 88,
          marginHorizontal: -20,
          marginBottom: -14,
        },
        sectionCard: {
          backgroundColor: colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        sectionHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        },
        sectionTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
        },
        sectionHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          textAlign: "right",
        },
        signalGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        signalCard: {
          width: isWideLayout ? "48.8%" : "100%",
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.cardMuted,
        },
        signalIconWrap: {
          width: 34,
          height: 34,
          borderRadius: 17,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 12,
        },
        signalLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        signalHeadline: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 16,
          lineHeight: 22,
          marginBottom: 6,
        },
        signalDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        metricGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
        },
        metricCard: {
          width: isWideLayout ? "48.8%" : "48.2%",
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        metricDot: {
          width: 10,
          height: 10,
          borderRadius: 5,
          marginBottom: 10,
        },
        metricLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        metricValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 22,
          letterSpacing: -0.7,
          marginBottom: 4,
        },
        metricDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        pipelineRow: {
          marginBottom: 14,
        },
        pipelineHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        },
        pipelineLabel: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        pipelineMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        progressTrack: {
          height: 10,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          overflow: "hidden",
        },
        progressFill: {
          height: "100%",
          borderRadius: 999,
        },
        listRow: {
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        listRowFirst: {
          borderTopWidth: 0,
          paddingTop: 0,
        },
        listHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 6,
        },
        listTitleWrap: {
          flex: 1,
        },
        listTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          lineHeight: 19,
          marginBottom: 4,
        },
        listMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        listDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        listValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 14,
        },
        pill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          alignSelf: "flex-start",
          marginBottom: 8,
        },
        pillText: {
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        },
        agingTrack: {
          flexDirection: "row",
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 14,
        },
        agingSegment: {
          height: "100%",
        },
        agingGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        agingCard: {
          flexGrow: 1,
          minWidth: isWideLayout ? "31%" : "47.6%",
          borderRadius: 20,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        agingLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        },
        agingValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          letterSpacing: -0.6,
          marginBottom: 4,
        },
        agingMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        rankBadge: {
          width: 28,
          height: 28,
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 10,
        },
        rankText: {
          fontFamily: omaTypography.bold,
          fontSize: 12,
        },
        leaderboardRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        leaderboardRowFirst: {
          borderTopWidth: 0,
          paddingTop: 0,
        },
        leaderboardContent: {
          flex: 1,
        },
        leaderboardName: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 4,
        },
        leaderboardMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        leaderboardValueWrap: {
          alignItems: "flex-end",
          minWidth: 112,
        },
        leaderboardValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 14,
          marginBottom: 4,
        },
        leaderboardSecondary: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          textAlign: "right",
        },
        activityRow: {
          flexDirection: "row",
          gap: 12,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        activityRowFirst: {
          borderTopWidth: 0,
          paddingTop: 0,
        },
        activityIconWrap: {
          width: 38,
          height: 38,
          borderRadius: 19,
          justifyContent: "center",
          alignItems: "center",
          marginTop: 2,
        },
        activityContent: {
          flex: 1,
        },
        activityTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginBottom: 4,
        },
        activityDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
          marginBottom: 4,
        },
        activityTime: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        },
        emptyCard: {
          alignItems: "center",
          justifyContent: "center",
          padding: 26,
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 280,
        },
        emptyTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 19,
          marginTop: 12,
          marginBottom: 8,
        },
        emptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          textAlign: "center",
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.42)",
          justifyContent: "flex-end",
          padding: 16,
        },
        sheetCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          maxHeight: "82%",
          overflow: "hidden",
        },
        sheetHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 18,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        sheetTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 18,
        },
        sheetAction: {
          color: colors.primary,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        sheetScroll: {
          padding: 18,
          paddingBottom: Math.max(insets.bottom, 18),
        },
      }),
    [colors, insets.bottom, insets.top, isDark, isWideLayout]
  );

  const renderHero = (config: HeroConfig) => (
    <View style={styles.heroCard}>
      <View style={[styles.heroGlow, { backgroundColor: palette.glow }]} />

      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>{config.label}</Text>
        </View>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipText}>{config.chip}</Text>
        </View>
      </View>

      <Text style={styles.heroValue}>{config.value}</Text>
      <Text
        style={[
          styles.heroDelta,
          {
            color:
              config.deltaText.startsWith("+")
                ? "#4ade80"
                : config.deltaText.startsWith("-")
                ? "#f87171"
                : "rgba(255,255,255,0.74)",
          },
        ]}
      >
        {config.deltaText}
      </Text>
      <Text style={styles.heroSubtitle}>{config.subtitle}</Text>

      <View style={styles.heroStatRow}>
        {config.stats.map((stat) => (
          <View key={stat.label} style={styles.heroStatCard}>
            <Text style={styles.heroStatLabel}>{stat.label}</Text>
            <Text style={styles.heroStatValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sparklineShell}>
        <Svg height="88" width="100%" viewBox="0 0 300 88">
          <Defs>
            <LinearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={palette.fillStart} />
              <Stop offset="100%" stopColor={palette.fillEnd} />
            </LinearGradient>
          </Defs>
          {sparklineArea ? <Path d={sparklineArea} fill="url(#heroFill)" /> : null}
          {sparklinePath ? (
            <Path
              d={sparklinePath}
              fill="none"
              stroke={palette.accent}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
            />
          ) : null}
          <Circle
            cx={sparklineMarker.x}
            cy={sparklineMarker.y}
            fill={palette.accent}
            r={4}
          />
        </Svg>
      </View>
    </View>
  );

  const renderMetrics = (metrics: MetricTile[]) => (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metricCard}>
          <View
            style={[
              styles.metricDot,
              { backgroundColor: toneStyles[metric.tone].dot },
            ]}
          />
          <Text style={styles.metricLabel}>{metric.label}</Text>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricDetail}>{metric.detail}</Text>
        </View>
      ))}
    </View>
  );

  const renderFocusSignals = (signals: FocusSignal[]) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Manager signals</Text>
        <Text style={styles.sectionHint}>What needs attention first</Text>
      </View>

      <View style={styles.signalGrid}>
        {signals.map((signal) => {
          const tone = toneStyles[signal.tone];
          return (
            <View
              key={signal.id}
              style={[styles.signalCard, { backgroundColor: tone.bg }]}
            >
              <View
                style={[
                  styles.signalIconWrap,
                  { backgroundColor: colors.card },
                ]}
              >
                <Ionicons
                  color={tone.text}
                  name={
                    signal.tone === "red"
                      ? "alert-circle-outline"
                      : signal.tone === "orange"
                      ? "hourglass-outline"
                      : signal.tone === "blue"
                      ? "git-compare-outline"
                      : "checkmark-circle-outline"
                  }
                  size={18}
                />
              </View>
              <Text style={styles.signalLabel}>{signal.label}</Text>
              <Text style={styles.signalHeadline}>{signal.headline}</Text>
              <Text style={styles.signalDetail}>{signal.detail}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderPipeline = () => {
    const peakValue = Math.max(...model.pipeline.map((stage) => stage.value), 1);

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pipeline health</Text>
          <Text style={styles.sectionHint}>Value and count by stage</Text>
        </View>

        {model.pipeline.map((stage, index) => {
          const tone = toneStyles[stage.tone];
          return (
            <View
              key={stage.label}
              style={[styles.pipelineRow, index === model.pipeline.length - 1 && { marginBottom: 0 }]}
            >
              <View style={styles.pipelineHeader}>
                <Text style={styles.pipelineLabel}>{stage.label}</Text>
                <Text style={styles.pipelineMeta}>
                  {stage.count} orders • {formatCurrencyLabel(stage.value)}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max((stage.value / peakValue) * 100, stage.value > 0 ? 8 : 0)}%`,
                      backgroundColor: tone.dot,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAttentionQueue = (items: AttentionItem[]) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Attention queue</Text>
        <Text style={styles.sectionHint}>Highest-value interruptions first</Text>
      </View>

      {items.length ? (
        items.map((item, index) => {
          const tone = toneStyles[item.tone];
          return (
            <View
              key={item.id}
              style={[
                styles.listRow,
                index === 0 && styles.listRowFirst,
              ]}
            >
              <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.pillText, { color: tone.text }]}>
                  {item.tone === "red"
                    ? "Critical"
                    : item.tone === "orange"
                    ? "Watch"
                    : "Monitor"}
                </Text>
              </View>

              <View style={styles.listHeader}>
                <View style={styles.listTitleWrap}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listMeta}>
                    {item.orderId} • {item.meta}
                  </Text>
                </View>
                <Text style={styles.listValue}>{formatCurrencyLabel(item.amount)}</Text>
              </View>
              <Text style={styles.listDetail}>{item.detail}</Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.metricDetail}>
          Nothing in the action queue right now.
        </Text>
      )}
    </View>
  );

  const renderActivityFeed = () => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent movement</Text>
        <Text style={styles.sectionHint}>Updated {formatLastUpdated(payload?.lastUpdatedAt || null)}</Text>
      </View>

      {model.activities.length ? (
        model.activities.map((activity, index) => {
          const tone = toneStyles[activity.tone];
          return (
            <View
              key={activity.id}
              style={[
                styles.activityRow,
                index === 0 && styles.activityRowFirst,
              ]}
            >
              <View style={[styles.activityIconWrap, { backgroundColor: tone.bg }]}>
                <Ionicons color={tone.text} name={activity.icon as any} size={18} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityDetail}>{activity.detail}</Text>
                <Text style={styles.activityTime}>{activity.timeLabel}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.metricDetail}>
          No tracked order movement in this timeframe yet.
        </Text>
      )}
    </View>
  );

  const renderTopAccounts = (accounts: FinancialAccount[]) => {
    const peakExposure = Math.max(...accounts.map((account) => account.exposure), 1);

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top exposure accounts</Text>
          <Text style={styles.sectionHint}>Use this for collections follow-up</Text>
        </View>

        {accounts.length ? (
          accounts.map((account, index) => (
            <View
              key={`${account.code}-${account.name}`}
              style={[
                styles.listRow,
                index === 0 && styles.listRowFirst,
              ]}
            >
              <View style={styles.listHeader}>
                <View style={styles.listTitleWrap}>
                  <Text style={styles.listTitle}>{account.name}</Text>
                  <Text style={styles.listMeta}>
                    {account.code || "No code"} •{" "}
                    {account.contact || account.customerGroup || "No contact"}
                  </Text>
                </View>
                <Text style={styles.listValue}>
                  {formatCurrencyLabel(account.exposure)}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max((account.exposure / peakExposure) * 100, 8)}%`,
                      backgroundColor: toneStyles.red.dot,
                    },
                  ]}
                />
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.metricDetail}>No receivable exposure detected.</Text>
        )}
      </View>
    );
  };

  const renderSourceMix = (sources: SourceInsight[]) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Source mix</Text>
        <Text style={styles.sectionHint}>Booked value by channel</Text>
      </View>

      {sources.length ? (
        sources.slice(0, 5).map((source, index) => {
          const tone =
            index === 0 ? toneStyles.blue : index === 1 ? toneStyles.orange : toneStyles.green;

          return (
            <View
              key={source.label}
              style={[
                styles.listRow,
                index === 0 && styles.listRowFirst,
              ]}
            >
              <View style={styles.listHeader}>
                <View style={styles.listTitleWrap}>
                  <Text style={styles.listTitle}>{source.label}</Text>
                  <Text style={styles.listMeta}>
                    {source.orderCount} orders • avg ticket {formatCurrencyLabel(source.avgTicket)}
                  </Text>
                </View>
                <Text style={styles.listValue}>
                  {formatCurrencyLabel(source.totalAmount)}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(source.share * 100, 8)}%`,
                      backgroundColor: tone.dot,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.metricDetail}>No source data in this period.</Text>
      )}
    </View>
  );

  const renderProductMix = (groups: ProductGroupInsight[]) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Product mix</Text>
        <Text style={styles.sectionHint}>Value concentration by category</Text>
      </View>

      {groups.length ? (
        groups.slice(0, 5).map((group, index) => {
          const tone =
            index === 0 ? toneStyles.green : index === 1 ? toneStyles.blue : toneStyles.orange;

          return (
            <View
              key={group.label}
              style={[
                styles.listRow,
                index === 0 && styles.listRowFirst,
              ]}
            >
              <View style={styles.listHeader}>
                <View style={styles.listTitleWrap}>
                  <Text style={styles.listTitle}>{group.label}</Text>
                  <Text style={styles.listMeta}>
                    {group.orderCount} orders • {Math.round(group.units)} units
                  </Text>
                </View>
                <Text style={styles.listValue}>
                  {formatCurrencyLabel(group.totalAmount)}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(group.share * 100, 8)}%`,
                      backgroundColor: tone.dot,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.metricDetail}>No product categories found for this timeframe.</Text>
      )}
    </View>
  );

  const renderTeamExecution = (reps: RepInsight[]) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Rep execution</Text>
        <Text style={styles.sectionHint}>Who is closing flow and who is carrying backlog</Text>
      </View>

      {reps.length ? (
        reps.slice(0, 5).map((rep, index) => {
          const tone =
            index === 0 ? toneStyles.green : index === 1 ? toneStyles.blue : toneStyles.orange;

          return (
            <View
              key={rep.name}
              style={[
                styles.leaderboardRow,
                index === 0 && styles.leaderboardRowFirst,
              ]}
            >
              <View style={[styles.rankBadge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.rankText, { color: tone.text }]}>{index + 1}</Text>
              </View>

              <View style={styles.leaderboardContent}>
                <Text style={styles.leaderboardName}>{rep.name}</Text>
                <Text style={styles.leaderboardMeta}>
                  {rep.orderCount} orders • {rep.activeCustomers} accounts • stalled{" "}
                  {formatCurrencyLabel(rep.stalledValue)}
                </Text>
              </View>

              <View style={styles.leaderboardValueWrap}>
                <Text style={styles.leaderboardValue}>
                  {formatCurrencyLabel(rep.totalAmount)}
                </Text>
                <Text style={styles.leaderboardSecondary}>
                  {formatRatio(rep.dispatchRate)} dispatch
                </Text>
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.metricDetail}>No rep contribution data in this period.</Text>
      )}
    </View>
  );

  const renderAgingBuckets = () => {
    const segments = [
      {
        label: "0-30",
        value: model.financial.currentExposure,
        tone: "green" as const,
      },
      {
        label: "31-60",
        value: model.financial.thirtyExposure,
        tone: "blue" as const,
      },
      {
        label: "61-90",
        value: model.financial.sixtyExposure,
        tone: "orange" as const,
      },
      {
        label: "90+",
        value: model.financial.ninetyExposure,
        tone: "red" as const,
      },
    ];

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>A/R aging ladder</Text>
          <Text style={styles.sectionHint}>Live book, not period-only</Text>
        </View>

        <View style={styles.agingTrack}>
          {segments.map((segment) => (
            <View
              key={segment.label}
              style={[
                styles.agingSegment,
                {
                  width: `${
                    model.financial.totalExposure > 0
                      ? Math.max((segment.value / model.financial.totalExposure) * 100, segment.value > 0 ? 6 : 0)
                      : 25
                  }%`,
                  backgroundColor: toneStyles[segment.tone].dot,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.agingGrid}>
          {segments.map((segment) => (
            <View key={segment.label} style={styles.agingCard}>
              <Text style={styles.agingLabel}>{segment.label} days</Text>
              <Text style={styles.agingValue}>
                {formatCurrencyLabel(segment.value)}
              </Text>
              <Text style={styles.agingMeta}>
                {model.financial.totalExposure > 0
                  ? formatRatio((segment.value / model.financial.totalExposure) * 100)
                  : "0%"}{" "}
                of exposure
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderOverviewView = () => (
    <>
      {renderHero(overviewHero)}
      {renderFocusSignals(model.focusSignals)}
      {renderMetrics(overviewMetrics)}
      {renderPipeline()}
      {renderAttentionQueue(model.attentionItems)}
      {renderActivityFeed()}
    </>
  );

  const renderRevenueView = () => (
    <>
      {renderHero(revenueHero)}
      {renderAgingBuckets()}
      {renderMetrics(revenueMetrics)}
      {renderTopAccounts(model.financial.topCustomers)}
      {renderSourceMix(model.sources)}
      {renderProductMix(model.productGroups)}
    </>
  );

  const renderExecutionView = () => (
    <>
      {renderHero(executionHero)}
      {renderMetrics(executionMetrics)}
      {renderPipeline()}
      {renderTeamExecution(model.reps)}
      {renderAttentionQueue(model.attentionItems)}
      {renderActivityFeed()}
    </>
  );

  const selectedViewContent =
    view === "overview"
      ? renderOverviewView()
      : view === "revenue"
      ? renderRevenueView()
      : renderExecutionView();

  if (loading && !payload) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.topGlow} />
        <LoadingIndicator message="Loading manager analytics..." showTips={true} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={() => loadAnalytics(true)}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.profileBlock}>
                <View style={styles.profileRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(userRole || "M").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Good morning</Text>
                    <Text style={styles.profileName}>
                      {userRole === "Manager" ? "Sarah Jenkins" : `${userRole} Workspace`}
                    </Text>
                    <Text style={styles.profileMeta}>
                      Orders, cash exposure, and execution risk in one place.
                    </Text>
                  </View>
                </View>

                <View style={styles.titleRow}>
                  <View style={styles.titleIcon}>
                    <Ionicons
                      color={colors.primary}
                      name="stats-chart-outline"
                      size={18}
                    />
                  </View>
                  <View style={styles.titleWrap}>
                    <Text style={styles.title}>Command Centre</Text>
                    <Text style={styles.subtitle}>
                      Manager analytics built from orders, ledger, customer, and product sheets.
                    </Text>
                  </View>
                </View>

                <Text style={styles.headerMetaInline}>
                  Updated {formatLastUpdated(payload?.lastUpdatedAt || null)} •{" "}
                  {model.summary.orderCount} tracked orders in {timeframe}
                </Text>
              </View>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => router.push("/(app)/customer-summary")}
                  style={styles.actionButton}
                >
                  <Ionicons color={colors.text} name="search-outline" size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setSheetOpen(true)}
                  style={styles.actionButton}
                >
                  <Ionicons
                    color={colors.text}
                    name="notifications-outline"
                    size={18}
                  />
                  {model.attentionItems.length ? <View style={styles.alertDot} /> : null}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.controlCard}>
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Perspective</Text>
              <View style={styles.segmentedRow}>
                {[
                  {
                    id: "overview" as const,
                    label: "Overview",
                    icon: "stats-chart-outline" as const,
                  },
                  {
                    id: "revenue" as const,
                    label: "Revenue",
                    icon: "cash-outline" as const,
                  },
                  {
                    id: "execution" as const,
                    label: "Execution",
                    icon: "flash-outline" as const,
                  },
                ].map((item) => {
                  const active = view === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.88}
                      onPress={() => setView(item.id)}
                      style={[
                        styles.segmentButton,
                        active && styles.segmentButtonActive,
                      ]}
                    >
                      <Ionicons
                        color={
                          active
                            ? isDark
                              ? colors.background
                              : "#ffffff"
                            : colors.textSecondary
                        }
                        name={item.icon}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          active && styles.segmentTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.controlGroupLast}>
              <Text style={styles.controlLabel}>Timeframe</Text>
              <View style={styles.segmentedRow}>
                {(["MTD", "QTD", "YTD"] as Timeframe[]).map((item) => {
                  const active = timeframe === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      activeOpacity={0.88}
                      onPress={() => setTimeframe(item)}
                      style={[
                        styles.segmentButton,
                        active && styles.segmentButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active && styles.segmentTextActive,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {model.summary.orderCount > 0 ? (
            selectedViewContent
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons
                color={colors.textPlaceholder}
                name="stats-chart-outline"
                size={52}
              />
              <Text style={styles.emptyTitle}>No analytics in this period</Text>
              <Text style={styles.emptyBody}>
                Switch the timeframe or refresh after the backend warms up.
                This screen only shows live data that exists inside the selected
                period.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={sheetOpen}
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSheetOpen(false)}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => undefined}
            style={styles.sheetCard}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Priority feed</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)}>
                <Text style={styles.sheetAction}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetScroll}>
              {model.focusSignals.length ? renderFocusSignals(model.focusSignals) : null}
              {renderAttentionQueue(model.attentionItems)}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default AnalyticsScreen;
