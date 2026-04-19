import {
  buildSummaryMetrics,
  type GroupedOrder,
  type LedgerRow,
} from "./managerAnalytics";

type DateLike = Date | string | null | undefined;

export type OrderHeaderFactRow = {
  orderId: string;
  customerName: string;
  customerCode: string;
  customerContact: string;
  user: string;
  source: string;
  createdAt: string;
  dispatchAt: string;
  status: GroupedOrder["status"];
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

export type CustomerAccountSnapshotRow = {
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

export type AnalyticsKpiDailyRow = {
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

type CustomerExposureAccumulator = {
  customerCode: string;
  customerName: string;
  customerContact: string;
  customerGroup: string;
  currentExposure: number;
  thirtyDayExposure: number;
  sixtyDayExposure: number;
  ninetyDayExposure: number;
  collectedValue: number;
  invoicedValue: number;
  weightedAgeValue: number;
};

const toIsoTimestamp = (value: Date | null): string => value?.toISOString() ?? "";

const joinValues = (values: readonly string[]): string =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" | ");

const normalizeLastUpdatedAt = (value: DateLike): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  return typeof value === "string" ? value.trim() : "";
};

const normalizeAsOfDate = (value: DateLike): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  return typeof value === "string" ? value.trim().slice(0, 10) : "";
};

const buildSnapshotStamp = (options?: {
  asOfDate?: DateLike;
  lastUpdatedAt?: DateLike;
}) => ({
  asOfDate: normalizeAsOfDate(options?.asOfDate ?? options?.lastUpdatedAt),
  lastUpdatedAt: normalizeLastUpdatedAt(options?.lastUpdatedAt),
});

const getCustomerLedgerKey = (row: LedgerRow): string =>
  row.customerName.trim() || row.customerCode.trim() || "Unknown customer";

const createCustomerAccumulator = (row: LedgerRow): CustomerExposureAccumulator => ({
  customerCode: row.customerCode,
  customerName: row.customerName || "Unknown customer",
  customerContact: row.contact,
  customerGroup: row.customerGroup,
  currentExposure: 0,
  thirtyDayExposure: 0,
  sixtyDayExposure: 0,
  ninetyDayExposure: 0,
  collectedValue: 0,
  invoicedValue: 0,
  weightedAgeValue: 0,
});

const applyCustomerIdentity = (
  accumulator: CustomerExposureAccumulator,
  row: LedgerRow
): CustomerExposureAccumulator => {
  if (!accumulator.customerCode && row.customerCode) {
    accumulator.customerCode = row.customerCode;
  }
  if (!accumulator.customerContact && row.contact) {
    accumulator.customerContact = row.contact;
  }
  if (!accumulator.customerGroup && row.customerGroup) {
    accumulator.customerGroup = row.customerGroup;
  }

  return accumulator;
};

const rollupCustomerExposure = (
  ledgerRows: readonly LedgerRow[],
  lastUpdatedAt: string
): CustomerAccountSnapshotRow[] => {
  const customerMap = new Map<string, CustomerExposureAccumulator>();

  ledgerRows.forEach((row) => {
    const key = getCustomerLedgerKey(row);
    const accumulator = applyCustomerIdentity(
      customerMap.get(key) ?? createCustomerAccumulator(row),
      row
    );

    if (row.dc === "C") {
      accumulator.collectedValue += row.amount;
      customerMap.set(key, accumulator);
      return;
    }

    if (row.dc !== "D") {
      customerMap.set(key, accumulator);
      return;
    }

    accumulator.invoicedValue += row.amount;
    const ageDays = row.ageDays || 0;

    if (ageDays <= 30) {
      accumulator.currentExposure += row.amount;
    } else if (ageDays <= 60) {
      accumulator.thirtyDayExposure += row.amount;
    } else if (ageDays <= 90) {
      accumulator.sixtyDayExposure += row.amount;
    } else {
      accumulator.ninetyDayExposure += row.amount;
    }

    accumulator.weightedAgeValue += ageDays * row.amount;
    customerMap.set(key, accumulator);
  });

  return Array.from(customerMap.values())
    .map<CustomerAccountSnapshotRow>((customer) => {
      const totalExposure =
        customer.currentExposure +
        customer.thirtyDayExposure +
        customer.sixtyDayExposure +
        customer.ninetyDayExposure;
      const highRiskExposure = customer.sixtyDayExposure + customer.ninetyDayExposure;

      return {
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        customerContact: customer.customerContact,
        customerGroup: customer.customerGroup,
        totalExposure,
        currentExposure: customer.currentExposure,
        thirtyDayExposure: customer.thirtyDayExposure,
        sixtyDayExposure: customer.sixtyDayExposure,
        ninetyDayExposure: customer.ninetyDayExposure,
        highRiskExposure,
        collectedValue: customer.collectedValue,
        invoicedValue: customer.invoicedValue,
        collectionRate:
          customer.invoicedValue > 0
            ? (customer.collectedValue / customer.invoicedValue) * 100
            : 0,
        averageAgeDays:
          totalExposure > 0 ? customer.weightedAgeValue / totalExposure : 0,
        lastUpdatedAt,
      };
    })
    .filter(
      (customer) =>
        customer.totalExposure > 0 ||
        customer.collectedValue > 0 ||
        customer.invoicedValue > 0
    )
    .sort(
      (left, right) =>
        right.totalExposure - left.totalExposure ||
        right.invoicedValue - left.invoicedValue ||
        left.customerName.localeCompare(right.customerName)
    );
};

