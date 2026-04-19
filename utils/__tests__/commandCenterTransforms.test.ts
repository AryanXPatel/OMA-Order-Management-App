import {
  buildAnalyticsKpiDailyRows,
  buildCustomerAccountSnapshotRows,
  buildOrderHeaderFactRows,
} from "../commandCenterTransforms";
import type { GroupedOrder, LedgerRow } from "../managerAnalytics";

const createGroupedOrder = (overrides: Partial<GroupedOrder> = {}): GroupedOrder => ({
  orderId: "ORD-001",
  customerName: "Acme Retail",
  customerCode: "ACM001",
  customerContact: "9999999999",
  user: "Sam",
  source: "WhatsApp",
  createdAt: new Date("2025-01-01T04:30:00.000Z"),
  dispatchAt: null,
  totalAmount: 1000,
  status: "pending",
  itemCount: 1,
  quantityTotal: 1,
  approvedItems: 0,
  dispatchedItems: 0,
  cycleHours: null,
  ageHours: 12,
  productGroups: ["Phones"],
  products: ["Phone X"],
  latestManagerComment: "",
  latestDispatchComment: "",
  ...overrides,
});

const createLedgerRow = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  date: "01/01/2025",
  amount: 1000,
  signedAmount: 1000,
  dc: "D",
  description: "Invoice",
  fiscalYear: "2024-25",
  customerCode: "ACM001",
  customerGroup: "Retail",
  customerName: "Acme Retail",
  contact: "9999999999",
  voucherType: "Sales",
  parsedDate: new Date("2025-01-01T00:00:00.000Z"),
  ageDays: 10,
  ...overrides,
});

