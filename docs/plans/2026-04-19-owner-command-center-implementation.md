# Owner Command Center Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current raw-sheet, client-reconstructed analytics with a business-owner command center backed by stable Google Sheets contracts, derived read-model tabs, and a typed frontend repository that powers exception-first mobile analytics.

**Architecture:** Keep the current Google Sheets tabs as the operational write path, make only append-only raw-column additions, and introduce read-optimized tabs for analytics consumption: `Order_Header_Fact`, `Customer_Account_Snapshot`, and `Analytics_KPI_Daily` first; later `AR_Open_Items_Fact`, `Rep_Performance_Daily`, `Product_Group_Daily`, `Source_Channel_Daily`, `Attention_Queue_Snapshot`, and `Targets`. Frontend code stops recomputing business logic from positional arrays and instead reads header-mapped objects through a single repository and typed model layer.

**Tech Stack:** Expo Router, TypeScript, React Native, Jest (`jest-expo`), AsyncStorage/API cache, Google Sheets-backed OMA backend, existing `/api/sheets/*` endpoints.

---

## Business Definitions To Freeze Before Coding

- `bookings`: order amount at order creation time from `New_Order_Table`
- `dispatch_value`: value of fully or partially dispatched order lines
- `invoiced_value`: amount linked to invoice rows or invoice-linked order headers
- `collections_value`: cash/credit receipts actually collected
- `ar_exposure`: open outstanding receivables only, not all debit transactions
- `owner_command_center`: a mobile-first page answering “what revenue or cash is at risk today, where is the flow stuck, and what should I act on first?”

## Required Workbook Design

### Append-Only Raw Tab Additions

Do not insert these into the middle of the current operational tabs. Append them on the right only.

| Tab | Append-Only Columns |
| --- | --- |
| `New_Order_Table` | `order_line_id`, `order_created_at_iso`, `customer_code_snapshot`, `product_code_snapshot`, `product_group_snapshot`, `source_channel_norm`, `approval_status_norm`, `dispatch_status_norm`, `approval_at_iso`, `dispatch_at_iso`, `last_status_at_iso`, `promised_dispatch_date_iso`, `due_date_iso`, `invoice_no`, `invoice_date_iso`, `invoice_amount`, `cancelled_at_iso`, `cancel_reason_code` |
| `Customer_Master` | `customer_status`, `sales_owner`, `collector_owner`, `zone`, `city`, `state`, `industry`, `channel`, `payment_terms_days`, `credit_limit`, `risk_tier` |
| `Product_Master` | `product_status`, `product_group_norm`, `brand`, `subcategory`, `standard_cost`, `margin_pct`, `uom` |
| `Customer_Ledger_2` | `txn_id`, `txn_date_iso`, `voucher_type_norm`, `signed_amount`, `due_date_iso`, `open_amount`, `collector_owner`, `risk_tier` |

### Phase 1 Derived Tabs

| Tab | Grain | Purpose |
| --- | --- | --- |
| `Order_Header_Fact` | 1 row per `order_id` | Pipeline, backlog, approvals, dispatch queue, recent movement, attention feed |
| `Customer_Account_Snapshot` | 1 row per `customer_code` per refresh | Top accounts, AR posture, owner and zone segmentation, risk cards |
| `Analytics_KPI_Daily` | 1 row per day | Hero KPIs, MTD/QTD/YTD comparisons, sparkline trends |

### Later Derived Tabs

| Tab | Grain | Purpose |
| --- | --- | --- |
| `AR_Open_Items_Fact` | 1 row per open receivable item | True A/R aging and collections worklist |
| `Rep_Performance_Daily` | 1 row per rep per day | Rep leaderboard and coaching |
| `Product_Group_Daily` | 1 row per product group per day | Product/category contribution |
| `Source_Channel_Daily` | 1 row per source per day | Channel and source mix |
| `Attention_Queue_Snapshot` | 1 row per work item per refresh | Critical owner actions |
| `Targets` | 1 row per owner/channel/product/period | Plan vs actual |

