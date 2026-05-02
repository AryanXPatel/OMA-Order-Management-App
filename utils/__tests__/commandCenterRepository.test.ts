import {
  createCommandCenterRepository,
  type CommandCenterPayload,
} from "../commandCenterRepository";

jest.mock("../apiManager", () => ({
  BACKEND_URL: "http://localhost:3000",
  apiCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  fetchWithRetry: jest.fn(),
}));

describe("commandCenterRepository", () => {
  it("builds a typed manager payload from derived tabs", async () => {
    const calls: string[] = [];
    const repository = createCommandCenterRepository({
      cache: {
        get: () => null,
        set: () => undefined,
      },
      fetchSheetRangeObjects: async (range) => {
        calls.push(range);

        if (range.startsWith("Analytics_KPI_Daily")) {
          return [
            {
              as_of_date: "2026-04-18",
              order_count: "30",
              total_value: "200",
              open_value: "20",
              dispatched_value: "180",
              dispatched_orders: "12",
              pending_approvals: "1",
              pending_approval_value: "10",
              pending_dispatches: "2",
              pending_dispatch_value: "20",
              rejected_orders: "1",
              rejected_value: "5",
              active_customers: "10",
              active_reps: "2",
              average_order_value: "6.66",
              dispatch_rate: "40",
              throughput_rate: "60",
              avg_dispatch_hours: "8",
              average_open_age_hours: "12",
              aged_pending_approvals: "0",
              aged_dispatch_queue: "0",
              high_value_threshold: "100000",
              high_value_open_orders: "0",
              top_customer_share: "0.5",
              top_source_share: "0.5",
              total_exposure: "100",
              current_exposure: "10",
              thirty_exposure: "20",
              sixty_exposure: "30",
              ninety_exposure: "40",
              high_risk_exposure: "70",
              collected_value: "50",
              invoiced_value: "100",
              collection_rate: "50",
              average_age_days: "30",
              last_updated_at: "2026-04-18T00:36:00.000Z",
            },
            {
              as_of_date: "2026-04-19",
              order_count: "37",
              total_value: "244281080",
              open_value: "5001035",
              dispatched_value: "239280045",
              dispatched_orders: "28",
              pending_approvals: "1",
              pending_approval_value: "2409000",
              pending_dispatches: "7",
              pending_dispatch_value: "2588415",
              rejected_orders: "1",
              rejected_value: "3620",
              active_customers: "19",
              active_reps: "3",
              average_order_value: "6602191.35",
              dispatch_rate: "75.68",
              throughput_rate: "94.59",
              avg_dispatch_hours: "592.62",
              average_open_age_hours: "6759.13",
              aged_pending_approvals: "0",
              aged_dispatch_queue: "7",
              high_value_threshold: "100000",
              high_value_open_orders: "7",
              top_customer_share: "0.803",
              top_source_share: "0.9519",
              total_exposure: "1940348",
              current_exposure: "0",
              thirty_exposure: "0",
              sixty_exposure: "0",
              ninety_exposure: "1940348",
              high_risk_exposure: "1940348",
              collected_value: "1166709",
              invoiced_value: "1940348",
              collection_rate: "60.13",
              average_age_days: "626.59",
              last_updated_at: "2026-04-19T00:36:00.000Z",
            },
          ];
        }

        if (range.startsWith("Order_Header_Fact")) {
          return [
            {
              order_id: "2025-2026_00074",
              customer_name: "Reliance Digital Mumbai",
              customer_code: "100101",
              customer_contact: "9812345670",
              user: "Manager",
              source: "WhatsApp",
              created_at: "2025-05-21T05:10:00.000Z",
              dispatch_at: "2025-05-21T07:17:00.000Z",
              status: "dispatched",
              item_count: "3",
              quantity_total: "6",
              total_amount: "353996",
              approved_items: "3",
              dispatched_items: "3",
              cycle_hours: "2.12",
              age_hours: "",
              product_groups: "Headphones | Smartphones | Smartwatches",
              products:
                "Apple iPhone 17 Air | Samsung Galaxy Watch 6 | Sony WH-1000XM6 Headphones",
              latest_manager_comment: "Bulk display approved",
              latest_dispatch_comment: "Blue Dart DO 876",
            },
          ];
        }

        if (range.startsWith("Attention_Queue_Snapshot")) {
          return [
            {
              snapshot_date: "2026-04-19",
              queue_type: "orders",
              entity_type: "order",
              entity_id: "2025-2026_00074",
              customer_code: "100101",
              severity: "critical",
              reason_code: "rejected_order",
              headline: "Reliance Digital Mumbai order requires attention",
              amount: "353996",
              age_hours: "24",
              owner: "Manager",
            },
          ];
        }

        if (range.startsWith("Targets")) {
          return [
            {
              period: "2025-Q2",
              owner_type: "All",
              owner_name: "All",
              booking_target: "1500000",
              dispatch_target: "1200000",
              collection_target: "1000000",
              margin_target: "18",
            },
          ];
        }

        return [
          {
            customer_code: "100101",
            customer_name: "Reliance Digital Mumbai",
            customer_contact: "9812345670",
            customer_group: "Sundry Debtors",
            total_exposure: "353996",
            current_exposure: "0",
            thirty_day_exposure: "0",
            sixty_day_exposure: "0",
            ninety_day_exposure: "353996",
            high_risk_exposure: "353996",
            collected_value: "219000",
            invoiced_value: "353996",
            collection_rate: "61.87",
            average_age_days: "90",
            last_updated_at: "2026-04-19T00:36:00.000Z",
          },
        ];
      },
    });

    const payload = await repository.getManagerPayload("QTD");

    expect(calls).toHaveLength(5);
    expect(calls).toEqual(
      expect.arrayContaining([
        "Attention_Queue_Snapshot!A1:Z",
        "Targets!A1:Z",
      ])
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        "Analytics_KPI_Daily!A1:AZ",
        "Order_Header_Fact!A1:Z",
        "Customer_Account_Snapshot!A1:Z",
      ])
    );
    expect(payload.timeframe).toBe("QTD");
    expect(payload.summary.asOfDate).toBe("2026-04-19");
    expect(payload.summaryHistory).toHaveLength(2);
    expect(payload.summaryHistory[0].asOfDate).toBe("2026-04-19");
    expect(payload.summary.orderCount).toBe(37);
    expect(payload.summary.totalExposure).toBe(1940348);
    expect(payload.pipeline[0].orderId).toBe("2025-2026_00074");
    expect(payload.pipeline[0].cycleHours).toBeCloseTo(2.12, 2);
    expect(payload.customers[0].customerCode).toBe("100101");
    expect(payload.customers[0].collectionRate).toBeCloseTo(61.87, 2);
    expect(payload.attentionQueue[0].entityId).toBe("2025-2026_00074");
    expect(payload.targets[0].bookingTarget).toBe(1500000);
  });

  it("returns cached payloads without refetching", async () => {
    const cachedPayload: CommandCenterPayload = {
      timeframe: "MTD",
      summary: {
        asOfDate: "2026-04-19",
        orderCount: 1,
        totalValue: 100,
        openValue: 0,
        dispatchedValue: 100,
        dispatchedOrders: 1,
        pendingApprovals: 0,
        pendingApprovalValue: 0,
        pendingDispatches: 0,
        pendingDispatchValue: 0,
        rejectedOrders: 0,
        rejectedValue: 0,
        activeCustomers: 1,
        activeReps: 1,
        averageOrderValue: 100,
        dispatchRate: 100,
        throughputRate: 100,
        avgDispatchHours: 1,
        averageOpenAgeHours: null,
        agedPendingApprovals: 0,
        agedDispatchQueue: 0,
        highValueThreshold: 100000,
        highValueOpenOrders: 0,
        topCustomerShare: 1,
        topSourceShare: 1,
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
        lastUpdatedAt: "2026-04-19T00:36:00.000Z",
      },
      summaryHistory: [],
      pipeline: [],
      customers: [],
      attentionQueue: [],
      targets: [],
    };

    const repository = createCommandCenterRepository({
      cache: {
        get: () => cachedPayload,
        set: () => undefined,
      },
      fetchSheetRangeObjects: async () => {
        throw new Error("fetch should not be called");
      },
    });

    const payload = await repository.getManagerPayload("MTD");
    expect(payload).toBe(cachedPayload);
  });

  it("can bypass cache when requested", async () => {
    let fetchCount = 0;
    const repository = createCommandCenterRepository({
      cache: {
        get: () =>
          ({
            timeframe: "QTD",
            summary: {
              asOfDate: "stale",
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
              highValueThreshold: 0,
              highValueOpenOrders: 0,
              topCustomerShare: 0,
              topSourceShare: 0,
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
              lastUpdatedAt: "",
            },
            summaryHistory: [],
            pipeline: [],
            customers: [],
          } as CommandCenterPayload),
        set: () => undefined,
      },
      fetchSheetRangeObjects: async (range) => {
        fetchCount += 1;
        if (range.startsWith("Analytics_KPI_Daily")) {
          return [
            {
              as_of_date: "2026-04-19",
              order_count: "2",
              total_value: "200",
              open_value: "100",
              dispatched_value: "100",
              dispatched_orders: "1",
              pending_approvals: "1",
              pending_approval_value: "100",
              pending_dispatches: "0",
              pending_dispatch_value: "0",
              rejected_orders: "0",
              rejected_value: "0",
              active_customers: "1",
              active_reps: "1",
              average_order_value: "100",
              dispatch_rate: "50",
              throughput_rate: "50",
              avg_dispatch_hours: "1",
              average_open_age_hours: "2",
              aged_pending_approvals: "0",
              aged_dispatch_queue: "0",
              high_value_threshold: "100000",
              high_value_open_orders: "0",
              top_customer_share: "1",
              top_source_share: "1",
              total_exposure: "0",
              current_exposure: "0",
              thirty_exposure: "0",
              sixty_exposure: "0",
              ninety_exposure: "0",
              high_risk_exposure: "0",
              collected_value: "0",
              invoiced_value: "0",
              collection_rate: "0",
              average_age_days: "0",
              last_updated_at: "2026-04-19T00:36:00.000Z",
            },
          ];
        }
        return [];
      },
    });

    const payload = await repository.getManagerPayload("QTD", {
      skipCache: true,
    });

    expect(fetchCount).toBe(5);
    expect(payload.summary.orderCount).toBe(2);
  });

});
