import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Image,
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
  buildAnalyticsPayload,
  buildManagerAnalyticsModelFromCommandCenterPayload,
  buildManagerAnalyticsModel,
  ComparisonMetric,
  FinancialAccount,
  ProductGroupInsight,
  RepInsight,
  SourceInsight,
  Timeframe,
  ToneKey,
  ViewMode,
  buildSparklineArea,
  buildSparklinePath,
  formatCurrencyLabel,
  formatDurationHours,
  formatLastUpdated,
  formatRatio,
  getSparklineMarker,
  hydrateAnalyticsPayload,
} from "@/utils/managerAnalytics";
import {
  commandCenterRepository,
  type CommandCenterPayload,
} from "@/utils/commandCenterRepository";

const CACHE_KEY = "analyticsPayloadV2";
const NOTIFICATION_DISMISSED_KEY = "analyticsDismissedNotificationsV1";

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

type OwnerAction = {
  id: string;
  icon: string;
  label: string;
  headline: string;
  detail: string;
  value: string;
  tone: ToneKey;
  onPress: () => void;
};

type AnalyticsNotification = {
  id: string;
  title: string;
  meta: string;
  amount: number;
  tone: ToneKey;
  icon: string;
  view: ViewMode;
};

const paletteMap: Record<
  ViewMode,
  {
    accent: string;
    fillStart: string;
    fillEnd: string;
  }
> = {
  overview: {
    accent: "#0A84FF",
    fillStart: "rgba(10,132,255,0.24)",
    fillEnd: "rgba(10,132,255,0)",
  },
  revenue: {
    accent: "#16a34a",
    fillStart: "rgba(34,197,94,0.24)",
    fillEnd: "rgba(34,197,94,0)",
  },
  execution: {
    accent: "#fb923c",
    fillStart: "rgba(251,146,60,0.26)",
    fillEnd: "rgba(251,146,60,0)",
  },
};

const formatAttentionDetail = (detail: string) =>
  detail
    .split("•")
    .map((part) => part.trim().replace(/_/g, " "))
    .filter(Boolean)
    .join(" • ");

const getNotificationIcon = (item: AttentionItem) => {
  const detail = item.detail.toLowerCase();

  if (item.tone === "red" || detail.includes("rejected")) {
    return "alert-circle-outline";
  }

  if (detail.includes("dispatch")) {
    return "cube-outline";
  }

  if (detail.includes("approval")) {
    return "shield-checkmark-outline";
  }

  return "notifications-outline";
};

const getNotificationView = (item: AttentionItem): ViewMode => {
  const searchable = `${item.title} ${item.detail}`.toLowerCase();

  if (
    searchable.includes("receivable") ||
    searchable.includes("collection") ||
    searchable.includes("debt") ||
    searchable.includes("ar")
  ) {
    return "revenue";
  }

  return "execution";
};

