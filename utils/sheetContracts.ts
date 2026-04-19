export type AnalyticsSheetTab =
  | "New_Order_Table"
  | "Order_Header_Fact"
  | "Customer_Account_Snapshot"
  | "Analytics_KPI_Daily";

export type SheetColumnContract = {
  readonly key: string;
  readonly header: string;
  aliases?: readonly string[];
};

export type SheetContract = Readonly<{
  sheetName: AnalyticsSheetTab;
  kind: "raw" | "derived";
  columns: readonly SheetColumnContract[];
}>;

type SheetContractDefinition = Readonly<Omit<SheetContract, "sheetName">>;

export type HeaderMismatch = {
  index: number;
  expected: string;
  actual: string;
};

export type HeaderValidationResult = {
  sheetName: AnalyticsSheetTab;
  isValid: boolean;
  expectedHeaders: string[];
  actualHeaders: string[];
  missingHeaders: string[];
  unexpectedHeaders: string[];
  duplicateHeaders: string[];
  orderMismatches: HeaderMismatch[];
};

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const getAllowedHeaders = (column: SheetColumnContract): string[] =>
  [column.header, ...(column.aliases ?? [])].map(normalizeHeader);

const detectDuplicateHeaders = (headers: readonly string[]): string[] => {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  headers.forEach((header) => {
    const trimmedHeader = header.trim();
    const normalizedHeader = normalizeHeader(trimmedHeader);

    if (!normalizedHeader) {
      return;
    }

    counts.set(normalizedHeader, (counts.get(normalizedHeader) || 0) + 1);
    if (!labels.has(normalizedHeader)) {
      labels.set(normalizedHeader, trimmedHeader);
    }
  });

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([normalizedHeader]) => labels.get(normalizedHeader) || normalizedHeader);
};

const freezeSheetColumn = (column: SheetColumnContract): SheetColumnContract =>
  Object.freeze({
    key: column.key,
    header: column.header,
    ...(column.aliases
      ? {
          aliases: Object.freeze([...column.aliases]) as readonly string[],
        }
      : {}),
  });

const cloneSheetColumns = (
  columns: readonly SheetColumnContract[]
): readonly SheetColumnContract[] =>
  Object.freeze(columns.map((column) => freezeSheetColumn(column)));

const defineSheetContract = (
  kind: SheetContract["kind"],
  columns: readonly SheetColumnContract[]
): SheetContractDefinition =>
  Object.freeze({
    kind,
    columns: cloneSheetColumns(columns),
  });

const newOrderTableColumns = [
  { key: "sysTime", header: "SYS-TIME" },
  { key: "orderTime", header: "ORDER-TIME" },
  { key: "user", header: "USER" },
  { key: "orderComments", header: "ORDER COMMENTS" },
  { key: "customerName", header: "CUSTOMER NAME" },
  { key: "orderId", header: "ORDER ID" },
  { key: "productName", header: "PRODUCT NAME" },
  { key: "quantity", header: "QUANTITY" },
  { key: "unit", header: "UNIT" },
  { key: "productRate", header: "PRODUCT RATE" },
  { key: "orderAmount", header: "ORDER AMOUNT" },
  { key: "source", header: "SOURCE" },
  { key: "approvedByManager", header: "APPROVED BY MANAGER: Y/N/R" },
  { key: "managerComments", header: "MANAGER COMMENTS" },
  { key: "orderDispatched", header: "ORDER DISPATCHED: Y/N" },
  { key: "dispatchComments", header: "DISPATCH COMMENTS" },
  { key: "dispatchTime", header: "DISPATCH TIME" },
] as const satisfies readonly SheetColumnContract[];