## Current Repo Files That Matter

- `app/(app)/analytics.tsx`
- `app/(app)/main.tsx`
- `app/(app)/customers.tsx`
- `app/(app)/customer-summary.tsx`
- `app/(app)/new-order.tsx`
- `app/(app)/order-approval.tsx`
- `app/(app)/process-orders.tsx`
- `app/(app)/my-orders.tsx`
- `app/(app)/products.tsx`
- `utils/managerAnalytics.ts`
- `utils/ledgerUtils.js`
- `utils/apiManager.ts`
- `package.json`

## Implementation Order

Do not start by redesigning the UI again. First lock the sheet contracts and fetch model, then move the screen to derived tabs, then add the owner-only extras like targets and open-item A/R.

### Task 1: Guard Sheet Contracts In Code

**Files:**
- Create: `utils/sheetContracts.ts`
- Create: `utils/__tests__/sheetContracts.test.ts`
- Modify: `utils/apiManager.ts`

**Step 1: Write the failing test**

```ts
import {
  RAW_SHEET_HEADERS,
  DERIVED_SHEET_HEADERS,
  validateHeaders,
} from "@/utils/sheetContracts";

describe("sheet contracts", () => {
  it("accepts the current New_Order_Table raw header", () => {
    const actual = [
      "SYS-TIME",
      "ORDER-TIME",
      "USER",
      "ORDER COMMENTS",
      "CUSTOMER NAME",
      "ORDER ID",
      "PRODUCT NAME",
      "QUANTITY",
      "UNIT",
      "PRODUCT RATE",
      "ORDER AMOUNT",
      "SOURCE",
      "APPROVED BY MANAGER: Y/N/R",
      "MANAGER COMMENTS",
      "ORDER DISPATCHED: Y/N",
      "DISPATCH COMMENTS",
      "DISPATCH TIME",
    ];

    expect(validateHeaders(actual, RAW_SHEET_HEADERS.New_Order_Table)).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
  });

  it("rejects a shifted derived header", () => {
    const actual = ["snapshot_date", "order_count"];
    const result = validateHeaders(actual, DERIVED_SHEET_HEADERS.Analytics_KPI_Daily);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("booked_value");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/sheetContracts.test.ts`
Expected: FAIL with `Cannot find module '@/utils/sheetContracts'`.

**Step 3: Write minimal implementation**

```ts
export const RAW_SHEET_HEADERS = {
  New_Order_Table: [
    "SYS-TIME",
    "ORDER-TIME",
    "USER",
    "ORDER COMMENTS",
    "CUSTOMER NAME",
    "ORDER ID",
    "PRODUCT NAME",
    "QUANTITY",
    "UNIT",
    "PRODUCT RATE",
    "ORDER AMOUNT",
    "SOURCE",
    "APPROVED BY MANAGER: Y/N/R",
    "MANAGER COMMENTS",
    "ORDER DISPATCHED: Y/N",
    "DISPATCH COMMENTS",
    "DISPATCH TIME",
  ],
} as const;

export const DERIVED_SHEET_HEADERS = {
  Analytics_KPI_Daily: [
    "snapshot_date",
    "booked_value",
    "order_count",
    "open_pipeline_value",
    "pending_approvals",
    "pending_dispatches",
    "rejected_orders",
    "dispatch_rate",
    "collection_value",
    "current_exposure",
    "exposure_31_60",
    "exposure_61_90",
    "exposure_90_plus",
    "last_refreshed_at",
  ],
} as const;

export const validateHeaders = (actual: string[], expected: readonly string[]) => {
  const missing = expected.filter((header) => !actual.includes(header));
  const extra = actual.filter((header) => !expected.includes(header as never));
  return { ok: missing.length === 0, missing, extra };
};
```