export const buildOrderHeaderFactRows = (
  groupedOrders: readonly GroupedOrder[]
): OrderHeaderFactRow[] =>
  groupedOrders.map((order) => ({
    orderId: order.orderId,
    customerName: order.customerName,
    customerCode: order.customerCode,
    customerContact: order.customerContact,
    user: order.user,
    source: order.source,
    createdAt: toIsoTimestamp(order.createdAt),
    dispatchAt: toIsoTimestamp(order.dispatchAt),
    status: order.status,
    itemCount: order.itemCount,
    quantityTotal: order.quantityTotal,
    totalAmount: order.totalAmount,
    approvedItems: order.approvedItems,
    dispatchedItems: order.dispatchedItems,
    cycleHours: order.cycleHours,
    ageHours: order.ageHours,
    productGroups: joinValues(order.productGroups),
    products: joinValues(order.products),
    latestManagerComment: order.latestManagerComment,
    latestDispatchComment: order.latestDispatchComment,
  }));

export const buildCustomerAccountSnapshotRows = (
  ledgerRows: readonly LedgerRow[],
  options?: { lastUpdatedAt?: DateLike }
): CustomerAccountSnapshotRow[] => {
  const { lastUpdatedAt } = buildSnapshotStamp(options);
  return rollupCustomerExposure(ledgerRows, lastUpdatedAt);
};

export const buildAnalyticsKpiDailyRows = (
  groupedOrders: readonly GroupedOrder[],
  ledgerRows: readonly LedgerRow[],
  options?: {
    asOfDate?: DateLike;
    lastUpdatedAt?: DateLike;
  }
): AnalyticsKpiDailyRow[] => {
  const summary = buildSummaryMetrics([...groupedOrders]);
  const { asOfDate, lastUpdatedAt } = buildSnapshotStamp(options);
  const customerSnapshots = rollupCustomerExposure(ledgerRows, lastUpdatedAt);
  const totalExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.totalExposure,
    0
  );
  const currentExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.currentExposure,
    0
  );
  const thirtyExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.thirtyDayExposure,
    0
  );
  const sixtyExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.sixtyDayExposure,
    0
  );
  const ninetyExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.ninetyDayExposure,
    0
  );
  const highRiskExposure = customerSnapshots.reduce(
    (sum, row) => sum + row.highRiskExposure,
    0
  );
  const collectedValue = customerSnapshots.reduce(
    (sum, row) => sum + row.collectedValue,
    0
  );
  const invoicedValue = customerSnapshots.reduce(
    (sum, row) => sum + row.invoicedValue,
    0
  );
  const weightedAverageAgeNumerator = customerSnapshots.reduce(
    (sum, row) => sum + row.averageAgeDays * row.totalExposure,
    0
  );
  const averageAgeDays =
    totalExposure > 0 ? weightedAverageAgeNumerator / totalExposure : 0;

  return [
    {
      asOfDate,
      orderCount: summary.orderCount,
      totalValue: summary.totalValue,
      openValue: summary.openValue,
      dispatchedValue: summary.dispatchedValue,
      dispatchedOrders: summary.dispatchedOrders,
      pendingApprovals: summary.pendingApprovals,
      pendingApprovalValue: summary.pendingApprovalValue,
      pendingDispatches: summary.pendingDispatches,
      pendingDispatchValue: summary.pendingDispatchValue,
      rejectedOrders: summary.rejectedOrders,
      rejectedValue: summary.rejectedValue,
      activeCustomers: summary.activeCustomers,
      activeReps: summary.activeReps,
      averageOrderValue: summary.averageOrderValue,
      dispatchRate: summary.dispatchRate,
      throughputRate: summary.throughputRate,
      avgDispatchHours: summary.avgDispatchHours,
      averageOpenAgeHours: summary.averageOpenAgeHours,
      agedPendingApprovals: summary.agedPendingApprovals,
      agedDispatchQueue: summary.agedDispatchQueue,
      highValueThreshold: summary.highValueThreshold,
      highValueOpenOrders: summary.highValueOpenOrders,
      topCustomerShare: summary.topCustomerShare,
      topSourceShare: summary.topSourceShare,
      totalExposure,
      currentExposure,
      thirtyExposure,
      sixtyExposure,
      ninetyExposure,
      highRiskExposure,
      collectedValue,
      invoicedValue,
      collectionRate:
        invoicedValue > 0 ? (collectedValue / invoicedValue) * 100 : 0,
      averageAgeDays,
      lastUpdatedAt,
    },
  ];
};

export const COMMAND_CENTER_TRANSFORM_BUILDERS = Object.freeze({
  Order_Header_Fact: buildOrderHeaderFactRows,
  Customer_Account_Snapshot: buildCustomerAccountSnapshotRows,
  Analytics_KPI_Daily: buildAnalyticsKpiDailyRows,
});
