import { fetchSheetObjects } from "./fetchSheetObjects";
import type {
  CommandCenterAttentionQueueRow,
  CommandCenterCustomerSnapshotRow,
  CommandCenterOrderHeaderRow,
  CommandCenterPayload,
  CommandCenterTargetRow,
} from "./commandCenterRepository";
import { formatRoleLabel } from "./roles";

export type Timeframe = "MTD" | "QTD" | "YTD";
export type ViewMode = "overview" | "revenue" | "execution";
export type ToneKey = "blue" | "green" | "orange" | "red";
export type OrderStatus = "pending" | "approved" | "rejected" | "dispatched";

export type OrderLine = {
  sysTime: string;
  orderTime: string;
  user: string;
  orderComments: string;
  customerName: string;
  customerCode: string;
  customerContact: string;
  orderId: string;
  productName: string;
  productGroup: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  source: string;
  approved: string;
  managerComments: string;
  dispatched: string;
  dispatchComments: string;
  dispatchTime: string;
  createdAt: Date | null;
  dispatchAt: Date | null;
  status: OrderStatus;
};

export type GroupedOrder = {
  orderId: string;
  customerName: string;
  customerCode: string;
  customerContact: string;
  user: string;
  source: string;
  createdAt: Date | null;
  dispatchAt: Date | null;
  totalAmount: number;
  status: OrderStatus;
  itemCount: number;
  quantityTotal: number;
  approvedItems: number;
  dispatchedItems: number;
  cycleHours: number | null;
  ageHours: number | null;
  productGroups: string[];
  products: string[];
  latestManagerComment: string;
  latestDispatchComment: string;
};

export type LedgerRow = {
  date: string;
  amount: number;
  signedAmount: number;
  dc: string;
  description: string;
  fiscalYear: string;
  customerCode: string;
  customerGroup: string;
  customerName: string;
  contact: string;
  voucherType: string;
  parsedDate: Date | null;
  ageDays: number | null;
};

export type AnalyticsPayload = {
  orderLines: OrderLine[];
  groupedOrders: GroupedOrder[];
  ledgerRows: LedgerRow[];
  lastUpdatedAt: string;
};

export type SummaryMetrics = {
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
};

export type FinancialAccount = {
  name: string;
  code: string;
  contact: string;
  customerGroup: string;
  exposure: number;
};

export type FinancialSnapshot = {
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
  topCustomers: FinancialAccount[];
};

export type RepInsight = {
  name: string;
  totalAmount: number;
  orderCount: number;
  dispatchedCount: number;
  pendingCount: number;
  rejectedCount: number;
  stalledValue: number;
  activeCustomers: number;
  dispatchRate: number;
  avgTicket: number;
  share: number;
};

export type SourceInsight = {
  label: string;
  totalAmount: number;
  orderCount: number;
  share: number;
  avgTicket: number;
};

export type ProductGroupInsight = {
  label: string;
  totalAmount: number;
  units: number;
  orderCount: number;
  share: number;
};

export type PipelineStage = {
  label: string;
  count: number;
  value: number;
  share: number;
  tone: ToneKey;
};

export type AttentionItem = {
  id: string;
  orderId: string;
  customerName: string;
  tone: ToneKey;
  title: string;
  detail: string;
  meta: string;
  amount: number;
};

export type FocusSignal = {
  id: string;
  tone: ToneKey;
  label: string;
  headline: string;
  detail: string;
};

export type ActivityInsight = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  icon: string;
  tone: ToneKey;
};

export type TrendPoint = {
  label: string;
  value: number;
};

export type ComparisonMetric = {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat";
};

export type TargetSummary = {
  period: string;
  bookingTarget: number;
  dispatchTarget: number;
  collectionTarget: number;
  marginTarget: number;
  bookingVariance: number;
  dispatchVariance: number;
  collectionVariance: number;
};

export type ManagerAnalyticsModel = {
  currentOrderLines: OrderLine[];
  currentOrders: GroupedOrder[];
  currentLedgerRows: LedgerRow[];
  summary: SummaryMetrics;
  previousSummary: SummaryMetrics;
  financial: FinancialSnapshot;
  periodFinancial: FinancialSnapshot;
  previousPeriodFinancial: FinancialSnapshot;
  reps: RepInsight[];
  sources: SourceInsight[];
  productGroups: ProductGroupInsight[];
  pipeline: PipelineStage[];
  attentionItems: AttentionItem[];
  targetSummary: TargetSummary | null;
  focusSignals: FocusSignal[];
  activities: ActivityInsight[];
  comparisons: {
    booked: ComparisonMetric;
    orders: ComparisonMetric;
    collections: ComparisonMetric;
    dispatchRate: ComparisonMetric;
  };
  trends: Record<ViewMode, TrendPoint[]>;
};

type DateRange = {
  start: Date;
  end: Date;
};

type CustomerDirectoryEntry = {
  code: string;
  name: string;
  contact: string;
};

type ProductDirectoryEntry = {
  code: string;
  name: string;
  groupName: string;
  rate: number;
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
});

const emptySummaryMetrics: SummaryMetrics = {
  orderCount: 0,
  totalValue: 0,
  openValue: 0,
  dispatchedValue: 0,
  dispatchedOrders: 0,
  pendingApprovals: 0,
  pendingApprovalValue: 0,
  pendingDispatches: 0,
  pendingDispatchValue: 0,
  rejectedOrders: 0,
  rejectedValue: 0,
  activeCustomers: 0,
  activeReps: 0,
  averageOrderValue: 0,
  dispatchRate: 0,
  throughputRate: 0,
  avgDispatchHours: null,
  averageOpenAgeHours: null,
  agedPendingApprovals: 0,
  agedDispatchQueue: 0,
  highValueThreshold: 100000,
  highValueOpenOrders: 0,
  topCustomerShare: 0,
  topSourceShare: 0,
};

const emptyFinancialSnapshot: FinancialSnapshot = {
  totalExposure: 0,
  currentExposure: 0,
  thirtyExposure: 0,
  sixtyExposure: 0,
  ninetyExposure: 0,
  highRiskExposure: 0,
  collectedValue: 0,
  invoicedValue: 0,
  collectionRate: 0,
  averageAgeDays: 0,
  topCustomers: [],
};

