import {
  ANALYTICS_SHEET_TABS,
  getExpectedHeaders,
  getSheetContract,
  validateSheetHeaders,
} from "../sheetContracts";

const NEW_ORDER_TABLE_HEADERS = [
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
] as const;

describe("sheetContracts", () => {
  it("registers the canonical analytics tabs", () => {
    expect(ANALYTICS_SHEET_TABS).toEqual([
      "New_Order_Table",
      "Order_Header_Fact",
      "Customer_Account_Snapshot",
      "Analytics_KPI_Daily",
    ]);
  });

  it("pins the legacy New_Order_Table header contract", () => {
    expect(getExpectedHeaders("New_Order_Table")).toEqual([...NEW_ORDER_TABLE_HEADERS]);
  });

  it("returns an immutable sheet contract snapshot", () => {
    const first = getSheetContract("Order_Header_Fact");
    const second = getSheetContract("Order_Header_Fact");

    expect(first).not.toBe(second);
    expect(first.columns).not.toBe(second.columns);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.columns)).toBe(true);
    expect(Object.isFrozen(first.columns[0])).toBe(true);

    try {
      (first as any).columns[0].header = "BROKEN_HEADER";
    } catch {}

    try {
      (first as any).columns.push({ key: "injected", header: "INJECTED" });
    } catch {}

    expect(getExpectedHeaders("Order_Header_Fact")[0]).toBe("ORDER_ID");
    expect(second.columns[0].header).toBe("ORDER_ID");
    expect(second.columns).toHaveLength(20);
  });

  it("accepts normalized headers for a derived tab", () => {
    const actualHeaders = getExpectedHeaders("Order_Header_Fact").map((header, index) =>
      index % 2 === 0 ? ` ${header.toLowerCase()} ` : header.toLowerCase()
    );

    const result = validateSheetHeaders("Order_Header_Fact", actualHeaders);

    expect(result.isValid).toBe(true);
    expect(result.sheetName).toBe("Order_Header_Fact");
    expect(result.missingHeaders).toEqual([]);
    expect(result.unexpectedHeaders).toEqual([]);
    expect(result.duplicateHeaders).toEqual([]);
  });

  it("flags positional header drift and unexpected extras", () => {
    const headers = [...NEW_ORDER_TABLE_HEADERS];
    const actualHeaders = [...headers.slice(0, -1), "DISPATCHED AT", "EXTRA_COLUMN"];

    const result = validateSheetHeaders("New_Order_Table", actualHeaders);

    expect(result.isValid).toBe(false);
    expect(result.missingHeaders).toContain("DISPATCH TIME");
    expect(result.unexpectedHeaders).toEqual(
      expect.arrayContaining(["DISPATCHED AT", "EXTRA_COLUMN"])
    );
    expect(result.orderMismatches).toEqual(
      expect.arrayContaining([
        {
          index: 17,
          expected: "DISPATCH TIME",
          actual: "DISPATCHED AT",
        },
      ])
    );
  });

  it("detects duplicate headers", () => {
    const headers = getExpectedHeaders("Order_Header_Fact");
    const actualHeaders = [...headers];

    actualHeaders[1] = "ORDER_ID";

    const result = validateSheetHeaders("Order_Header_Fact", actualHeaders);

    expect(result.isValid).toBe(false);
    expect(result.duplicateHeaders).toContain("ORDER_ID");
  });
});
