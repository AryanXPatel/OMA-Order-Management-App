import { BACKEND_URL, apiCache, fetchWithRetry } from "./apiManager";
import { fetchSheetObjects, type SheetObject } from "./fetchSheetObjects";
import type { Timeframe } from "./managerAnalytics";

const ORDER_HEADER_RANGE = "Order_Header_Fact!A1:Z";
const CUSTOMER_SNAPSHOT_RANGE = "Customer_Account_Snapshot!A1:Z";
const ANALYTICS_DAILY_RANGE = "Analytics_KPI_Daily!A1:AZ";
const ATTENTION_QUEUE_RANGE = "Attention_Queue_Snapshot!A1:Z";
const TARGETS_RANGE = "Targets!A1:Z";

const ORDER_HEADER_HEADERS = [
  "order_id",
  "customer_name",
  "customer_code",
  "customer_contact",
  "user",
  "source",
  "created_at",
  "dispatch_at",
  "status",
  "item_count",
  "quantity_total",
  "total_amount",
  "approved_items",
  "dispatched_items",
  "cycle_hours",
  "age_hours",
  "product_groups",
  "products",
  "latest_manager_comment",
  "latest_dispatch_comment",
] as const;

const CUSTOMER_SNAPSHOT_HEADERS = [
  "customer_code",
  "customer_name",
  "customer_contact",
  "customer_group",
  "total_exposure",
  "current_exposure",
  "thirty_day_exposure",
  "sixty_day_exposure",
  "ninety_day_exposure",
  "high_risk_exposure",
  "collected_value",
  "invoiced_value",
  "collection_rate",
  "average_age_days",
  "last_updated_at",
] as const;

const ANALYTICS_DAILY_HEADERS = [
  "as_of_date",
  "order_count",
  "total_value",
  "open_value",
  "dispatched_value",
  "dispatched_orders",
  "pending_approvals",
  "pending_approval_value",
  "pending_dispatches",
  "pending_dispatch_value",
  "rejected_orders",
  "rejected_value",
  "active_customers",
  "active_reps",
  "average_order_value",
  "dispatch_rate",
  "throughput_rate",
  "avg_dispatch_hours",
  "average_open_age_hours",
  "aged_pending_approvals",
  "aged_dispatch_queue",
  "high_value_threshold",
  "high_value_open_orders",
  "top_customer_share",
  "top_source_share",
  "total_exposure",
  "current_exposure",
  "thirty_exposure",
  "sixty_exposure",
  "ninety_exposure",
  "high_risk_exposure",
  "collected_value",
  "invoiced_value",
  "collection_rate",
  "average_age_days",
  "last_updated_at",
] as const;

const ATTENTION_QUEUE_HEADERS = [
  "snapshot_date",
  "queue_type",
  "entity_type",
  "entity_id",
  "customer_code",
  "severity",
  "reason_code",
  "headline",
  "amount",
  "age_hours",
  "owner",
] as const;

const TARGET_HEADERS = [
  "period",
  "owner_type",
  "owner_name",
  "booking_target",
  "dispatch_target",
  "collection_target",
  "margin_target",
] as const;

type SummaryPayload = {
  asOfDate: string;
  orderCount: number;
  totalValue: number;
  openValue: number;
  dispatchedValue: number;
  dispatchedOrders: number;
  pendingApprovals: number;
  pendingApprovalValue: number;
  pendingDispatches: number;
  pendingDispatchValue: number;
  rejectedOrders: number;
  rejectedValue: number;
  activeCustomers: number;
  activeReps: number;
  averageOrderValue: number;
  dispatchRate: number;
  throughputRate: number;
  avgDispatchHours: number | null;
  averageOpenAgeHours: number | null;
  agedPendingApprovals: number;
  agedDispatchQueue: number;
  highValueThreshold: number;
  highValueOpenOrders: number;
  topCustomerShare: number;
  topSourceShare: number;
  totalExposure: number;
  currentExposure: number;
  thirtyExposure: number;
  sixtyExposure: number;
  ninetyExposure: number;
  highRiskExposure: number;
  collectedValue: number;
  invoicedValue: number;
  collectionRate: number;
  averageAgeDays: number;
  lastUpdatedAt: string;
};