const orderHeaderFactColumns = [
  { key: "orderId", header: "ORDER_ID" },
  { key: "customerName", header: "CUSTOMER_NAME" },
  { key: "customerCode", header: "CUSTOMER_CODE" },
  { key: "customerContact", header: "CUSTOMER_CONTACT" },
  { key: "user", header: "USER" },
  { key: "source", header: "SOURCE" },
  { key: "createdAt", header: "CREATED_AT" },
  { key: "dispatchAt", header: "DISPATCHED_AT" },
  { key: "status", header: "ORDER_STATUS" },
  { key: "itemCount", header: "ITEM_COUNT" },
  { key: "quantityTotal", header: "QUANTITY_TOTAL" },
  { key: "totalAmount", header: "TOTAL_AMOUNT" },
  { key: "approvedItems", header: "APPROVED_ITEM_COUNT" },
  { key: "dispatchedItems", header: "DISPATCHED_ITEM_COUNT" },
  { key: "cycleHours", header: "CYCLE_HOURS" },
  { key: "ageHours", header: "AGE_HOURS" },
  { key: "productGroups", header: "PRODUCT_GROUPS" },
  { key: "products", header: "PRODUCT_NAMES" },
  { key: "latestManagerComment", header: "LATEST_MANAGER_COMMENT" },
  { key: "latestDispatchComment", header: "LATEST_DISPATCH_COMMENT" },
] as const satisfies readonly SheetColumnContract[];

const customerAccountSnapshotColumns = [
  { key: "customerCode", header: "CUSTOMER_CODE" },
  { key: "customerName", header: "CUSTOMER_NAME" },
  { key: "customerContact", header: "CUSTOMER_CONTACT" },
  { key: "customerGroup", header: "CUSTOMER_GROUP" },
  { key: "totalExposure", header: "TOTAL_EXPOSURE" },
  { key: "currentExposure", header: "CURRENT_EXPOSURE" },
  { key: "thirtyDayExposure", header: "THIRTY_DAY_EXPOSURE" },
  { key: "sixtyDayExposure", header: "SIXTY_DAY_EXPOSURE" },
  { key: "ninetyDayExposure", header: "NINETY_DAY_EXPOSURE" },
  { key: "highRiskExposure", header: "HIGH_RISK_EXPOSURE" },
  { key: "collectedValue", header: "COLLECTED_VALUE" },
  { key: "invoicedValue", header: "INVOICED_VALUE" },
  { key: "collectionRate", header: "COLLECTION_RATE" },
  { key: "averageAgeDays", header: "AVERAGE_AGE_DAYS" },
  { key: "lastUpdatedAt", header: "LAST_UPDATED_AT" },
] as const satisfies readonly SheetColumnContract[];

const analyticsKpiDailyColumns = [
  { key: "asOfDate", header: "AS_OF_DATE" },
  { key: "orderCount", header: "ORDER_COUNT" },
  { key: "totalValue", header: "TOTAL_VALUE" },
  { key: "openValue", header: "OPEN_VALUE" },
  { key: "dispatchedValue", header: "DISPATCHED_VALUE" },
  { key: "dispatchedOrders", header: "DISPATCHED_ORDERS" },
  { key: "pendingApprovals", header: "PENDING_APPROVALS" },
  { key: "pendingApprovalValue", header: "PENDING_APPROVAL_VALUE" },
  { key: "pendingDispatches", header: "PENDING_DISPATCHES" },
  { key: "pendingDispatchValue", header: "PENDING_DISPATCH_VALUE" },
  { key: "rejectedOrders", header: "REJECTED_ORDERS" },
  { key: "rejectedValue", header: "REJECTED_VALUE" },
  { key: "activeCustomers", header: "ACTIVE_CUSTOMERS" },
  { key: "activeReps", header: "ACTIVE_REPS" },
  { key: "averageOrderValue", header: "AVERAGE_ORDER_VALUE" },
  { key: "dispatchRate", header: "DISPATCH_RATE" },
  { key: "throughputRate", header: "THROUGHPUT_RATE" },
  { key: "avgDispatchHours", header: "AVG_DISPATCH_HOURS" },
  { key: "averageOpenAgeHours", header: "AVERAGE_OPEN_AGE_HOURS" },
  { key: "agedPendingApprovals", header: "AGED_PENDING_APPROVALS" },
  { key: "agedDispatchQueue", header: "AGED_DISPATCH_QUEUE" },
  { key: "highValueThreshold", header: "HIGH_VALUE_THRESHOLD" },
  { key: "highValueOpenOrders", header: "HIGH_VALUE_OPEN_ORDERS" },
  { key: "topCustomerShare", header: "TOP_CUSTOMER_SHARE" },
  { key: "topSourceShare", header: "TOP_SOURCE_SHARE" },
  { key: "totalExposure", header: "TOTAL_EXPOSURE" },
  { key: "currentExposure", header: "CURRENT_EXPOSURE" },
  { key: "thirtyExposure", header: "THIRTY_EXPOSURE" },
  { key: "sixtyExposure", header: "SIXTY_EXPOSURE" },
  { key: "ninetyExposure", header: "NINETY_EXPOSURE" },
  { key: "highRiskExposure", header: "HIGH_RISK_EXPOSURE" },
  { key: "collectedValue", header: "COLLECTED_VALUE" },
  { key: "invoicedValue", header: "INVOICED_VALUE" },
  { key: "collectionRate", header: "COLLECTION_RATE" },
  { key: "averageAgeDays", header: "AVERAGE_AGE_DAYS" },
  { key: "lastUpdatedAt", header: "LAST_UPDATED_AT" },
] as const satisfies readonly SheetColumnContract[];