Also add a short comment in `utils/apiManager.ts` pointing to `utils/sheetContracts.ts` as the canonical contract source for analytics tabs.

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/sheetContracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/sheetContracts.ts utils/__tests__/sheetContracts.test.ts utils/apiManager.ts
git commit -m "test: add sheet contract guards"
```

### Task 2: Add Header-Based Sheet Object Reader

**Files:**
- Create: `utils/fetchSheetObjects.ts`
- Create: `utils/__tests__/fetchSheetObjects.test.ts`
- Modify: `utils/apiManager.ts`

**Step 1: Write the failing test**

```ts
import { mapSheetValuesToObjects } from "@/utils/fetchSheetObjects";

describe("mapSheetValuesToObjects", () => {
  it("maps rows by header name instead of position", () => {
    const rows = [
      ["customer_code", "customer_name", "open_amount"],
      ["100101", "Reliance Digital Mumbai", "219000"],
    ];

    expect(mapSheetValuesToObjects(rows)).toEqual([
      {
        customer_code: "100101",
        customer_name: "Reliance Digital Mumbai",
        open_amount: "219000",
      },
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/fetchSheetObjects.test.ts`
Expected: FAIL with `Cannot find module '@/utils/fetchSheetObjects'`.

**Step 3: Write minimal implementation**

```ts
type SheetObject = Record<string, string>;

export const mapSheetValuesToObjects = (values: string[][]): SheetObject[] => {
  if (!Array.isArray(values) || values.length < 2) {
    return [];
  }

  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce<SheetObject>((record, key, index) => {
      record[String(key || "").trim()] = row[index] || "";
      return record;
    }, {})
  );
};

export const assertRequiredHeaders = (
  actualHeaders: string[],
  requiredHeaders: readonly string[]
) => {
  const missing = requiredHeaders.filter((header) => !actualHeaders.includes(header));
  if (missing.length) {
    throw new Error(`Missing required headers: ${missing.join(", ")}`);
  }
};
```

Then wire this helper into analytics-only fetch code paths instead of directly indexing arrays.

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/fetchSheetObjects.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/fetchSheetObjects.ts utils/__tests__/fetchSheetObjects.test.ts utils/apiManager.ts
git commit -m "feat: add header-based sheet reader"
```

### Task 3: Safely Extend Raw Operational Tabs And Order Serialization

**Files:**
- Create: `utils/orderSheetSerializer.ts`
- Create: `utils/__tests__/orderSheetSerializer.test.ts`
- Modify: `app/(app)/new-order.tsx`
- Modify: `app/(app)/order-approval.tsx`
- Modify: `app/(app)/process-orders.tsx`
- Modify: `app/(app)/my-orders.tsx`
- External: `Google Sheet tab New_Order_Table`
- External: `Google Sheet tab Customer_Master`
- External: `Google Sheet tab Product_Master`
- External: `Google Sheet tab Customer_Ledger_2`

**Step 1: Write the failing test**

```ts
import { serializeOrderLineForSheet } from "@/utils/orderSheetSerializer";

describe("serializeOrderLineForSheet", () => {
  it("keeps the legacy columns intact and appends analytics-safe fields on the right", () => {
    const row = serializeOrderLineForSheet({
      orderId: "2025-2026_00074",
      customerName: "Reliance Digital Mumbai",
      customerCode: "100101",
      productName: "Apple iPhone 17 Air",
      productCode: "PSM001",
      productGroup: "Smartphones",
      amount: 219000,
      source: "WhatsApp",
      createdAtIso: "2025-05-21T10:39:00+05:30",
    });

    expect(row[5]).toBe("2025-2026_00074");
    expect(row[10]).toBe("219000");
    expect(row[17]).toBeDefined();
    expect(row[18]).toBe("100101");
    expect(row[19]).toBe("PSM001");
    expect(row[20]).toBe("Smartphones");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/orderSheetSerializer.test.ts`
Expected: FAIL with `Cannot find module '@/utils/orderSheetSerializer'`.

**Step 3: Write minimal implementation**

```ts
export const serializeOrderLineForSheet = (input: {
  orderId: string;
  customerName: string;
  customerCode: string;
  productName: string;
  productCode: string;
  productGroup: string;
  amount: number;
  source: string;
  createdAtIso: string;
}) => [
  "", // SYS-TIME existing slot
  "", // ORDER-TIME existing slot
  "",
  "",
  input.customerName,
  input.orderId,
  input.productName,
  "",
  "",
  "",
  String(input.amount),
  input.source,
  "",
  "",
  "",
  "",
  "",
  crypto.randomUUID(),
  input.customerCode,
  input.productCode,
  input.productGroup,
  input.source,
  "pending_approval",
  "",
  "",
  input.createdAtIso,
];
```

Then:
- append the raw columns listed in the workbook design section to the right side of the four raw tabs
- update `app/(app)/new-order.tsx` to write through `serializeOrderLineForSheet`
- update approval/dispatch screens to write normalized status and timestamp fields to the appended columns, not just legacy Y/N markers
- keep the legacy columns populated until every read path has migrated

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/orderSheetSerializer.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/orderSheetSerializer.ts utils/__tests__/orderSheetSerializer.test.ts app/(app)/new-order.tsx app/(app)/order-approval.tsx app/(app)/process-orders.tsx app/(app)/my-orders.tsx
git commit -m "feat: append analytics-safe raw order fields"
```

### Task 4: Create Derived Row Builders For Command Center Tabs

**Files:**
- Create: `utils/commandCenterTransforms.ts`
- Create: `utils/__tests__/commandCenterTransforms.test.ts`
- Modify: `utils/managerAnalytics.ts`

**Step 1: Write the failing test**

```ts
import {
  buildOrderHeaderFacts,
  buildCustomerAccountSnapshots,
  buildAnalyticsKpiDailyRows,
} from "@/utils/commandCenterTransforms";

describe("command center transforms", () => {
  it("builds one order-header row per order id", () => {
    const facts = buildOrderHeaderFacts([
      {
        order_id: "SO-1",
        customer_name: "Reliance Digital Mumbai",
        customer_code: "100101",
        sales_rep: "Manager",
        source_channel: "WhatsApp",
        amount: "219000",
      },
    ] as any);

    expect(facts).toHaveLength(1);
    expect(facts[0].order_id).toBe("SO-1");
    expect(facts[0].order_value).toBe(219000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/commandCenterTransforms.test.ts`
Expected: FAIL with `Cannot find module '@/utils/commandCenterTransforms'`.

**Step 3: Write minimal implementation**

```ts
export const buildOrderHeaderFacts = (orderLineRows: any[]) => {
  const grouped = new Map<string, any[]>();
  orderLineRows.forEach((row) => {
    grouped.set(row.order_id, [...(grouped.get(row.order_id) || []), row]);
  });

  return Array.from(grouped.entries()).map(([orderId, rows]) => ({
    order_id: orderId,
    customer_code: rows[0].customer_code,
    customer_name: rows[0].customer_name,
    sales_rep: rows[0].sales_rep,
    source_channel: rows[0].source_channel,
    order_value: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }));
};
```

Then add:
- `buildCustomerAccountSnapshots(...)`
- `buildAnalyticsKpiDailyRows(...)`
- header arrays in `utils/sheetContracts.ts` for `Order_Header_Fact`, `Customer_Account_Snapshot`, and `Analytics_KPI_Daily`
- derived-row builders for the exact columns listed in the workbook design section

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/commandCenterTransforms.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/commandCenterTransforms.ts utils/__tests__/commandCenterTransforms.test.ts utils/managerAnalytics.ts utils/sheetContracts.ts
git commit -m "feat: add command center derived row builders"
```

### Task 5: Add A Typed Command Center Repository

**Files:**
- Create: `utils/commandCenterRepository.ts`
- Create: `utils/__tests__/commandCenterRepository.test.ts`
- Modify: `utils/apiManager.ts`
- Modify: `utils/managerAnalytics.ts`

**Step 1: Write the failing test**

```ts
import { createCommandCenterRepository } from "@/utils/commandCenterRepository";

describe("commandCenterRepository", () => {
  it("prefers derived tabs over raw reconstruction", async () => {
    const repo = createCommandCenterRepository({
      fetchSheetObjects: jest
        .fn()
        .mockResolvedValueOnce([{ snapshot_date: "2026-04-19", booked_value: "100" }])
        .mockResolvedValueOnce([{ order_id: "SO-1", order_value: "100" }])
        .mockResolvedValueOnce([{ customer_code: "100101", total_outstanding: "0" }]),
    });

    const payload = await repo.getManagerPayload("QTD");
    expect(payload.summary.bookedValue).toBe(100);
    expect(payload.pipeline).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/commandCenterRepository.test.ts`
Expected: FAIL with `Cannot find module '@/utils/commandCenterRepository'`.

**Step 3: Write minimal implementation**

```ts
export const createCommandCenterRepository = ({
  fetchSheetObjects,
}: {
  fetchSheetObjects: (range: string) => Promise<Record<string, string>[]>;
}) => ({
  async getManagerPayload(_timeframe: "MTD" | "QTD" | "YTD") {
    const [kpis, orders, customers] = await Promise.all([
      fetchSheetObjects("Analytics_KPI_Daily!A1:Z"),
      fetchSheetObjects("Order_Header_Fact!A1:Z"),
      fetchSheetObjects("Customer_Account_Snapshot!A1:Z"),
    ]);

    return {
      summary: {
        bookedValue: Number(kpis[0]?.booked_value || 0),
      },
      pipeline: orders,
      topCustomers: customers,
    };
  },
});
```

Then:
- add timeframe filtering
- add cache keys per tab/timeframe
- add fallback behavior only for local migration verification, not as the long-term runtime path
- stop storing one monolithic analytics payload under one cache key

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/commandCenterRepository.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/commandCenterRepository.ts utils/__tests__/commandCenterRepository.test.ts utils/apiManager.ts utils/managerAnalytics.ts
git commit -m "feat: add command center repository"
```

### Task 6: Migrate The Analytics Screen To The Repository And Extract UI Sections

**Files:**
- Create: `components/analytics/SectionCard.tsx`
- Create: `components/analytics/CommandCenterHero.tsx`
- Create: `components/analytics/MetricCardGrid.tsx`
- Create: `components/analytics/AttentionQueueList.tsx`
- Create: `components/analytics/AgingLadder.tsx`
- Create: `components/analytics/__tests__/CommandCenterHero.test.tsx`
- Modify: `app/(app)/analytics.tsx`

**Step 1: Write the failing test**

```tsx
import React from "react";
import renderer from "react-test-renderer";
import { CommandCenterHero } from "@/components/analytics/CommandCenterHero";

describe("CommandCenterHero", () => {
  it("renders the business-owner headline metrics", () => {
    const tree = renderer
      .create(
        <CommandCenterHero
          label="QTD booked demand"
          value="₹2,49,000"
          chip="7 orders in motion"
          deltaText="+18% vs previous period"
        />
      )
      .toJSON();

    expect(tree).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand components/analytics/__tests__/CommandCenterHero.test.tsx`
Expected: FAIL with `Cannot find module '@/components/analytics/CommandCenterHero'`.

**Step 3: Write minimal implementation**

```tsx
export function CommandCenterHero({
  label,
  value,
  chip,
  deltaText,
}: {
  label: string;
  value: string;
  chip: string;
  deltaText: string;
}) {
  return (
    <>
      <Text>{label}</Text>
      <Text>{value}</Text>
      <Text>{chip}</Text>
      <Text>{deltaText}</Text>
    </>
  );
}
```

Then update `app/(app)/analytics.tsx` to:
- fetch through `commandCenterRepository`
- read derived tabs, not raw tabs, for the command center
- keep `overview`, `revenue`, `execution`
- show exception-first owner sections in this order:
  1. hero
  2. intervention queue
  3. pipeline / bottlenecks
  4. cash risk
  5. concentration and mix
  6. rep execution

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand components/analytics/__tests__/CommandCenterHero.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add components/analytics/SectionCard.tsx components/analytics/CommandCenterHero.tsx components/analytics/MetricCardGrid.tsx components/analytics/AttentionQueueList.tsx components/analytics/AgingLadder.tsx components/analytics/__tests__/CommandCenterHero.test.tsx app/(app)/analytics.tsx
git commit -m "feat: migrate analytics screen to command center repository"
```

### Task 7: Unify Ledger Consumers And Fix A/R Semantics

**Files:**
- Create: `utils/__tests__/ledgerAgingParity.test.ts`
- Modify: `utils/ledgerUtils.js`
- Modify: `utils/managerAnalytics.ts`
- Modify: `app/(app)/customers.tsx`
- Modify: `app/(app)/customer-summary.tsx`

**Step 1: Write the failing test**

```ts
import { buildFinancialSnapshotFromOpenItems } from "@/utils/managerAnalytics";

describe("ledger aging semantics", () => {
  it("ages outstanding amounts, not raw debit totals", () => {
    const rows = [
      { customer_code: "100101", open_amount: 100000, age_days: 12 },
      { customer_code: "100101", open_amount: 50000, age_days: 95 },
    ] as any;

    const snapshot = buildFinancialSnapshotFromOpenItems(rows);
    expect(snapshot.currentExposure).toBe(100000);
    expect(snapshot.ninetyExposure).toBe(50000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/ledgerAgingParity.test.ts`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

```ts
export const buildFinancialSnapshotFromOpenItems = (rows: Array<{ open_amount: number; age_days: number }>) => {
  return rows.reduce(
    (acc, row) => {
      if (row.age_days <= 30) acc.currentExposure += row.open_amount;
      else if (row.age_days <= 60) acc.thirtyExposure += row.open_amount;
      else if (row.age_days <= 90) acc.sixtyExposure += row.open_amount;
      else acc.ninetyExposure += row.open_amount;
      return acc;
    },
    { currentExposure: 0, thirtyExposure: 0, sixtyExposure: 0, ninetyExposure: 0 }
  );
};
```

Then:
- standardize on one canonical ledger contract
- migrate `customers.tsx` and `customer-summary.tsx` to the same canonical ledger/open-item source
- stop showing owner-facing A/R based on raw debit/credit math once `AR_Open_Items_Fact` exists

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/ledgerAgingParity.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/__tests__/ledgerAgingParity.test.ts utils/ledgerUtils.js utils/managerAnalytics.ts app/(app)/customers.tsx app/(app)/customer-summary.tsx
git commit -m "fix: unify ledger semantics for owner analytics"
```

### Task 8: Add Targets, Open-Item A/R, And Owner-Only Intervention Views

**Files:**
- Create: `utils/__tests__/ownerTargets.test.ts`
- Create: `utils/__tests__/attentionQueue.test.ts`
- Modify: `utils/sheetContracts.ts`
- Modify: `utils/commandCenterRepository.ts`
- Modify: `utils/managerAnalytics.ts`
- Modify: `app/(app)/analytics.tsx`
- External: `Google Sheet tab Targets`
- External: `Google Sheet tab AR_Open_Items_Fact`
- External: `Google Sheet tab Attention_Queue_Snapshot`

**Step 1: Write the failing test**

```ts
import { buildOwnerVarianceCards } from "@/utils/managerAnalytics";

describe("owner variance cards", () => {
  it("computes plan vs actual from the Targets tab", () => {
    const cards = buildOwnerVarianceCards(
      [{ owner_name: "All", booking_target: 1000000, collection_target: 800000 }] as any,
      { bookedValue: 850000, collectionValue: 620000 } as any
    );

    expect(cards[0].variance).toBe(-150000);
    expect(cards[1].variance).toBe(-180000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/ownerTargets.test.ts`
Expected: FAIL because target variance helpers are not present.

**Step 3: Write minimal implementation**

```ts
export const buildOwnerVarianceCards = (
  targets: Array<{ booking_target: number; collection_target: number }>,
  actuals: { bookedValue: number; collectionValue: number }
) => {
  const target = targets[0] || { booking_target: 0, collection_target: 0 };
  return [
    {
      label: "Bookings vs target",
      variance: actuals.bookedValue - target.booking_target,
    },
    {
      label: "Collections vs target",
      variance: actuals.collectionValue - target.collection_target,
    },
  ];
};
```

Then:
- add `Targets` for plan-vs-actual
- add `AR_Open_Items_Fact` for true owner cash-risk views
- add `Attention_Queue_Snapshot` so the owner page can show one-tap intervention items
- wire these sections into the top third of `app/(app)/analytics.tsx`

**Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --runInBand utils/__tests__/ownerTargets.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/__tests__/ownerTargets.test.ts utils/__tests__/attentionQueue.test.ts utils/sheetContracts.ts utils/commandCenterRepository.ts utils/managerAnalytics.ts app/(app)/analytics.tsx
git commit -m "feat: add owner targets and intervention views"
```

### Task 9: Document The Workbook Runbook And Validate End-To-End

**Files:**
- Create: `docs/analytics/owner-command-center-sheet-runbook.md`
- Modify: `docs/plans/2026-04-19-owner-command-center-implementation.md`

**Step 1: Write the failing validation checklist**

```md
- [ ] New raw columns appended only to the right side of existing tabs
- [ ] Order creation still works with legacy columns populated
- [ ] Analytics screen reads derived tabs, not raw tabs
- [ ] Customer balances and analytics use the same ledger/open-item source
- [ ] KPI totals reconcile to workbook snapshots for a known sample day
```

**Step 2: Run validation commands before final cleanup**

Run: `npm test -- --watchAll=false --runInBand`
Expected: PASS.

Run: `npm run lint`
Expected: PASS or only pre-existing warnings outside touched files.

Run: `npx expo-doctor`
Expected: `17/17 checks passed. No issues detected!`

Run: `npm run dev -- --port 3035`
Expected: Expo starts and the analytics page loads without runtime exceptions.

**Step 3: Write the runbook**

```md
# Owner Command Center Sheet Runbook

## Raw tab rules
- Never insert columns in the middle of `New_Order_Table`
- Never change derived-tab header spellings without updating `utils/sheetContracts.ts`

## Cutover order
1. Append raw columns
2. Backfill stable ids and snapshot codes
3. Build derived tabs
4. Verify reconciliation
5. Flip analytics screen to derived tabs
6. Migrate customer screens
```

**Step 4: Re-run the final checks**

Run:
- `npm test -- --watchAll=false --runInBand`
- `npm run lint`
- `npx expo-doctor`

Expected: all pass.

**Step 5: Commit**

```bash
git add docs/analytics/owner-command-center-sheet-runbook.md docs/plans/2026-04-19-owner-command-center-implementation.md
git commit -m "docs: add owner command center runbook"
```

## Manual QA Checklist

- Create a new order and confirm the legacy columns still populate exactly as before.
- Approve that order and confirm normalized approval columns are written.
- Dispatch that order and confirm normalized dispatch columns are written.
- Confirm `Order_Header_Fact` contains one row for the order.
- Confirm `Customer_Account_Snapshot` shows the customer with updated order and exposure posture.
- Confirm `Analytics_KPI_Daily` updates the hero values for the same day.
- Confirm the analytics page renders the same totals after a refresh and after an app restart.
- Confirm customers and customer summary screens show the same canonical balance source as the analytics screen.

## Rollout Notes

- First deploy with dual-read validation enabled.
- Keep old and new analytics numbers side-by-side for at least one business cycle.
- Only rename labels like `Revenue` or `Exposure` after reconciliation is signed off.
- Do not cut over owner A/R cards to raw debit/credit aging. Wait for `AR_Open_Items_Fact`.