function AnalyticsScreen() {
  const { colors, isDark } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [userRole, setUserRole] = useState("Manager");
  const [timeframe, setTimeframe] = useState<Timeframe>("QTD");
  const [view, setView] = useState<ViewMode>("overview");
  const [payload, setPayload] = useState<CommandCenterPayload | null>(null);
  const [legacyPayload, setLegacyPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [draftView, setDraftView] = useState<ViewMode>("overview");
  const [draftTimeframe, setDraftTimeframe] = useState<Timeframe>("QTD");
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);

  const isWideLayout = width >= 420;
  const isDesktop = width >= 900;

  useEffect(() => {
    if (controlsOpen) {
      setDraftView(view);
      setDraftTimeframe(timeframe);
    }
  }, [controlsOpen, timeframe, view]);

  const openControls = useCallback(() => {
    setDraftView(view);
    setDraftTimeframe(timeframe);
    setControlsOpen(true);
  }, [timeframe, view]);

  const applyControls = useCallback(() => {
    setView(draftView);
    setTimeframe(draftTimeframe);
    setControlsOpen(false);
  }, [draftTimeframe, draftView]);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(NOTIFICATION_DISMISSED_KEY)
      .then((value) => {
        if (!mounted || !value) {
          return;
        }

        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          setDismissedNotificationIds(
            parsed.filter((item): item is string => typeof item === "string")
          );
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const persistDismissedNotifications = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    setDismissedNotificationIds(uniqueIds);

    try {
      await AsyncStorage.setItem(
        NOTIFICATION_DISMISSED_KEY,
        JSON.stringify(uniqueIds)
      );
    } catch {
      // Notification read state is a convenience; analytics data remains intact.
    }
  }, []);

  const loadLegacyAnalytics = useCallback(
    async (forceRefresh = false) => {
      const cachedPayload = apiCache.get(CACHE_KEY) as AnalyticsPayload | null;
      if (!forceRefresh && cachedPayload?.groupedOrders?.length) {
        setLegacyPayload(hydrateAnalyticsPayload(cachedPayload));
        setPayload(null);
        return;
      }

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

      setLegacyPayload(nextPayload);
      setPayload(null);
      apiCache.set(CACHE_KEY, nextPayload);
    },
    []
  );

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

        await wakeUpServer();
        await preloadData();
        try {
          const nextPayload = await commandCenterRepository.getManagerPayload(
            timeframe,
            { skipCache: forceRefresh }
          );
          setPayload(nextPayload);
          setLegacyPayload(null);
        } catch (repoError) {
          console.warn("Derived analytics unavailable, falling back to raw payload.", repoError);
          await loadLegacyAnalytics(forceRefresh);
        }
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
    [loadLegacyAnalytics, showFeedback, timeframe]
  );

  useFocusEffect(
    useCallback(() => {
      void loadAnalytics();
    }, [loadAnalytics])
  );

  const model = useMemo(
    () =>
      payload
        ? buildManagerAnalyticsModelFromCommandCenterPayload(payload, timeframe)
        : buildManagerAnalyticsModel(legacyPayload, timeframe),
    [legacyPayload, payload, timeframe]
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
          bg: isDark ? "rgba(234,179,8,0.16)" : "rgba(234,179,8,0.12)",
          text: colors.accentGold,
          dot: colors.accentGold,
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

  const primaryAttention = model.attentionItems[0] || null;

  const ownerActions = useMemo<OwnerAction[]>(
    () => [
      {
        id: "attention",
        icon: "alert-circle-outline",
        label: "Clear first",
        headline: primaryAttention
          ? primaryAttention.title
          : "No critical queue item",
        detail: primaryAttention
          ? `${primaryAttention.meta} • ${primaryAttention.detail}`
          : "Orders, dispatch, and collections are inside expected thresholds.",
        value: primaryAttention
          ? formatCurrencyLabel(primaryAttention.amount)
          : "0 open",
        tone: primaryAttention?.tone || "green",
        onPress: () => setSheetOpen(true),
      },
      {
        id: "collections",
        icon: "cash-outline",
        label: "Protect cash",
        headline:
          model.financial.ninetyExposure > 0
            ? "90+ receivables need owner follow-up"
            : "No 90+ receivable exposure",
        detail: model.financial.topCustomers[0]
          ? `${model.financial.topCustomers[0].name} leads exposure at ${formatCurrencyLabel(
              model.financial.topCustomers[0].exposure
            )}`
          : "Customer account snapshot has no open exposure.",
        value: formatCurrencyLabel(model.financial.ninetyExposure),
        tone: model.financial.ninetyExposure > 0 ? "red" : "green",
        onPress: () => setView("revenue"),
      },
      {
        id: "dispatch",
        icon: "flash-outline",
        label: "Move ops",
        headline:
          model.summary.agedDispatchQueue > 0
            ? "Dispatch queue is aging"
            : "Dispatch queue is under control",
        detail: `${model.summary.pendingDispatches} ready orders • ${formatCurrencyLabel(
          model.summary.pendingDispatchValue
        )} staged`,
        value: `${model.summary.agedDispatchQueue} aged`,
        tone: model.summary.agedDispatchQueue > 0 ? "orange" : "blue",
        onPress: () => setView("execution"),
      },
    ],
    [model, primaryAttention]
  );

  const dismissedNotificationSet = useMemo(
    () => new Set(dismissedNotificationIds),
    [dismissedNotificationIds]
  );

  const notificationItems = useMemo<AnalyticsNotification[]>(
    () =>
      model.attentionItems.map((item) => ({
        id: item.id,
        title: item.title,
        meta: [formatAttentionDetail(item.detail), item.meta]
          .filter(Boolean)
          .join(" • "),
        amount: item.amount,
        tone: item.tone,
        icon: getNotificationIcon(item),
        view: getNotificationView(item),
      })),
    [model.attentionItems]
  );

  const activeNotifications = useMemo(
    () =>
      notificationItems.filter(
        (item) => !dismissedNotificationSet.has(item.id)
      ),
    [dismissedNotificationSet, notificationItems]
  );

  const visibleNotifications = useMemo(
    () => activeNotifications.slice(0, 3),
    [activeNotifications]
  );

  const notificationCount = activeNotifications.length;

  const markAllNotificationsRead = useCallback(() => {
    persistDismissedNotifications([
      ...dismissedNotificationIds,
      ...notificationItems.map((item) => item.id),
    ]);
  }, [
    dismissedNotificationIds,
    notificationItems,
    persistDismissedNotifications,
  ]);

  const handleNotificationPress = useCallback(
    (notification: AnalyticsNotification) => {
      setView(notification.view);
      setSheetOpen(false);
      persistDismissedNotifications([
        ...dismissedNotificationIds,
        notification.id,
      ]);
    },
    [dismissedNotificationIds, persistDismissedNotifications]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: isDark ? "#111111" : colors.background,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 180,
          backgroundColor: isDark
            ? "rgba(234,179,8,0.025)"
            : "rgba(234,179,8,0.025)",
        },
        scrollContent: {
          paddingTop: isDesktop
            ? Math.max(insets.top, 0) + 32
            : Math.max(insets.top, 0) + 56,
          paddingBottom: FLOATING_NAV_SPACE + Math.max(insets.bottom, 12) + 14,
        },
        shell: {
          width: "100%",
          maxWidth: isDesktop ? 1120 : 414,
          alignSelf: "center",
          paddingHorizontal: isDesktop ? 32 : 24,
        },
        headerCard: {
          backgroundColor: isDark ? "#1C1C1E" : colors.card,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.05)" : colors.border,
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
          fontFamily: omaTypography.bold,
          fontSize: 16,
        },
        eyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.bold,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 2,
        },
        profileName: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 17,
          letterSpacing: -0.3,
        },
        profileMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
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
        notificationBadge: {
          position: "absolute",
          top: -3,
          right: -6,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          paddingHorizontal: 5,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accentRed,
        },
        notificationBadgeText: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          lineHeight: 14,
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
          fontFamily: omaTypography.bold,
          fontSize: 22,
          letterSpacing: -0.6,
          lineHeight: 27,
        },
        subtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
        },
        headerMetaInline: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        commandHeader: {
          backgroundColor: "transparent",
          borderRadius: 0,
          borderWidth: 0,
          borderColor: "transparent",
          padding: 0,
          marginBottom: 18,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        },
        commandTopRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 4,
        },
        ownerIdentityRow: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 44,
        },
        ownerAvatar: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.07)" : colors.border,
        },
        ownerAvatarImage: {
          width: 38,
          height: 38,
          borderRadius: 19,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        },
        ownerAvatarText: {
          color: "#EAB308",
          fontFamily: omaTypography.bold,
          fontSize: 14,
        },
        ownerRoleText: {
          color: "#a1a1aa",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          marginBottom: 1,
        },
        ownerRoleRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        ownerNameText: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 17,
          letterSpacing: -0.3,
        },
        analyticsTitleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 0,
        },
        commandEyebrow: {
          color: "#EAB308",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          textTransform: "uppercase",
          lineHeight: 18,
          marginBottom: 2,
        },
        commandTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 22,
          letterSpacing: -0.6,
          lineHeight: 27,
        },
        commandSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          marginTop: 8,
          marginBottom: 12,
        },
        commandIconButton: {
          minWidth: 44,
          minHeight: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : colors.border,
        },
        utilityPill: {
          minHeight: 44,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 10,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 18,
          backgroundColor: colors.appChromeMuted,
        },
        utilityPillButton: {
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        },
        titleActionCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
        },
        commandMetaRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 2,
        },
        commandMetaPill: {
          minHeight: 34,
          borderRadius: 999,
          paddingHorizontal: 11,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.07)" : colors.border,
        },
        commandMetaText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
        },
        controlCard: {
          backgroundColor: isDark ? "#1C1C1E" : colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.05)" : colors.border,
          padding: 10,
          marginBottom: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 26,
          elevation: 9,
        },
        controlGroup: {
          marginBottom: 8,
        },
        controlGroupLast: {
          marginBottom: 0,
        },
        controlLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        segmentedRow: {
          flexDirection: "row",
          gap: 6,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderRadius: 18,
          padding: 3,
        },
        segmentButton: {
          flex: 1,
          minHeight: 38,
          borderRadius: 15,
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
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          paddingTop: 20,
          paddingHorizontal: 18,
          paddingBottom: 12,
          marginBottom: 14,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: isDark ? 0.22 : 0.18,
          shadowRadius: 30,
          elevation: 10,
        },
        heroTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        },
        heroLabel: {
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          textTransform: "uppercase",
        },
        heroChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        heroChipText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        heroValue: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 22,
          letterSpacing: -0.6,
          lineHeight: 27,
          marginBottom: 6,
        },
        heroDelta: {
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          lineHeight: 17,
          marginBottom: 10,
        },
        heroSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          paddingRight: 18,
          marginBottom: 16,
        },
        heroStatRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        },
        heroStatCard: {
          width: isWideLayout ? "31.7%" : "48.3%",
          minHeight: 62,
          borderRadius: 17,
          paddingHorizontal: 12,
          paddingVertical: 11,
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        heroStatCardWide: {
          width: isWideLayout ? "31.7%" : "100%",
        },
        heroStatLabel: {
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 5,
        },
        heroStatValue: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
        },
        sparklineShell: {
          height: 88,
          marginHorizontal: -18,
          marginBottom: -12,
        },
        sectionCard: {
          backgroundColor: isDark ? "#1C1C1E" : colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.05)" : colors.border,
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
          fontFamily: omaTypography.bold,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 24,
        },
        sectionHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          textAlign: "right",
        },
        actionDeck: {
          gap: 10,
        },
        ownerActionCard: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
          minHeight: 116,
        },
        ownerActionTop: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        },
        ownerActionIdentity: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flex: 1,
        },
        ownerActionIcon: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
        },
        ownerActionLabel: {
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          textTransform: "uppercase",
        },
        ownerActionValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
          textAlign: "right",
        },
        ownerActionHeadline: {
          color: colors.text,
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
          marginBottom: 5,
        },
        ownerActionDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        priorityCard: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
          backgroundColor: isDark ? "#1C1C1E" : colors.card,
          marginBottom: 14,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: isDark ? 0.18 : 0.08,
          shadowRadius: 20,
          elevation: 7,
        },
        priorityTop: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        },
        priorityIdentity: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flex: 1,
        },
        priorityIcon: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
        },
        priorityLabel: {
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          letterSpacing: 0.96,
          lineHeight: 18,
          textTransform: "uppercase",
        },
        priorityCount: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          lineHeight: 17,
        },
        priorityHeadline: {
          color: colors.text,
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
          marginBottom: 5,
        },
        priorityDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        priorityFooter: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
        },
        priorityFooterText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        shortcutRow: {
          flexDirection: "row",
          gap: 10,
          marginBottom: 14,
        },
        shortcutButton: {
          flex: 1,
          minHeight: 48,
          borderRadius: 17,
          paddingHorizontal: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? "#1C1C1E" : colors.card,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
        },
        shortcutText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
          marginTop: 4,
        },
        targetRow: {
          paddingVertical: 13,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
        },
        targetRowFirst: {
          paddingTop: 0,
          borderTopWidth: 0,
        },
        targetHeader: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        },
        targetName: {
          color: colors.text,
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
        },
        targetMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          marginTop: 3,
        },
        targetValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          textAlign: "right",
        },
        targetVariance: {
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          lineHeight: 17,
          textAlign: "right",
          marginTop: 3,
        },
        sheetHealthGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        sheetHealthCard: {
          width: isWideLayout ? "48.8%" : "48.2%",
          minHeight: 88,
          borderRadius: 20,
          padding: 13,
          backgroundColor: isDark ? "#242426" : colors.cardMuted,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
        },
        sheetHealthTop: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 9,
        },
        sheetHealthDot: {
          width: 9,
          height: 9,
          borderRadius: 5,
        },
        sheetHealthLabel: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        sheetHealthRange: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        sheetHealthCount: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
          marginTop: 7,
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
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 6,
        },
        signalHeadline: {
          color: colors.text,
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
          marginBottom: 6,
        },
        signalDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
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
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 6,
        },
        metricValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
          marginBottom: 4,
        },
        metricDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
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
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 24,
        },
        pipelineMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
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
          fontFamily: omaTypography.regular,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 21,
          marginBottom: 4,
        },
        listMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        listDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        listValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
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
          fontSize: 12,
          letterSpacing: 0.96,
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
          color: "#71717a",
          fontFamily: omaTypography.bold,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.96,
          lineHeight: 18,
          marginBottom: 6,
        },
        agingValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          letterSpacing: -0.2,
          lineHeight: 24,
          marginBottom: 4,
        },
        agingMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
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
          fontSize: 15,
          marginBottom: 4,
        },
        leaderboardMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        leaderboardValueWrap: {
          alignItems: "flex-end",
          minWidth: 112,
        },
        leaderboardValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          marginBottom: 4,
        },
        leaderboardSecondary: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
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
          fontFamily: omaTypography.medium,
          fontSize: 15,
          letterSpacing: -0.3,
          marginBottom: 2,
        },
        activityDetail: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          marginBottom: 4,
        },
        activityTime: {
          color: "#71717a",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
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
          fontSize: 17,
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
        filterBackdrop: {
          justifyContent: "center",
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(insets.bottom, 24),
        },
        sheetCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          maxHeight: "82%",
          overflow: "hidden",
        },
        filterSheetCard: {
          alignSelf: "center",
          width: "100%",
          maxWidth: 390,
          maxHeight: "72%",
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
          fontSize: 17,
        },
        sheetAction: {
          color: colors.primary,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        sheetScroll: {
          padding: 18,
          paddingBottom: Math.max(insets.bottom, 18),
        },
        notificationSummary: {
          marginBottom: 14,
        },
        notificationSummaryTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 17,
          letterSpacing: -0.4,
          lineHeight: 24,
        },
        notificationSummaryBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          marginTop: 3,
        },
        notificationRow: {
          minHeight: 72,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
        },
        notificationRowFirst: {
          borderTopWidth: 0,
          paddingTop: 0,
        },
        notificationIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
        },
        notificationContent: {
          flex: 1,
          minWidth: 0,
        },
        notificationTitle: {
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 15,
          letterSpacing: -0.3,
          lineHeight: 19,
          marginBottom: 3,
        },
        notificationMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
        },
        notificationValueWrap: {
          alignItems: "flex-end",
          minWidth: 86,
        },
        notificationValue: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          marginBottom: 4,
        },
        notificationActionText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          lineHeight: 17,
        },
        notificationMoreText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          paddingTop: 2,
        },
        notificationEmpty: {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 28,
        },
        notificationEmptyTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 17,
          marginTop: 10,
        },
        notificationEmptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 17,
          marginTop: 4,
          textAlign: "center",
        },
        notificationFooter: {
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : colors.border,
          paddingTop: 12,
          marginTop: 12,
        },
        notificationMarkButton: {
          minHeight: 44,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
        },
        notificationMarkText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        filterFooter: {
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        filterApplyButton: {
          minHeight: 48,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.text : "#111111",
        },
        filterApplyText: {
          color: isDark ? colors.background : "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 14,
        },
      }),
    [colors, insets.bottom, insets.top, isDark, isDesktop, isWideLayout]
  );

  const renderHero = (config: HeroConfig) => (
    <View style={styles.heroCard}>
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
        {config.stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.heroStatCard,
              index === 2 && styles.heroStatCardWide,
            ]}
          >
            <Text numberOfLines={1} style={styles.heroStatLabel}>
              {stat.label}
            </Text>
            <Text numberOfLines={1} style={styles.heroStatValue}>
              {stat.value}
            </Text>
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

  const renderControls = () => (
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
            const active = draftView === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => setDraftView(item.id)}
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
            const active = draftTimeframe === item;
            return (
              <TouchableOpacity
                key={item}
                activeOpacity={0.88}
                onPress={() => setDraftTimeframe(item)}
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

      <View style={styles.filterFooter}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Apply analytics filters"
          activeOpacity={0.88}
          onPress={applyControls}
          style={styles.filterApplyButton}
        >
          <Text style={styles.filterApplyText}>Apply filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderOwnerActions = () => {
    const primaryAction = ownerActions[0];
    const primaryTone = toneStyles[primaryAction.tone];

    return (
      <>
        <TouchableOpacity
          accessibilityLabel="Open priority feed"
          accessibilityRole="button"
          activeOpacity={0.9}
          onPress={primaryAction.onPress}
          style={styles.priorityCard}
        >
          <View style={styles.priorityTop}>
            <View style={styles.priorityIdentity}>
              <View
                style={[
                  styles.priorityIcon,
                  { backgroundColor: primaryTone.bg },
                ]}
              >
                <Ionicons
                  color={primaryTone.text}
                  name={primaryAction.icon as any}
                  size={18}
                />
              </View>
              <Text style={styles.priorityLabel}>Priority feed</Text>
            </View>
            <Text style={styles.priorityCount}>
              {model.attentionItems.length} alerts
            </Text>
          </View>

          <Text style={styles.priorityHeadline}>{primaryAction.headline}</Text>
          <Text numberOfLines={2} style={styles.priorityDetail}>
            {primaryAction.detail}
          </Text>

          <View style={styles.priorityFooter}>
            <Text style={styles.priorityFooterText}>Open full queue</Text>
            <Ionicons color={colors.text} name="arrow-forward" size={16} />
          </View>
        </TouchableOpacity>

        <View style={styles.shortcutRow}>
          {ownerActions.slice(1).map((action) => {
            const tone = toneStyles[action.tone];
            return (
              <TouchableOpacity
                accessibilityLabel={action.headline}
                accessibilityRole="button"
                activeOpacity={0.88}
                key={action.id}
                onPress={action.onPress}
                style={styles.shortcutButton}
              >
                <Ionicons color={tone.text} name={action.icon as any} size={17} />
                <Text style={styles.shortcutText}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  const renderNotificationCenter = () => (
    <View style={styles.sheetScroll}>
      <View style={styles.notificationSummary}>
        <Text style={styles.notificationSummaryTitle}>
          {notificationCount
            ? `${notificationCount} unread alert${notificationCount === 1 ? "" : "s"}`
            : "All caught up"}
        </Text>
        <Text style={styles.notificationSummaryBody}>
          Updated {formatLastUpdated(payload?.summary.lastUpdatedAt || legacyPayload?.lastUpdatedAt || null)}
        </Text>
      </View>

      {visibleNotifications.length ? (
        <>
          {visibleNotifications.map((notification, index) => {
            const tone = toneStyles[notification.tone];

            return (
              <TouchableOpacity
                accessibilityLabel={`Open ${notification.title}`}
                accessibilityRole="button"
                activeOpacity={0.88}
                key={notification.id}
                onPress={() => handleNotificationPress(notification)}
                style={[
                  styles.notificationRow,
                  index === 0 && styles.notificationRowFirst,
                ]}
              >
                <View
                  style={[
                    styles.notificationIconWrap,
                    { backgroundColor: tone.bg },
                  ]}
                >
                  <Ionicons
                    color={tone.text}
                    name={notification.icon as any}
                    size={18}
                  />
                </View>
                <View style={styles.notificationContent}>
                  <Text numberOfLines={2} style={styles.notificationTitle}>
                    {notification.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.notificationMeta}>
                    {notification.meta}
                  </Text>
                </View>
                <View style={styles.notificationValueWrap}>
                  <Text style={styles.notificationValue}>
                    {formatCurrencyLabel(notification.amount)}
                  </Text>
                  <Text style={styles.notificationActionText}>View</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {notificationCount > visibleNotifications.length ? (
            <Text style={styles.notificationMoreText}>
              {notificationCount - visibleNotifications.length} more in the
              attention queue.
            </Text>
          ) : null}

          <View style={styles.notificationFooter}>
            <TouchableOpacity
              accessibilityLabel="Mark all analytics notifications as read"
              accessibilityRole="button"
              activeOpacity={0.88}
              onPress={markAllNotificationsRead}
              style={styles.notificationMarkButton}
            >
              <Text style={styles.notificationMarkText}>Mark all read</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.notificationEmpty}>
          <Ionicons
            color={toneStyles.green.text}
            name="checkmark-circle-outline"
            size={34}
          />
          <Text style={styles.notificationEmptyTitle}>No unread alerts</Text>
          <Text style={styles.notificationEmptyBody}>
            New sheet exceptions will appear here when the attention queue
            updates.
          </Text>
        </View>
      )}
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

  const renderActivityFeed = () => {
    const visibleActivities = model.activities.slice(0, 3);

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent movement</Text>
          <Text style={styles.sectionHint}>
            Updated {formatLastUpdated(payload?.summary.lastUpdatedAt || legacyPayload?.lastUpdatedAt || null)}
          </Text>
        </View>

        {visibleActivities.length ? (
          visibleActivities.map((activity, index) => {
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
                  <Text numberOfLines={2} style={styles.activityDetail}>
                    {activity.detail}
                  </Text>
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
  };

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
      {renderMetrics(overviewMetrics.slice(0, 2))}
      {renderOwnerActions()}
      {renderTeamExecution(model.reps)}
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
          <View style={styles.commandHeader}>
            <View style={styles.commandTopRow}>
              <TouchableOpacity
                accessibilityLabel="Open owner profile"
                accessibilityRole="button"
                activeOpacity={0.88}
                style={styles.ownerIdentityRow}
              >
                <Image
                  source={{ uri: "https://i.pravatar.cc/150?img=11" }}
                  style={styles.ownerAvatarImage}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.ownerRoleRow}>
                    <Text style={styles.ownerRoleText}>{userRole}</Text>
                    <Ionicons
                      color="rgba(255,255,255,0.48)"
                      name="chevron-down"
                      size={14}
                    />
                  </View>
                  <Text style={styles.ownerNameText}>
                    {userRole === "Manager" ? "Alex Carter" : `${userRole} Workspace`}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.utilityPill}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Back to main dashboard"
                  activeOpacity={0.86}
                  hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                  onPress={() => router.replace("/(app)/main")}
                  style={styles.utilityPillButton}
                >
                  <Ionicons
                    color={colors.accentGold}
                    name="stats-chart-outline"
                    size={18}
                    strokeWidth={2.2}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={
                    notificationCount
                      ? `Open notifications, ${notificationCount} unread`
                      : "Open notifications"
                  }
                  activeOpacity={0.86}
                  hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                  onPress={() => setSheetOpen(true)}
                  style={styles.utilityPillButton}
                >
                  <Ionicons
                    color="rgba(255,255,255,0.82)"
                    name="notifications-outline"
                    size={18}
                    strokeWidth={2.2}
                  />
                  {notificationCount ? (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationBadgeText}>
                        {notificationCount > 9 ? "9+" : notificationCount}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.analyticsTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.commandEyebrow}>Owner exclusive</Text>
                <Text style={styles.commandTitle}>Analytics</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open analytics filters"
                activeOpacity={0.86}
                onPress={openControls}
                style={styles.titleActionCircle}
              >
                <Ionicons
                  color="rgba(255,255,255,0.82)"
                  name="pulse-outline"
                  size={20}
                />
              </TouchableOpacity>
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
        visible={controlsOpen}
        animationType="fade"
        onRequestClose={() => setControlsOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setControlsOpen(false)}
          style={[styles.modalBackdrop, styles.filterBackdrop]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => undefined}
            style={[styles.sheetCard, styles.filterSheetCard]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Analytics filters</Text>
              <TouchableOpacity onPress={() => setControlsOpen(false)}>
                <Text style={styles.sheetAction}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sheetScroll}>{renderControls()}</View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
              <Text style={styles.sheetTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)}>
                <Text style={styles.sheetAction}>Close</Text>
              </TouchableOpacity>
            </View>

            {renderNotificationCenter()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default AnalyticsScreen;