export type CommandCenterOrderHeaderRow = {
  orderId: string;
  customerName: string;
  customerCode: string;
  customerContact: string;
  user: string;
  source: string;
  createdAt: string;
  dispatchAt: string;
  status: string;
  itemCount: number;
  quantityTotal: number;
  totalAmount: number;
  approvedItems: number;
  dispatchedItems: number;
  cycleHours: number | null;
  ageHours: number | null;
  productGroups: string;
  products: string;
  latestManagerComment: string;
  latestDispatchComment: string;
};

export type CommandCenterCustomerSnapshotRow = {
  customerCode: string;
  customerName: string;
  customerContact: string;
  customerGroup: string;
  totalExposure: number;
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

export type CommandCenterPayload = {
  timeframe: Timeframe;
  summary: SummaryPayload;
  summaryHistory: SummaryPayload[];
  pipeline: CommandCenterOrderHeaderRow[];
  customers: CommandCenterCustomerSnapshotRow[];
  attentionQueue: CommandCenterAttentionQueueRow[];
  targets: CommandCenterTargetRow[];
};

export type CommandCenterAttentionQueueRow = {
  snapshotDate: string;
  queueType: string;
  entityType: string;
  entityId: string;
  customerCode: string;
  severity: string;
  reasonCode: string;
  headline: string;
  amount: number;
  ageHours: number | null;
  owner: string;
};

export type CommandCenterTargetRow = {
  period: string;
  ownerType: string;
  ownerName: string;
  bookingTarget: number;
  dispatchTarget: number;
  collectionTarget: number;
  marginTarget: number;
};

type RepositoryDependencies = {
  cache?: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  fetchSheetRangeObjects?: (
    range: string,
    requiredHeaders: readonly string[]
  ) => Promise<SheetObject[]>;
};

type PayloadOptions = {
  skipCache?: boolean;
};

type DateRange = {
  start: Date;
  end: Date;
};

const toNullableNumber = (value: string) => {
  const parsed = Number.parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const toRequiredNumber = (value: string) => toNullableNumber(value) ?? 0;

const mapOrderHeaderRow = (row: SheetObject): CommandCenterOrderHeaderRow => ({
  orderId: row.order_id || "",
  customerName: row.customer_name || "",
  customerCode: row.customer_code || "",
  customerContact: row.customer_contact || "",
  user: row.user || "",
  source: row.source || "",
  createdAt: row.created_at || "",
  dispatchAt: row.dispatch_at || "",
  status: row.status || "",
  itemCount: toRequiredNumber(row.item_count),
  quantityTotal: toRequiredNumber(row.quantity_total),
  totalAmount: toRequiredNumber(row.total_amount),
  approvedItems: toRequiredNumber(row.approved_items),
  dispatchedItems: toRequiredNumber(row.dispatched_items),
  cycleHours: toNullableNumber(row.cycle_hours),
  ageHours: toNullableNumber(row.age_hours),
  productGroups: row.product_groups || "",
  products: row.products || "",
  latestManagerComment: row.latest_manager_comment || "",
  latestDispatchComment: row.latest_dispatch_comment || "",
});

const mapCustomerSnapshotRow = (
  row: SheetObject
): CommandCenterCustomerSnapshotRow => ({
  customerCode: row.customer_code || "",
  customerName: row.customer_name || "",
  customerContact: row.customer_contact || "",
  customerGroup: row.customer_group || "",
  totalExposure: toRequiredNumber(row.total_exposure),
  currentExposure: toRequiredNumber(row.current_exposure),
  thirtyDayExposure: toRequiredNumber(row.thirty_day_exposure),
  sixtyDayExposure: toRequiredNumber(row.sixty_day_exposure),
  ninetyDayExposure: toRequiredNumber(row.ninety_day_exposure),
  highRiskExposure: toRequiredNumber(row.high_risk_exposure),
  collectedValue: toRequiredNumber(row.collected_value),
  invoicedValue: toRequiredNumber(row.invoiced_value),
  collectionRate: toRequiredNumber(row.collection_rate),
  averageAgeDays: toRequiredNumber(row.average_age_days),
  lastUpdatedAt: row.last_updated_at || "",
});

const mapSummaryRow = (row: SheetObject): SummaryPayload => ({
  asOfDate: row.as_of_date || "",
  orderCount: toRequiredNumber(row.order_count),
  totalValue: toRequiredNumber(row.total_value),
  openValue: toRequiredNumber(row.open_value),
  dispatchedValue: toRequiredNumber(row.dispatched_value),
  dispatchedOrders: toRequiredNumber(row.dispatched_orders),
  pendingApprovals: toRequiredNumber(row.pending_approvals),
  pendingApprovalValue: toRequiredNumber(row.pending_approval_value),
  pendingDispatches: toRequiredNumber(row.pending_dispatches),
  pendingDispatchValue: toRequiredNumber(row.pending_dispatch_value),
  rejectedOrders: toRequiredNumber(row.rejected_orders),
  rejectedValue: toRequiredNumber(row.rejected_value),
  activeCustomers: toRequiredNumber(row.active_customers),
  activeReps: toRequiredNumber(row.active_reps),
  averageOrderValue: toRequiredNumber(row.average_order_value),
  dispatchRate: toRequiredNumber(row.dispatch_rate),
  throughputRate: toRequiredNumber(row.throughput_rate),
  avgDispatchHours: toNullableNumber(row.avg_dispatch_hours),
  averageOpenAgeHours: toNullableNumber(row.average_open_age_hours),
  agedPendingApprovals: toRequiredNumber(row.aged_pending_approvals),
  agedDispatchQueue: toRequiredNumber(row.aged_dispatch_queue),
  highValueThreshold: toRequiredNumber(row.high_value_threshold),
  highValueOpenOrders: toRequiredNumber(row.high_value_open_orders),
  topCustomerShare: toRequiredNumber(row.top_customer_share),
  topSourceShare: toRequiredNumber(row.top_source_share),
  totalExposure: toRequiredNumber(row.total_exposure),
  currentExposure: toRequiredNumber(row.current_exposure),
  thirtyExposure: toRequiredNumber(row.thirty_exposure),
  sixtyExposure: toRequiredNumber(row.sixty_exposure),
  ninetyExposure: toRequiredNumber(row.ninety_exposure),
  highRiskExposure: toRequiredNumber(row.high_risk_exposure),
  collectedValue: toRequiredNumber(row.collected_value),
  invoicedValue: toRequiredNumber(row.invoiced_value),
  collectionRate: toRequiredNumber(row.collection_rate),
  averageAgeDays: toRequiredNumber(row.average_age_days),
  lastUpdatedAt: row.last_updated_at || "",
});

const mapAttentionQueueRow = (
  row: SheetObject
): CommandCenterAttentionQueueRow => ({
  snapshotDate: row.snapshot_date || "",
  queueType: row.queue_type || "",
  entityType: row.entity_type || "",
  entityId: row.entity_id || "",
  customerCode: row.customer_code || "",
  severity: row.severity || "",
  reasonCode: row.reason_code || "",
  headline: row.headline || "",
  amount: toRequiredNumber(row.amount),
  ageHours: toNullableNumber(row.age_hours),
  owner: row.owner || "",
});

const mapTargetRow = (row: SheetObject): CommandCenterTargetRow => ({
  period: row.period || "",
  ownerType: row.owner_type || "",
  ownerName: row.owner_name || "",
  bookingTarget: toRequiredNumber(row.booking_target),
  dispatchTarget: toRequiredNumber(row.dispatch_target),
  collectionTarget: toRequiredNumber(row.collection_target),
  marginTarget: toRequiredNumber(row.margin_target),
});

const getCurrentRange = (timeframe: Timeframe, now = new Date()): DateRange => {
  const end = new Date(now);
  const start = new Date(now);

  if (timeframe === "MTD") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (timeframe === "QTD") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const getPreviousRange = (timeframe: Timeframe, now = new Date()): DateRange => {
  const currentRange = getCurrentRange(timeframe, now);
  const duration = currentRange.end.getTime() - currentRange.start.getTime();
  return {
    start: new Date(currentRange.start.getTime() - duration),
    end: new Date(currentRange.start),
  };
};

const isWithinRange = (date: Date | null, range: DateRange) =>
  Boolean(date) &&
  date.getTime() >= range.start.getTime() &&
  date.getTime() <= range.end.getTime();

const parseSummaryDate = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const defaultFetchSheetRangeObjects = async (
  range: string,
  requiredHeaders: readonly string[]
) => {
  const response = await fetchWithRetry<{ values?: string[][] }>(
    `${BACKEND_URL}/api/sheets/${range}`,
    {},
    2,
    1500
  );

  return fetchSheetObjects(response.data?.values || [], requiredHeaders);
};

export const createCommandCenterRepository = (
  dependencies: RepositoryDependencies = {}
) => {
  const cache = dependencies.cache ?? apiCache;
  const fetchSheetRangeObjects =
    dependencies.fetchSheetRangeObjects ?? defaultFetchSheetRangeObjects;

  const getPayload = async (
    persona: "manager" | "owner",
    timeframe: Timeframe,
    options: PayloadOptions = {}
  ): Promise<CommandCenterPayload> => {
    const cacheKey = `commandCenter.${persona}.${timeframe}`;
    const cached = cache.get(cacheKey) as CommandCenterPayload | null;
    if (cached && !options.skipCache) {
      return cached;
    }

    const [summaryRows, pipelineRows, customerRows, attentionQueueRows, targetRows] =
      await Promise.all([
      fetchSheetRangeObjects(ANALYTICS_DAILY_RANGE, ANALYTICS_DAILY_HEADERS),
      fetchSheetRangeObjects(ORDER_HEADER_RANGE, ORDER_HEADER_HEADERS),
      fetchSheetRangeObjects(CUSTOMER_SNAPSHOT_RANGE, CUSTOMER_SNAPSHOT_HEADERS),
      fetchSheetRangeObjects(ATTENTION_QUEUE_RANGE, ATTENTION_QUEUE_HEADERS),
      fetchSheetRangeObjects(TARGETS_RANGE, TARGET_HEADERS),
    ]);

    const currentRange = getCurrentRange(timeframe);
    const previousRange = getPreviousRange(timeframe);
    const mappedSummaryRows = summaryRows
      .map(mapSummaryRow)
      .sort((left, right) =>
        String(right.asOfDate || "").localeCompare(String(left.asOfDate || ""))
      );
    const summaryHistory = mappedSummaryRows.filter((row) => {
      const parsed = parseSummaryDate(row.asOfDate);
      return isWithinRange(parsed, currentRange) || isWithinRange(parsed, previousRange);
    });
    const latestSummarySource =
      summaryHistory.find((row) => isWithinRange(parseSummaryDate(row.asOfDate), currentRange)) ||
      mappedSummaryRows[0] ||
      ({} as SummaryPayload);

    const payload: CommandCenterPayload = {
      timeframe,
      summary: latestSummarySource,
      summaryHistory,
      pipeline: pipelineRows.map(mapOrderHeaderRow),
      customers: customerRows.map(mapCustomerSnapshotRow),
      attentionQueue: attentionQueueRows.map(mapAttentionQueueRow),
      targets: targetRows.map(mapTargetRow),
    };

    cache.set(cacheKey, payload);
    return payload;
  };

  return {
    async getManagerPayload(
      timeframe: Timeframe,
      options?: PayloadOptions
    ): Promise<CommandCenterPayload> {
      return getPayload("manager", timeframe, options);
    },

    async getOwnerPayload(
      timeframe: Timeframe,
      options?: PayloadOptions
    ): Promise<CommandCenterPayload> {
      return getPayload("owner", timeframe, options);
    },
  };
};

export const commandCenterRepository = createCommandCenterRepository();