export const SHEET_CONTRACTS = {
  New_Order_Table: defineSheetContract("raw", newOrderTableColumns),
  Order_Header_Fact: defineSheetContract("derived", orderHeaderFactColumns),
  Customer_Account_Snapshot: defineSheetContract(
    "derived",
    customerAccountSnapshotColumns
  ),
  Analytics_KPI_Daily: defineSheetContract("derived", analyticsKpiDailyColumns),
} as const satisfies Readonly<Record<AnalyticsSheetTab, SheetContractDefinition>>;

export const ANALYTICS_SHEET_TABS = Object.freeze(
  Object.keys(SHEET_CONTRACTS) as AnalyticsSheetTab[]
);

export const getSheetContract = (sheetName: AnalyticsSheetTab): SheetContract => {
  const contract = SHEET_CONTRACTS[sheetName];

  return Object.freeze({
    sheetName,
    kind: contract.kind,
    columns: cloneSheetColumns(contract.columns),
  });
};

export const getExpectedHeaders = (sheetName: AnalyticsSheetTab): string[] =>
  SHEET_CONTRACTS[sheetName].columns.map((column) => column.header);

export const validateSheetHeaders = (
  contractOrSheetName: AnalyticsSheetTab | SheetContract,
  actualHeaders: readonly unknown[]
): HeaderValidationResult => {
  const contract =
    typeof contractOrSheetName === "string"
      ? getSheetContract(contractOrSheetName)
      : contractOrSheetName;
  const normalizedActualHeaders = actualHeaders.map((header) =>
    String(header ?? "").trim()
  );
  const missingHeaders: string[] = [];
  const unexpectedHeaders: string[] = [];
  const orderMismatches: HeaderMismatch[] = [];

  for (
    let index = 0;
    index < Math.max(contract.columns.length, normalizedActualHeaders.length);
    index += 1
  ) {
    const contractColumn = contract.columns[index];
    const actualHeader = normalizedActualHeaders[index] || "";

    if (!contractColumn) {
      if (actualHeader) {
        unexpectedHeaders.push(actualHeader);
      }
      continue;
    }

    const allowedHeaders = getAllowedHeaders(contractColumn);
    const normalizedActualHeader = normalizeHeader(actualHeader);

    if (!normalizedActualHeader) {
      missingHeaders.push(contractColumn.header);
      continue;
    }

    if (!allowedHeaders.includes(normalizedActualHeader)) {
      missingHeaders.push(contractColumn.header);
      unexpectedHeaders.push(actualHeader);
      orderMismatches.push({
        index: index + 1,
        expected: contractColumn.header,
        actual: actualHeader,
      });
    }
  }

  const duplicateHeaders = detectDuplicateHeaders(normalizedActualHeaders);

  return {
    sheetName: contract.sheetName,
    isValid:
      missingHeaders.length === 0 &&
      unexpectedHeaders.length === 0 &&
      duplicateHeaders.length === 0,
    expectedHeaders: contract.columns.map((column) => column.header),
    actualHeaders: normalizedActualHeaders,
    missingHeaders,
    unexpectedHeaders,
    duplicateHeaders,
    orderMismatches,
  };
};