const toNumber = (value: string) => {
  const parsed = Number.parseFloat((value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseIndianDate = (value: string) => {
  if (!value) {
    return null;
  }

  const [datePart, timePart = ""] = value.trim().split(" ");
  const [day, month, year] = datePart.split("/").map((part) => Number.parseInt(part, 10));

  if (!day || !month || !year) {
    return null;
  }

  const timeMatch = timePart.match(/(\d{1,2}):(\d{2})/);
  const meridiemMatch = value.match(/\b(AM|PM)\b/i);
  let hours = timeMatch ? Number.parseInt(timeMatch[1], 10) : 0;
  const minutes = timeMatch ? Number.parseInt(timeMatch[2], 10) : 0;
  const meridiem = meridiemMatch?.[1]?.toUpperCase();

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatIndianCurrency = (value: number) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return Math.round(value).toString();
  }
};

export const formatCurrencyLabel = (value: number) => `₹${formatIndianCurrency(value)}`;

export const formatRatio = (value: number) => `${Math.round(value)}%`;

export const formatDurationHours = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) {
    return "No dispatch data";
  }

  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / 1440);
  const remainingAfterDays = totalMinutes % 1440;
  const displayHours = Math.floor(remainingAfterDays / 60);
  const minutes = remainingAfterDays % 60;

  if (days > 0) {
    return `${days}d ${displayHours}h`;
  }
  if (displayHours > 0) {
    return `${displayHours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const formatShortAge = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) {
    return "Unknown age";
  }

  if (hours >= 24) {
    return `${Math.round(hours / 24)}d old`;
  }

  if (hours >= 1) {
    return `${Math.round(hours)}h old`;
  }

  return "Fresh";
};

export const formatTimeAgo = (date: Date | null) => {
  if (!date) {
    return "Unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const formatLastUpdated = (isoString: string | null) => {
  if (!isoString) {
    return "Not synced";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "Not synced";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeSourceLabel = (source: string) => {
  const normalized = source.trim().toLowerCase();

  if (!normalized) {
    return "Direct";
  }
  if (normalized.includes("whatsapp")) {
    return "WhatsApp";
  }
  if (normalized.includes("phone")) {
    return "Phone";
  }
  if (normalized.includes("sales")) {
    return "Sales Team";
  }

  return source;
};

const deriveLineStatus = (approved: string, dispatched: string): OrderStatus => {
  const normalizedApproved = approved.trim().toUpperCase();
  const normalizedDispatched = dispatched.trim().toUpperCase();

  if (normalizedApproved === "N" || normalizedApproved === "R") {
    return "rejected";
  }
  if (normalizedDispatched === "Y") {
    return "dispatched";
  }
  if (normalizedApproved === "Y") {
    return "approved";
  }
  return "pending";
};

const deriveOrderStatus = (lines: OrderLine[]): OrderStatus => {
  const anyRejected = lines.some((line) => line.status === "rejected");
  const allDispatched = lines.every((line) => line.status === "dispatched");
  const allApproved = lines.every(
    (line) => line.status === "approved" || line.status === "dispatched"
  );

  if (anyRejected) {
    return "rejected";
  }
  if (allDispatched) {
    return "dispatched";
  }
  if (allApproved) {
    return "approved";
  }
  return "pending";
};

const uniqueNonEmpty = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const earliestDate = (dates: (Date | null)[]) => {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (!validDates.length) {
    return null;
  }

  return validDates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest
  );
};

const latestDate = (dates: (Date | null)[]) => {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (!validDates.length) {
    return null;
  }

  return validDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
};

const buildCustomerDirectory = (values: string[][]) => {
  const byName = new Map<string, CustomerDirectoryEntry>();
  const byCode = new Map<string, CustomerDirectoryEntry>();

  values.slice(1).forEach((row) => {
    const code = row[0] || "";
    const name = row[1] || "";
    const contact = row[2] || "";

    if (!name && !code) {
      return;
    }

    const entry = { code, name, contact };
    if (name) {
      byName.set(name, entry);
    }
    if (code) {
      byCode.set(code, entry);
    }
  });

  return { byName, byCode };
};

const buildProductDirectory = (values: string[][]) => {
  const byName = new Map<string, ProductDirectoryEntry>();
  const records = fetchSheetObjects(values);

  records.forEach((record) => {
    const name = record["Product NAME"] || record["Product Name"] || "";
    if (!name) {
      return;
    }

    byName.set(name, {
      code: record["Product CODE"] || record["Product Code"] || "",
      name,
      groupName:
        record["Product Group Name"] ||
        record["Category"] ||
        record["Product Group"] ||
        "Ungrouped",
      rate: toNumber(record["Rate"] || record["PRODUCT RATE"] || "0"),
    });
  });

  return { byName };
};

const buildOrderLines = (
  orderValues: string[][],
  customerDirectory: ReturnType<typeof buildCustomerDirectory>,
  productDirectory: ReturnType<typeof buildProductDirectory>
) => {
  const now = Date.now();

  return orderValues
    .filter((row) => row[5])
    .map<OrderLine>((row) => {
      const customerName = row[4] || "Unknown customer";
      const customerInfo = customerDirectory.byName.get(customerName);
      const productName = row[6] || "Unknown product";
      const productInfo = productDirectory.byName.get(productName);
      const createdAt = parseIndianDate(row[1] || row[0] || "");
      const dispatchAt = parseIndianDate(row[16] || "");

      return {
        sysTime: row[0] || "",
        orderTime: row[1] || "",
        user: formatRoleLabel(row[2]) || "Unassigned",
        orderComments: row[3] || "",
        customerName,
        customerCode: customerInfo?.code || "",
        customerContact: customerInfo?.contact || "",
        orderId: row[5] || "",
        productName,
        productGroup: productInfo?.groupName || "Ungrouped",
        quantity: toNumber(row[7] || "0"),
        unit: row[8] || "",
        rate: toNumber(row[9] || productInfo?.rate?.toString() || "0"),
        amount: toNumber(row[10] || "0"),
        source: normalizeSourceLabel(row[11] || ""),
        approved: row[12] || "",
        managerComments: row[13] || "",
        dispatched: row[14] || "",
        dispatchComments: row[15] || "",
        dispatchTime: row[16] || "",
        createdAt,
        dispatchAt,
        status: deriveLineStatus(row[12] || "", row[14] || ""),
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() || now) - (a.createdAt?.getTime() || now));
};

const buildGroupedOrders = (orderLines: OrderLine[]) => {
  const orderMap = new Map<string, OrderLine[]>();

  orderLines.forEach((line) => {
    orderMap.set(line.orderId, [...(orderMap.get(line.orderId) || []), line]);
  });

  const now = Date.now();

  return Array.from(orderMap.entries())
    .map<GroupedOrder>(([orderId, lines]) => {
      const createdAt = earliestDate(lines.map((line) => line.createdAt));
      const dispatchAt = latestDate(lines.map((line) => line.dispatchAt));
      const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
      const quantityTotal = lines.reduce((sum, line) => sum + line.quantity, 0);
      const status = deriveOrderStatus(lines);
      const cycleHours =
        createdAt && dispatchAt
          ? Math.max(0, (dispatchAt.getTime() - createdAt.getTime()) / 36e5)
          : null;
      const ageHours =
        createdAt && status !== "dispatched"
          ? Math.max(0, (now - createdAt.getTime()) / 36e5)
          : null;
      const first = lines[0];

      return {
        orderId,
        customerName: first.customerName,
        customerCode: first.customerCode,
        customerContact: first.customerContact,
        user: first.user,
        source: first.source,
        createdAt,
        dispatchAt,
        totalAmount,
        status,
        itemCount: lines.length,
        quantityTotal,
        approvedItems: lines.filter(
          (line) => line.status === "approved" || line.status === "dispatched"
        ).length,
        dispatchedItems: lines.filter((line) => line.status === "dispatched").length,
        cycleHours,
        ageHours,
        productGroups: uniqueNonEmpty(lines.map((line) => line.productGroup)),
        products: uniqueNonEmpty(lines.map((line) => line.productName)),
        latestManagerComment: uniqueNonEmpty(lines.map((line) => line.managerComments))[0] || "",
        latestDispatchComment:
          uniqueNonEmpty(lines.map((line) => line.dispatchComments))[0] || "",
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
};

const buildLedgerRows = (
  ledgerValues: string[][],
  customerDirectory: ReturnType<typeof buildCustomerDirectory>
) => {
  const now = Date.now();

  return ledgerValues.slice(1).map<LedgerRow>((row) => {
    const customerCode = row[5] || "";
    const customerName =
      row[8] || customerDirectory.byCode.get(customerCode)?.name || "Unknown customer";
    const customerInfo =
      customerDirectory.byCode.get(customerCode) || customerDirectory.byName.get(customerName);
    const parsedDate = parseIndianDate(row[0] || "");
    const ageDays = parsedDate
      ? Math.max(0, (now - parsedDate.getTime()) / 86400000)
      : null;

    return {
      date: row[0] || "",
      amount: toNumber(row[1] || "0"),
      signedAmount: toNumber(row[9] || "0"),
      dc: row[2] || "",
      fiscalYear: row[3] || "",
      description: row[4] || "",
      customerCode,
      customerGroup: row[6] || "",
      customerName,
      contact: customerInfo?.contact || "",
      voucherType: row[10] || "",
      parsedDate,
      ageDays,
    };
  });
};

const reviveDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const hydrateAnalyticsPayload = (
  payload: AnalyticsPayload | null | undefined
): AnalyticsPayload | null => {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    orderLines: (payload.orderLines || []).map((line) => ({
      ...line,
      createdAt: reviveDate(line.createdAt),
      dispatchAt: reviveDate(line.dispatchAt),
    })),
    groupedOrders: (payload.groupedOrders || []).map((order) => ({
      ...order,
      createdAt: reviveDate(order.createdAt),
      dispatchAt: reviveDate(order.dispatchAt),
    })),
    ledgerRows: (payload.ledgerRows || []).map((row) => ({
      ...row,
      parsedDate: reviveDate(row.parsedDate),
    })),
  };
};

export const buildAnalyticsPayload = ({
  orderValues,
  ledgerValues,
  customerValues,
  productValues,
}: {
  orderValues: string[][];
  ledgerValues: string[][];
  customerValues: string[][];
  productValues: string[][];
}): AnalyticsPayload => {
  const customerDirectory = buildCustomerDirectory(customerValues);
  const productDirectory = buildProductDirectory(productValues);
  const orderLines = buildOrderLines(orderValues, customerDirectory, productDirectory);

  return {
    orderLines,
    groupedOrders: buildGroupedOrders(orderLines),
    ledgerRows: buildLedgerRows(ledgerValues, customerDirectory),
    lastUpdatedAt: new Date().toISOString(),
  };
};

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
  const end = new Date(currentRange.start);
  const start = new Date(currentRange.start.getTime() - duration);

  return { start, end };
};

const isWithinRange = (date: Date | null, range: DateRange) => {
  if (!date) {
    return false;
  }

  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
};

const filterOrdersByRange = (orders: GroupedOrder[], range: DateRange) =>
  orders.filter((order) => isWithinRange(order.createdAt, range));

const filterOrderLinesByRange = (orderLines: OrderLine[], range: DateRange) =>
  orderLines.filter((line) => isWithinRange(line.createdAt, range));

const filterLedgerByRange = (rows: LedgerRow[], range: DateRange) =>
  rows.filter((row) => isWithinRange(row.parsedDate, range));

export const buildSummaryMetrics = (orders: GroupedOrder[]): SummaryMetrics => {
  if (!orders.length) {
    return emptySummaryMetrics;
  }

  const customerSet = new Set<string>();
  const repSet = new Set<string>();
  const customerValueMap = new Map<string, number>();
  const sourceValueMap = new Map<string, number>();

  let totalValue = 0;
  let openValue = 0;
  let dispatchedValue = 0;
  let dispatchedOrders = 0;
  let pendingApprovals = 0;
  let pendingApprovalValue = 0;
  let pendingDispatches = 0;
  let pendingDispatchValue = 0;
  let rejectedOrders = 0;
  let rejectedValue = 0;
  let agedPendingApprovals = 0;
  let agedDispatchQueue = 0;
  const dispatchHours: number[] = [];
  const openHours: number[] = [];

  orders.forEach((order) => {
    totalValue += order.totalAmount;
    customerSet.add(order.customerName);
    repSet.add(order.user || "Unassigned");
    customerValueMap.set(
      order.customerName,
      (customerValueMap.get(order.customerName) || 0) + order.totalAmount
    );
    sourceValueMap.set(
      order.source,
      (sourceValueMap.get(order.source) || 0) + order.totalAmount
    );

    if (order.status === "dispatched") {
      dispatchedOrders += 1;
      dispatchedValue += order.totalAmount;
      if (order.cycleHours !== null) {
        dispatchHours.push(order.cycleHours);
      }
      return;
    }

    openValue += order.totalAmount;
    if (order.ageHours !== null) {
      openHours.push(order.ageHours);
    }

    if (order.status === "pending") {
      pendingApprovals += 1;
      pendingApprovalValue += order.totalAmount;
      if ((order.ageHours || 0) >= 24) {
        agedPendingApprovals += 1;
      }
      return;
    }

    if (order.status === "approved") {
      pendingDispatches += 1;
      pendingDispatchValue += order.totalAmount;
      if ((order.ageHours || 0) >= 24) {
        agedDispatchQueue += 1;
      }
      return;
    }

    rejectedOrders += 1;
    rejectedValue += order.totalAmount;
    if ((order.ageHours || 0) >= 24) {
      agedPendingApprovals += 1;
    }
  });

  const orderCount = orders.length;
  const averageOrderValue = orderCount > 0 ? totalValue / orderCount : 0;
  const highValueThreshold = Math.max(100000, averageOrderValue * 1.5 || 0);
  const highValueOpenOrders = orders.filter(
    (order) => order.status !== "dispatched" && order.totalAmount >= highValueThreshold
  ).length;
  const topCustomerShare =
    totalValue > 0
      ? Math.max(...Array.from(customerValueMap.values()).map((value) => value / totalValue), 0)
      : 0;
  const topSourceShare =
    totalValue > 0
      ? Math.max(...Array.from(sourceValueMap.values()).map((value) => value / totalValue), 0)
      : 0;

  return {
    orderCount,
    totalValue,
    openValue,
    dispatchedValue,
    dispatchedOrders,
    pendingApprovals,
    pendingApprovalValue,
    pendingDispatches,
    pendingDispatchValue,
    rejectedOrders,
    rejectedValue,
    activeCustomers: customerSet.size,
    activeReps: repSet.size,
    averageOrderValue,
    dispatchRate: orderCount > 0 ? (dispatchedOrders / orderCount) * 100 : 0,
    throughputRate:
      orderCount > 0 ? ((pendingDispatches + dispatchedOrders) / orderCount) * 100 : 0,
    avgDispatchHours:
      dispatchHours.length > 0
        ? dispatchHours.reduce((sum, value) => sum + value, 0) / dispatchHours.length
        : null,
    averageOpenAgeHours:
      openHours.length > 0 ? openHours.reduce((sum, value) => sum + value, 0) / openHours.length : null,
    agedPendingApprovals,
    agedDispatchQueue,
    highValueThreshold,
    highValueOpenOrders,
    topCustomerShare,
    topSourceShare,
  };
};

export const buildFinancialSnapshot = (rows: LedgerRow[]): FinancialSnapshot => {
  if (!rows.length) {
    return emptyFinancialSnapshot;
  }

  let currentExposure = 0;
  let thirtyExposure = 0;
  let sixtyExposure = 0;
  let ninetyExposure = 0;
  let collectedValue = 0;
  let invoicedValue = 0;
  let weightedAgeTotal = 0;
  const customerExposureMap = new Map<
    string,
    {
      name: string;
      code: string;
      contact: string;
      customerGroup: string;
      exposure: number;
    }
  >();

  rows.forEach((row) => {
    if (row.dc === "C") {
      collectedValue += row.amount;
      return;
    }

    if (row.dc !== "D") {
      return;
    }

    invoicedValue += row.amount;
    const ageDays = row.ageDays || 0;

    if (ageDays <= 30) {
      currentExposure += row.amount;
    } else if (ageDays <= 60) {
      thirtyExposure += row.amount;
    } else if (ageDays <= 90) {
      sixtyExposure += row.amount;
    } else {
      ninetyExposure += row.amount;
    }

    weightedAgeTotal += ageDays * row.amount;

    const existing = customerExposureMap.get(row.customerName) || {
      name: row.customerName,
      code: row.customerCode,
      contact: row.contact,
      customerGroup: row.customerGroup,
      exposure: 0,
    };
    existing.exposure += row.amount;
    customerExposureMap.set(row.customerName, existing);
  });

  const totalExposure = currentExposure + thirtyExposure + sixtyExposure + ninetyExposure;

  return {
    totalExposure,
    currentExposure,
    thirtyExposure,
    sixtyExposure,
    ninetyExposure,
    highRiskExposure: sixtyExposure + ninetyExposure,
    collectedValue,
    invoicedValue,
    collectionRate: invoicedValue > 0 ? (collectedValue / invoicedValue) * 100 : 0,
    averageAgeDays: totalExposure > 0 ? weightedAgeTotal / totalExposure : 0,
    topCustomers: Array.from(customerExposureMap.values())
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 5),
  };
};

const buildRepInsights = (orders: GroupedOrder[]) => {
  const repMap = new Map<
    string,
    {
      totalAmount: number;
      orderCount: number;
      dispatchedCount: number;
      pendingCount: number;
      rejectedCount: number;
      stalledValue: number;
      customerSet: Set<string>;
    }
  >();

  orders.forEach((order) => {
    const key = order.user || "Unassigned";
    const current =
      repMap.get(key) || {
        totalAmount: 0,
        orderCount: 0,
        dispatchedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        stalledValue: 0,
        customerSet: new Set<string>(),
      };

    current.totalAmount += order.totalAmount;
    current.orderCount += 1;
    current.customerSet.add(order.customerName);

    if (order.status === "dispatched") {
      current.dispatchedCount += 1;
    } else {
      current.stalledValue += order.totalAmount;
      if (order.status === "rejected") {
        current.rejectedCount += 1;
      } else {
        current.pendingCount += 1;
      }
    }

    repMap.set(key, current);
  });

  const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return Array.from(repMap.entries())
    .map<RepInsight>(([name, value]) => ({
      name,
      totalAmount: value.totalAmount,
      orderCount: value.orderCount,
      dispatchedCount: value.dispatchedCount,
      pendingCount: value.pendingCount,
      rejectedCount: value.rejectedCount,
      stalledValue: value.stalledValue,
      activeCustomers: value.customerSet.size,
      dispatchRate: value.orderCount > 0 ? (value.dispatchedCount / value.orderCount) * 100 : 0,
      avgTicket: value.orderCount > 0 ? value.totalAmount / value.orderCount : 0,
      share: totalAmount > 0 ? value.totalAmount / totalAmount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildSourceInsights = (orders: GroupedOrder[]) => {
  const sourceMap = new Map<string, { totalAmount: number; orderCount: number }>();

  orders.forEach((order) => {
    const key = normalizeSourceLabel(order.source);
    const current = sourceMap.get(key) || { totalAmount: 0, orderCount: 0 };

    current.totalAmount += order.totalAmount;
    current.orderCount += 1;
    sourceMap.set(key, current);
  });

  const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return Array.from(sourceMap.entries())
    .map<SourceInsight>(([label, value]) => ({
      label,
      totalAmount: value.totalAmount,
      orderCount: value.orderCount,
      share: totalAmount > 0 ? value.totalAmount / totalAmount : 0,
      avgTicket: value.orderCount > 0 ? value.totalAmount / value.orderCount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildProductGroupInsights = (orderLines: OrderLine[]) => {
  const groupMap = new Map<
    string,
    { totalAmount: number; units: number; orders: Set<string> }
  >();

  orderLines.forEach((line) => {
    const key = line.productGroup || "Ungrouped";
    const current = groupMap.get(key) || {
      totalAmount: 0,
      units: 0,
      orders: new Set<string>(),
    };

    current.totalAmount += line.amount;
    current.units += line.quantity;
    current.orders.add(line.orderId);
    groupMap.set(key, current);
  });

  const totalAmount = orderLines.reduce((sum, line) => sum + line.amount, 0);

  return Array.from(groupMap.entries())
    .map<ProductGroupInsight>(([label, value]) => ({
      label,
      totalAmount: value.totalAmount,
      units: value.units,
      orderCount: value.orders.size,
      share: totalAmount > 0 ? value.totalAmount / totalAmount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildProductGroupInsightsFromOrders = (orders: GroupedOrder[]) => {
  const groupMap = new Map<
    string,
    { totalAmount: number; units: number; orderCount: number }
  >();

  orders.forEach((order) => {
    const groups = order.productGroups.filter(Boolean);
    const normalizedGroups = groups.length ? groups : ["Ungrouped"];

    const amountPerGroup = order.totalAmount / normalizedGroups.length;
    const unitsPerGroup = order.quantityTotal / normalizedGroups.length;

    normalizedGroups.forEach((group) => {
      const current = groupMap.get(group) || {
        totalAmount: 0,
        units: 0,
        orderCount: 0,
      };

      current.totalAmount += amountPerGroup;
      current.units += unitsPerGroup;
      current.orderCount += 1;
      groupMap.set(group, current);
    });
  });

  const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return Array.from(groupMap.entries())
    .map<ProductGroupInsight>(([label, value]) => ({
      label,
      totalAmount: value.totalAmount,
      units: value.units,
      orderCount: value.orderCount,
      share: totalAmount > 0 ? value.totalAmount / totalAmount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildPipelineStages = (orders: GroupedOrder[], summary: SummaryMetrics): PipelineStage[] => {
  const totalOrders = Math.max(summary.orderCount, 1);
  const values = {
    pending: summary.pendingApprovalValue,
    approved: summary.pendingDispatchValue,
    dispatched: summary.dispatchedValue,
    rejected: summary.rejectedValue,
  };

  return [
    {
      label: "Approval queue",
      count: summary.pendingApprovals,
      value: values.pending,
      share: summary.pendingApprovals / totalOrders,
      tone: "orange",
    },
    {
      label: "Ready to dispatch",
      count: summary.pendingDispatches,
      value: values.approved,
      share: summary.pendingDispatches / totalOrders,
      tone: "blue",
    },
    {
      label: "Dispatched",
      count: summary.dispatchedOrders,
      value: values.dispatched,
      share: summary.dispatchedOrders / totalOrders,
      tone: "green",
    },
    {
      label: "Blocked",
      count: summary.rejectedOrders,
      value: values.rejected,
      share: summary.rejectedOrders / totalOrders,
      tone: "red",
    },
  ].filter((stage) => stage.count > 0 || orders.length === 0);
};

const buildAttentionItems = (orders: GroupedOrder[], summary: SummaryMetrics): AttentionItem[] => {
  return orders
    .map((order) => {
      let score = 0;
      let tone: ToneKey = "blue";
      let title = "";
      let detail = "";

      if (order.status === "rejected") {
        score += 500;
        tone = "red";
        title = `${order.customerName} is blocked`;
        detail = order.latestManagerComment || "Manager rejected the order and it needs rework.";
      } else if (order.status === "approved" && (order.ageHours || 0) >= 24) {
        score += 350;
        tone = "orange";
        title = `${order.customerName} is staged too long`;
        detail =
          order.latestDispatchComment ||
          `${order.itemCount} lines are approved but still waiting for dispatch.`;
      } else if (order.status === "pending" && (order.ageHours || 0) >= 12) {
        score += 280;
        tone = "orange";
        title = `${order.customerName} needs approval`;
        detail =
          order.latestManagerComment ||
          `${order.itemCount} lines are still waiting for manager approval.`;
      } else if (order.status !== "dispatched" && order.totalAmount >= summary.highValueThreshold) {
        score += 180;
        tone = "blue";
        title = `${order.customerName} is a high-value open order`;
        detail = `${order.products[0] || "Order"} is still in motion with ${order.itemCount} lines.`;
      }

      score += order.totalAmount / 1000;

      return {
        id: order.orderId,
        orderId: order.orderId,
        customerName: order.customerName,
        tone,
        title,
        detail,
        meta: `${formatShortAge(order.ageHours)} • ${order.status.toUpperCase()}`,
        amount: order.totalAmount,
        score,
      };
    })
    .filter((item) => item.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _score, ...item }) => item);
};

const buildFocusSignals = (
  summary: SummaryMetrics,
  financial: FinancialSnapshot,
  sources: SourceInsight[],
  reps: RepInsight[]
): FocusSignal[] => {
  const topSource = sources[0];
  const topRep = reps[0];

  return [
    summary.agedPendingApprovals > 0 || summary.pendingApprovals > 0
      ? {
          id: "approval-backlog",
          tone: summary.agedPendingApprovals > 0 ? "red" : "orange",
          label: "Approval backlog",
          headline:
            summary.agedPendingApprovals > 0
              ? `${summary.agedPendingApprovals} approvals are older than 24h`
              : `${summary.pendingApprovals} approvals are in queue`,
          detail: `${formatCurrencyLabel(summary.pendingApprovalValue)} is waiting for manager action.`,
        }
      : {
          id: "approval-backlog",
          tone: "green",
          label: "Approval backlog",
          headline: "Approval queue is clean",
          detail: "No orders are waiting on the manager right now.",
        },
    financial.highRiskExposure > 0
      ? {
          id: "cash-risk",
          tone: financial.ninetyExposure > 0 ? "red" : "orange",
          label: "Receivable risk",
          headline: `${formatCurrencyLabel(financial.highRiskExposure)} is older than 60 days`,
          detail: `${formatRatio(
            financial.totalExposure > 0
              ? (financial.highRiskExposure / financial.totalExposure) * 100
              : 0
          )} of the live receivable book needs follow-up.`,
        }
      : {
          id: "cash-risk",
          tone: "green",
          label: "Receivable risk",
          headline: "Exposure is concentrated in current buckets",
          detail: "There is no 60+ day exposure in the live receivable book.",
        },
    topSource
      ? {
          id: "mix",
          tone: topSource.share >= 0.5 ? "blue" : "green",
          label: "Demand mix",
          headline: `${topSource.label} drives ${formatRatio(topSource.share * 100)} of booked value`,
          detail: topRep
            ? `${topRep.name} leads the team with ${formatCurrencyLabel(topRep.totalAmount)} booked.`
            : "Sales mix is diversified this period.",
        }
      : {
          id: "mix",
          tone: "green",
          label: "Demand mix",
          headline: "No source concentration detected",
          detail: "Bookings are spread evenly or no order data is available.",
        },
  ];
};

const buildActivityInsights = (orders: GroupedOrder[]) =>
  [...orders]
    .sort((a, b) => {
      const left = (a.dispatchAt || a.createdAt)?.getTime() || 0;
      const right = (b.dispatchAt || b.createdAt)?.getTime() || 0;
      return right - left;
    })
    .slice(0, 5)
    .map<ActivityInsight>((order) => {
      if (order.status === "dispatched") {
        return {
          id: order.orderId,
          title: "Dispatch closed",
          detail: `${order.customerName} moved out of queue in ${formatDurationHours(
            order.cycleHours
          )}.`,
          timeLabel: formatTimeAgo(order.dispatchAt || order.createdAt),
          icon: "paper-plane-outline",
          tone: "green",
        };
      }

      if (order.status === "approved") {
        return {
          id: order.orderId,
          title: "Ready for dispatch",
          detail: `${order.customerName} has ${order.itemCount} lines staged for ops.`,
          timeLabel: formatTimeAgo(order.createdAt),
          icon: "checkmark-circle-outline",
          tone: "blue",
        };
      }

      if (order.status === "rejected") {
        return {
          id: order.orderId,
          title: "Manager intervention",
          detail: `${order.customerName} was blocked and needs follow-up.`,
          timeLabel: formatTimeAgo(order.createdAt),
          icon: "alert-circle-outline",
          tone: "red",
        };
      }

      return {
        id: order.orderId,
        title: "New order entered",
        detail: `${order.customerName} created ${formatCurrencyLabel(order.totalAmount)} of demand.`,
        timeLabel: formatTimeAgo(order.createdAt),
        icon: "document-text-outline",
        tone: "orange",
      };
    });

const buildComparisonMetric = (current: number, previous: number): ComparisonMetric => {
  const delta = current - previous;

  return {
    current,
    previous,
    delta,
    deltaPercent:
      previous === 0 ? (current === 0 ? 0 : null) : (delta / Math.abs(previous)) * 100,
    direction: delta === 0 ? "flat" : delta > 0 ? "up" : "down",
  };
};

const sumOrders = (orders: GroupedOrder[]) =>
  orders.reduce((sum, order) => sum + order.totalAmount, 0);

const buildTrendSeries = (
  orders: GroupedOrder[],
  timeframe: Timeframe,
  mode: ViewMode
): TrendPoint[] => {
  const now = new Date();

  if (timeframe === "MTD") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      const bucketStart = new Date(date);
      bucketStart.setHours(0, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + 1);

      const bucketOrders = orders.filter((order) => {
        const createdAt = order.createdAt?.getTime() || 0;
        return createdAt >= bucketStart.getTime() && createdAt < bucketEnd.getTime();
      });

      return {
        label: weekdayFormatter.format(bucketStart).slice(0, 1),
        value:
          mode === "execution"
            ? bucketOrders.filter((order) => order.status === "dispatched").length
            : sumOrders(bucketOrders),
      };
    });
  }

  const months =
    timeframe === "QTD"
      ? Array.from({ length: 3 }, (_, index) => {
          const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
          return new Date(now.getFullYear(), quarterStartMonth + index, 1);
        })
      : Array.from({ length: now.getMonth() + 1 }, (_, index) => new Date(now.getFullYear(), index, 1));

  return months.map((bucketStart) => {
    const bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 1);
    const bucketOrders = orders.filter((order) => {
      const createdAt = order.createdAt?.getTime() || 0;
      return createdAt >= bucketStart.getTime() && createdAt < bucketEnd.getTime();
    });

    return {
      label: monthLabelFormatter.format(bucketStart),
      value:
        mode === "execution"
          ? bucketOrders.filter((order) => order.status === "dispatched").length
          : sumOrders(bucketOrders),
    };
  });
};

export const buildSparklinePath = (points: TrendPoint[]) => {
  if (!points.length) {
    return "";
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 300;
      const y = 72 - ((point.value - min) / range) * 54;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

export const buildSparklineArea = (path: string) => {
  if (!path) {
    return "";
  }

  return `${path} L 300 86 L 0 86 Z`;
};

export const getSparklineMarker = (points: TrendPoint[]) => {
  if (!points.length) {
    return { x: 150, y: 46 };
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const lastValue = points[points.length - 1].value;

  return {
    x: 300,
    y: 72 - ((lastValue - min) / range) * 54,
  };
};

export const buildManagerAnalyticsModel = (
  payload: AnalyticsPayload | null,
  timeframe: Timeframe
): ManagerAnalyticsModel => {
  const revivedPayload = hydrateAnalyticsPayload(payload);

  if (!revivedPayload) {
    return {
      currentOrderLines: [],
      currentOrders: [],
      currentLedgerRows: [],
      summary: emptySummaryMetrics,
      previousSummary: emptySummaryMetrics,
      financial: emptyFinancialSnapshot,
      periodFinancial: emptyFinancialSnapshot,
      previousPeriodFinancial: emptyFinancialSnapshot,
      reps: [],
      sources: [],
      productGroups: [],
      pipeline: [],
      attentionItems: [],
      targetSummary: null,
      focusSignals: [],
      activities: [],
      comparisons: {
        booked: buildComparisonMetric(0, 0),
        orders: buildComparisonMetric(0, 0),
        collections: buildComparisonMetric(0, 0),
        dispatchRate: buildComparisonMetric(0, 0),
      },
      trends: {
        overview: [],
        revenue: [],
        execution: [],
      },
    };
  }

  const currentRange = getCurrentRange(timeframe);
  const previousRange = getPreviousRange(timeframe);
  const currentOrders = filterOrdersByRange(revivedPayload.groupedOrders, currentRange);
  const previousOrders = filterOrdersByRange(revivedPayload.groupedOrders, previousRange);
  const currentOrderLines = filterOrderLinesByRange(revivedPayload.orderLines, currentRange);
  const currentLedgerRows = filterLedgerByRange(revivedPayload.ledgerRows, currentRange);
  const previousLedgerRows = filterLedgerByRange(revivedPayload.ledgerRows, previousRange);

  const summary = buildSummaryMetrics(currentOrders);
  const previousSummary = buildSummaryMetrics(previousOrders);
  const financial = buildFinancialSnapshot(revivedPayload.ledgerRows);
  const periodFinancial = buildFinancialSnapshot(currentLedgerRows);
  const previousPeriodFinancial = buildFinancialSnapshot(previousLedgerRows);
  const reps = buildRepInsights(currentOrders);
  const sources = buildSourceInsights(currentOrders);
  const productGroups = buildProductGroupInsights(currentOrderLines);
  const pipeline = buildPipelineStages(currentOrders, summary);
  const attentionItems = buildAttentionItems(currentOrders, summary);
  const focusSignals = buildFocusSignals(summary, financial, sources, reps);
  const activities = buildActivityInsights(currentOrders);

  return {
    currentOrderLines,
    currentOrders,
    currentLedgerRows,
    summary,
    previousSummary,
    financial,
    periodFinancial,
    previousPeriodFinancial,
    reps,
    sources,
    productGroups,
    pipeline,
    attentionItems,
    targetSummary: null,
    focusSignals,
    activities,
    comparisons: {
      booked: buildComparisonMetric(summary.totalValue, previousSummary.totalValue),
      orders: buildComparisonMetric(summary.orderCount, previousSummary.orderCount),
      collections: buildComparisonMetric(
        periodFinancial.collectedValue,
        previousPeriodFinancial.collectedValue
      ),
      dispatchRate: buildComparisonMetric(summary.dispatchRate, previousSummary.dispatchRate),
    },
    trends: {
      overview: buildTrendSeries(currentOrders, timeframe, "overview"),
      revenue: buildTrendSeries(currentOrders, timeframe, "revenue"),
      execution: buildTrendSeries(currentOrders, timeframe, "execution"),
    },
  };
};

const toCommandCenterDate = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const splitCommandCenterList = (value: string) =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const mapRepositoryOrderToGroupedOrder = (
  row: CommandCenterOrderHeaderRow
): GroupedOrder => ({
  orderId: row.orderId,
  customerName: row.customerName,
  customerCode: row.customerCode,
  customerContact: row.customerContact,
  user: row.user,
  source: row.source,
  createdAt: toCommandCenterDate(row.createdAt),
  dispatchAt: toCommandCenterDate(row.dispatchAt),
  totalAmount: row.totalAmount,
  status:
    row.status === "approved" ||
    row.status === "rejected" ||
    row.status === "dispatched"
      ? row.status
      : "pending",
  itemCount: row.itemCount,
  quantityTotal: row.quantityTotal,
  approvedItems: row.approvedItems,
  dispatchedItems: row.dispatchedItems,
  cycleHours: row.cycleHours,
  ageHours: row.ageHours,
  productGroups: splitCommandCenterList(row.productGroups),
  products: splitCommandCenterList(row.products),
  latestManagerComment: row.latestManagerComment,
  latestDispatchComment: row.latestDispatchComment,
});

const mapRepositoryCustomersToFinancial = (
  rows: CommandCenterCustomerSnapshotRow[]
): FinancialSnapshot => ({
  totalExposure: rows.reduce((sum, row) => sum + row.totalExposure, 0),
  currentExposure: rows.reduce((sum, row) => sum + row.currentExposure, 0),
  thirtyExposure: rows.reduce((sum, row) => sum + row.thirtyDayExposure, 0),
  sixtyExposure: rows.reduce((sum, row) => sum + row.sixtyDayExposure, 0),
  ninetyExposure: rows.reduce((sum, row) => sum + row.ninetyDayExposure, 0),
  highRiskExposure: rows.reduce((sum, row) => sum + row.highRiskExposure, 0),
  collectedValue: rows.reduce((sum, row) => sum + row.collectedValue, 0),
  invoicedValue: rows.reduce((sum, row) => sum + row.invoicedValue, 0),
  collectionRate: (() => {
    const invoiced = rows.reduce((sum, row) => sum + row.invoicedValue, 0);
    const collected = rows.reduce((sum, row) => sum + row.collectedValue, 0);
    return invoiced > 0 ? (collected / invoiced) * 100 : 0;
  })(),
  averageAgeDays: (() => {
    const totalExposure = rows.reduce((sum, row) => sum + row.totalExposure, 0);
    const weighted = rows.reduce(
      (sum, row) => sum + row.averageAgeDays * row.totalExposure,
      0
    );
    return totalExposure > 0 ? weighted / totalExposure : 0;
  })(),
  topCustomers: rows
    .filter((row) => row.totalExposure > 0)
    .sort((left, right) => right.totalExposure - left.totalExposure)
    .slice(0, 5)
    .map((row) => ({
      name: row.customerName,
      code: row.customerCode,
      contact: row.customerContact,
      customerGroup: row.customerGroup,
      exposure: row.totalExposure,
    })),
});

const mapAttentionQueueRowToItem = (
  row: CommandCenterAttentionQueueRow
): AttentionItem => ({
  id: row.entityId || row.headline,
  orderId: row.entityId || row.reasonCode,
  customerName: row.customerCode || "Unknown customer",
  tone:
    row.severity === "critical"
      ? "red"
      : row.severity === "high"
      ? "orange"
      : "blue",
  title: row.headline || "Attention required",
  detail: `${row.queueType || "queue"} • ${row.reasonCode || "review"}`,
  meta: row.ageHours !== null ? `${formatShortAge(row.ageHours)} • ${row.owner || "Unassigned"}` : row.owner || "Unassigned",
  amount: row.amount,
});

const buildTargetSummary = (
  timeframe: Timeframe,
  summary: SummaryMetrics,
  periodFinancial: FinancialSnapshot,
  summaryDate: string,
  targets: CommandCenterTargetRow[]
): TargetSummary | null => {
  if (!targets.length) {
    return null;
  }

  const parsed = summaryDate ? new Date(`${summaryDate}T00:00:00.000Z`) : new Date();
  const year = parsed.getUTCFullYear();
  const quarter = Math.floor(parsed.getUTCMonth() / 3) + 1;
  const expectedPeriod = `${year}-Q${quarter}`;
  const scopeTarget =
    targets.find(
      (target) =>
        target.ownerType === "All" &&
        target.period === expectedPeriod
    ) ||
    targets.find((target) => target.ownerType === "All") ||
    targets[0];

  if (!scopeTarget) {
    return null;
  }

  const bookingTarget = scopeTarget.bookingTarget;
  const dispatchTarget = scopeTarget.dispatchTarget;
  const collectionTarget = scopeTarget.collectionTarget;

  return {
    period: timeframe === "QTD" ? scopeTarget.period : `${scopeTarget.period} (${timeframe})`,
    bookingTarget,
    dispatchTarget,
    collectionTarget,
    marginTarget: scopeTarget.marginTarget,
    bookingVariance: summary.totalValue - bookingTarget,
    dispatchVariance: summary.dispatchedValue - dispatchTarget,
    collectionVariance: periodFinancial.collectedValue - collectionTarget,
  };
};

export const buildManagerAnalyticsModelFromCommandCenterPayload = (
  payload: CommandCenterPayload | null,
  timeframe: Timeframe
): ManagerAnalyticsModel => {
  if (!payload) {
    return buildManagerAnalyticsModel(null, timeframe);
  }

  const allOrders = payload.pipeline.map(mapRepositoryOrderToGroupedOrder);
  const currentRange = getCurrentRange(timeframe);
  const previousRange = getPreviousRange(timeframe);
  const filterSummaryHistoryByRange = (range: DateRange) =>
    payload.summaryHistory.filter((row) => {
      if (!row.asOfDate) {
        return false;
      }

      const parsed = new Date(`${row.asOfDate}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && isWithinRange(parsed, range);
    });
  const aggregatePeriodFinancial = (rows: typeof payload.summaryHistory) => {
    const collectedValue = rows.reduce((sum, row) => sum + row.collectedValue, 0);
    const invoicedValue = rows.reduce((sum, row) => sum + row.invoicedValue, 0);

    return {
      ...financial,
      collectedValue,
      invoicedValue,
      collectionRate: invoicedValue > 0 ? (collectedValue / invoicedValue) * 100 : 0,
      averageAgeDays: financial.averageAgeDays,
    };
  };
  const currentOrders = filterOrdersByRange(allOrders, currentRange);
  const previousOrders = filterOrdersByRange(allOrders, previousRange);
  const summary = buildSummaryMetrics(currentOrders);
  const previousSummary = buildSummaryMetrics(previousOrders);
  const financial = mapRepositoryCustomersToFinancial(payload.customers);
  const currentSummaryHistory = filterSummaryHistoryByRange(currentRange);
  const previousSummaryHistory = filterSummaryHistoryByRange(previousRange);
  const periodFinancial = aggregatePeriodFinancial(currentSummaryHistory);
  const previousPeriodFinancial =
    previousSummaryHistory.length > 0
      ? aggregatePeriodFinancial(previousSummaryHistory)
      : {
          ...financial,
          collectedValue: 0,
          invoicedValue: 0,
          collectionRate: 0,
          averageAgeDays: financial.averageAgeDays,
        };
  const reps = buildRepInsights(currentOrders);
  const sources = buildSourceInsights(currentOrders);
  const productGroups = buildProductGroupInsightsFromOrders(currentOrders);
  const pipeline = buildPipelineStages(currentOrders, summary);
  const attentionItems =
    payload.attentionQueue.length > 0
      ? payload.attentionQueue.map(mapAttentionQueueRowToItem).slice(0, 8)
      : buildAttentionItems(currentOrders, summary);
  const targetSummary = buildTargetSummary(
    timeframe,
    summary,
    periodFinancial,
    payload.summary.asOfDate,
    payload.targets
  );
  const focusSignals = buildFocusSignals(summary, financial, sources, reps);
  const activities = buildActivityInsights(currentOrders);
  const trends = {
    overview: buildTrendSeries(currentOrders, timeframe, "overview"),
    revenue: buildTrendSeries(currentOrders, timeframe, "revenue"),
    execution: buildTrendSeries(currentOrders, timeframe, "execution"),
  } as Record<ViewMode, TrendPoint[]>;

  return {
    currentOrderLines: [],
    currentOrders,
    currentLedgerRows: [],
    summary,
    previousSummary,
    financial,
    periodFinancial,
    previousPeriodFinancial,
    reps,
    sources,
    productGroups,
    pipeline,
    attentionItems,
    targetSummary,
    focusSignals,
    activities,
    comparisons: {
      booked: buildComparisonMetric(summary.totalValue, previousSummary.totalValue),
      orders: buildComparisonMetric(summary.orderCount, previousSummary.orderCount),
      collections: buildComparisonMetric(
        periodFinancial.collectedValue,
        previousPeriodFinancial.collectedValue
      ),
      dispatchRate: buildComparisonMetric(
        summary.dispatchRate,
        previousSummary.dispatchRate
      ),
    },
    trends,
  };
};