describe("commandCenterTransforms", () => {
  const groupedOrders: GroupedOrder[] = [
    createGroupedOrder({
      orderId: "ORD-001",
      totalAmount: 2000,
      status: "pending",
      itemCount: 2,
      quantityTotal: 3,
      ageHours: 30,
      productGroups: ["Phones", "Accessories"],
      products: ["Phone X", "Case Pro"],
      latestManagerComment: "Need manager approval",
    }),
    createGroupedOrder({
      orderId: "ORD-002",
      customerName: "Beta Stores",
      customerCode: "BET002",
      customerContact: "8888888888",
      user: "Priya",
      source: "Phone",
      createdAt: new Date("2025-01-02T05:00:00.000Z"),
      totalAmount: 5000,
      status: "approved",
      quantityTotal: 4,
      approvedItems: 1,
      ageHours: 10,
      products: ["Tablet Z"],
      productGroups: ["Tablets"],
      latestManagerComment: "Approved for dispatch",
    }),
    createGroupedOrder({
      orderId: "ORD-003",
      totalAmount: 3000,
      status: "dispatched",
      createdAt: new Date("2025-01-03T05:30:00.000Z"),
      dispatchAt: new Date("2025-01-03T10:30:00.000Z"),
      cycleHours: 5,
      ageHours: null,
      approvedItems: 1,
      dispatchedItems: 1,
      products: ["Phone X"],
      productGroups: ["Phones"],
      latestDispatchComment: "Handed to courier",
    }),
  ];

  const ledgerRows: LedgerRow[] = [
    createLedgerRow({
      customerCode: "ACM001",
      customerName: "Acme Retail",
      amount: 1000,
      ageDays: 10,
    }),
    createLedgerRow({
      customerCode: "ACM001",
      customerName: "Acme Retail",
      amount: 1000,
      ageDays: 40,
    }),
    createLedgerRow({
      customerCode: "ACM001",
      customerName: "Acme Retail",
      amount: 400,
      signedAmount: -400,
      dc: "C",
      ageDays: 5,
      voucherType: "Receipt",
    }),
    createLedgerRow({
      customerCode: "BET002",
      customerName: "Beta Stores",
      customerGroup: "Wholesale",
      contact: "8888888888",
      amount: 500,
      ageDays: 100,
    }),
    createLedgerRow({
      customerCode: "BET002",
      customerName: "Beta Stores",
      customerGroup: "Wholesale",
      contact: "8888888888",
      amount: 100,
      signedAmount: -100,
      dc: "C",
      ageDays: 2,
      voucherType: "Receipt",
    }),
  ];

  it("builds order header fact rows from grouped orders", () => {
    expect(buildOrderHeaderFactRows([groupedOrders[0]])).toEqual([
      {
        orderId: "ORD-001",
        customerName: "Acme Retail",
        customerCode: "ACM001",
        customerContact: "9999999999",
        user: "Sam",
        source: "WhatsApp",
        createdAt: "2025-01-01T04:30:00.000Z",
        dispatchAt: "",
        status: "pending",
        itemCount: 2,
        quantityTotal: 3,
        totalAmount: 2000,
        approvedItems: 0,
        dispatchedItems: 0,
        cycleHours: null,
        ageHours: 30,
        productGroups: "Phones | Accessories",
        products: "Phone X | Case Pro",
        latestManagerComment: "Need manager approval",
        latestDispatchComment: "",
      },
    ]);
  });

  it("aggregates customer account snapshot rows from ledger rows", () => {
    const rows = buildCustomerAccountSnapshotRows(ledgerRows, {
      lastUpdatedAt: "2025-01-10T18:30:00.000Z",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      customerCode: "ACM001",
      customerName: "Acme Retail",
      customerContact: "9999999999",
      customerGroup: "Retail",
      totalExposure: 2000,
      currentExposure: 1000,
      thirtyDayExposure: 1000,
      sixtyDayExposure: 0,
      ninetyDayExposure: 0,
      highRiskExposure: 0,
      collectedValue: 400,
      invoicedValue: 2000,
      collectionRate: 20,
      averageAgeDays: 25,
      lastUpdatedAt: "2025-01-10T18:30:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      customerCode: "BET002",
      customerName: "Beta Stores",
      customerGroup: "Wholesale",
      totalExposure: 500,
      currentExposure: 0,
      thirtyDayExposure: 0,
      sixtyDayExposure: 0,
      ninetyDayExposure: 500,
      highRiskExposure: 500,
      collectedValue: 100,
      invoicedValue: 500,
      collectionRate: 20,
      averageAgeDays: 100,
      lastUpdatedAt: "2025-01-10T18:30:00.000Z",
    });
  });

  it("builds a daily KPI row from the existing manager analytics semantics", () => {
    const [row] = buildAnalyticsKpiDailyRows(groupedOrders, ledgerRows, {
      lastUpdatedAt: "2025-01-10T18:30:00.000Z",
    });

    expect(row.asOfDate).toBe("2025-01-10");
    expect(row.lastUpdatedAt).toBe("2025-01-10T18:30:00.000Z");
    expect(row.orderCount).toBe(3);
    expect(row.totalValue).toBe(10000);
    expect(row.openValue).toBe(7000);
    expect(row.dispatchedValue).toBe(3000);
    expect(row.dispatchedOrders).toBe(1);
    expect(row.pendingApprovals).toBe(1);
    expect(row.pendingApprovalValue).toBe(2000);
    expect(row.pendingDispatches).toBe(1);
    expect(row.pendingDispatchValue).toBe(5000);
    expect(row.activeCustomers).toBe(2);
    expect(row.activeReps).toBe(2);
    expect(row.averageOrderValue).toBeCloseTo(3333.33, 2);
    expect(row.dispatchRate).toBeCloseTo(33.33, 2);
    expect(row.throughputRate).toBeCloseTo(66.67, 2);
    expect(row.avgDispatchHours).toBe(5);
    expect(row.averageOpenAgeHours).toBe(20);
    expect(row.agedPendingApprovals).toBe(1);
    expect(row.agedDispatchQueue).toBe(0);
    expect(row.highValueThreshold).toBe(100000);
    expect(row.highValueOpenOrders).toBe(0);
    expect(row.topCustomerShare).toBeCloseTo(0.5, 5);
    expect(row.topSourceShare).toBeCloseTo(0.5, 5);
    expect(row.totalExposure).toBe(2500);
    expect(row.currentExposure).toBe(1000);
    expect(row.thirtyExposure).toBe(1000);
    expect(row.sixtyExposure).toBe(0);
    expect(row.ninetyExposure).toBe(500);
    expect(row.highRiskExposure).toBe(500);
    expect(row.collectedValue).toBe(500);
    expect(row.invoicedValue).toBe(2500);
    expect(row.collectionRate).toBe(20);
    expect(row.averageAgeDays).toBe(40);
  });
});
