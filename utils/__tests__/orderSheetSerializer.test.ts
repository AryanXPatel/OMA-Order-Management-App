import {
  APPENDED_NEW_ORDER_FIELDS,
  LEGACY_NEW_ORDER_COLUMN_COUNT,
  TOTAL_NEW_ORDER_COLUMN_COUNT,
  buildApprovalSheetUpdates,
  buildDispatchSheetUpdates,
  buildRejectionSheetUpdates,
  getAppendedFieldRange,
  serializeOrderLineForSheet,
} from "../orderSheetSerializer";

const getAppendedSlice = (row: string[]) =>
  Object.fromEntries(
    APPENDED_NEW_ORDER_FIELDS.map((field, index) => [
      field,
      row[LEGACY_NEW_ORDER_COLUMN_COUNT + index],
    ])
  );

describe("orderSheetSerializer", () => {
  it("preserves the legacy columns and appends normalized fields on the right", () => {
    const row = serializeOrderLineForSheet({
      sysTime: "21/05/2025 10:40 AM",
      orderTime: "21/05/2025 10:39 AM",
      user: "Manager",
      orderComments: "Reliance order",
      customerName: "Reliance Digital Mumbai",
      orderId: "2025-2026_00074",
      productName: "Apple iPhone 17 Air",
      quantity: "2",
      unit: "Unit",
      productRate: "109500",
      orderAmount: "219000",
      source: "WhatsApp",
      approvalStatus: "Y",
      managerComments: "",
      dispatchStatus: "",
      dispatchComments: "",
      dispatchTime: "",
      createdAtIso: "2025-05-21T10:39:00+05:30",
      customerCode: "100101",
      productCode: "PSM001",
      productGroup: "Smartphones",
      lineSequence: 0,
    });

    expect(row).toHaveLength(TOTAL_NEW_ORDER_COLUMN_COUNT);
    expect(row[5]).toBe("2025-2026_00074");
    expect(row[10]).toBe("219000");
    expect(row[16]).toBe("");

    expect(getAppendedSlice(row)).toEqual({
      order_line_id: "2025-2026_00074_01_PSM001",
      order_created_at_iso: "2025-05-21T10:39:00+05:30",
      customer_code_snapshot: "100101",
      product_code_snapshot: "PSM001",
      product_group_snapshot: "Smartphones",
      source_channel_norm: "WhatsApp",
      approval_status_norm: "approved_waiting_dispatch",
      dispatch_status_norm: "pending_dispatch",
      approval_at_iso: "2025-05-21T10:39:00+05:30",
      dispatch_at_iso: "",
      last_status_at_iso: "2025-05-21T10:39:00+05:30",
      promised_dispatch_date_iso: "",
      due_date_iso: "",
      invoice_no: "",
      invoice_date_iso: "",
      invoice_amount: "",
      cancelled_at_iso: "",
      cancel_reason_code: "",
    });
  });

  it("normalizes the non-manager approval branch without stamping approval time", () => {
    const row = serializeOrderLineForSheet({
      sysTime: "21/05/2025 10:40 AM",
      orderTime: "21/05/2025 10:39 AM",
      user: "User",
      orderComments: "Reliance order",
      customerName: "Reliance Digital Mumbai",
      orderId: "2025-2026_00074",
      productName: "Apple iPhone 17 Air",
      quantity: "2",
      unit: "Unit",
      productRate: "109500",
      orderAmount: "219000",
      source: "Phone",
      approvalStatus: "R",
      managerComments: "",
      dispatchStatus: "",
      dispatchComments: "",
      dispatchTime: "",
      createdAtIso: "2025-05-21T10:40:00+05:30",
      customerCode: "100101",
      productCode: "PSM001",
      productGroup: "Smartphones",
      lineSequence: 1,
    });

    expect(getAppendedSlice(row)).toMatchObject({
      approval_status_norm: "pending_approval",
      dispatch_status_norm: "not_ready",
      approval_at_iso: "",
      last_status_at_iso: "2025-05-21T10:40:00+05:30",
    });
  });

  it("keeps all declared appended fields accounted for", () => {
    expect(APPENDED_NEW_ORDER_FIELDS).toHaveLength(
      TOTAL_NEW_ORDER_COLUMN_COUNT - LEGACY_NEW_ORDER_COLUMN_COUNT
    );
  });

  it("builds approval updates for both legacy and appended fields", () => {
    expect(
      buildApprovalSheetUpdates({
        rowIndex: 12,
        comments: "Approved for dispatch",
        updatedAtIso: "2025-05-21T12:00:00.000Z",
      })
    ).toEqual([
      {
        range: getAppendedFieldRange(12, "approval_status_norm"),
        values: [["approved_waiting_dispatch"]],
      },
      {
        range: getAppendedFieldRange(12, "dispatch_status_norm"),
        values: [["pending_dispatch"]],
      },
      {
        range: getAppendedFieldRange(12, "approval_at_iso"),
        values: [["2025-05-21T12:00:00.000Z"]],
      },
      {
        range: getAppendedFieldRange(12, "last_status_at_iso"),
        values: [["2025-05-21T12:00:00.000Z"]],
      },
      {
        range: "New_Order_Table!M12:N12",
        values: [["Y", "Approved for dispatch"]],
      },
    ]);
  });

  it("builds rejection updates for both legacy and appended fields", () => {
    expect(
      buildRejectionSheetUpdates({
        rowIndex: 14,
        rejectionReason: "Price mismatch",
        updatedAtIso: "2025-05-21T12:05:00.000Z",
      })
    ).toEqual([
      {
        range: getAppendedFieldRange(14, "approval_status_norm"),
        values: [["rejected"]],
      },
      {
        range: getAppendedFieldRange(14, "dispatch_status_norm"),
        values: [["not_ready"]],
      },
      {
        range: getAppendedFieldRange(14, "approval_at_iso"),
        values: [[""]],
      },
      {
        range: getAppendedFieldRange(14, "last_status_at_iso"),
        values: [["2025-05-21T12:05:00.000Z"]],
      },
      {
        range: "New_Order_Table!M14:N14",
        values: [["N", "Price mismatch"]],
      },
    ]);
  });

  it("builds dispatch updates for both legacy and appended fields", () => {
    expect(
      buildDispatchSheetUpdates({
        rowIndex: 17,
        dispatchRemark: "Blue Dart DO 876",
        dispatchDisplayTime: "21/05/2025 12:47 PM",
        dispatchAtIso: "2025-05-21T12:47:00.000Z",
      })
    ).toEqual([
      {
        range: getAppendedFieldRange(17, "dispatch_status_norm"),
        values: [["dispatched"]],
      },
      {
        range: getAppendedFieldRange(17, "dispatch_at_iso"),
        values: [["2025-05-21T12:47:00.000Z"]],
      },
      {
        range: getAppendedFieldRange(17, "last_status_at_iso"),
        values: [["2025-05-21T12:47:00.000Z"]],
      },
      {
        range: "New_Order_Table!P17",
        values: [["Blue Dart DO 876"]],
      },
      {
        range: "New_Order_Table!Q17",
        values: [["21/05/2025 12:47 PM"]],
      },
      {
        range: "New_Order_Table!O17",
        values: [["Y"]],
      },
    ]);
  });

  it("omits the legacy dispatch remarks cell when no remark exists", () => {
    expect(
      buildDispatchSheetUpdates({
        rowIndex: 18,
        dispatchRemark: "",
        dispatchDisplayTime: "21/05/2025 12:47 PM",
        dispatchAtIso: "2025-05-21T12:47:00.000Z",
      })
    ).toEqual([
      {
        range: getAppendedFieldRange(18, "dispatch_status_norm"),
        values: [["dispatched"]],
      },
      {
        range: getAppendedFieldRange(18, "dispatch_at_iso"),
        values: [["2025-05-21T12:47:00.000Z"]],
      },
      {
        range: getAppendedFieldRange(18, "last_status_at_iso"),
        values: [["2025-05-21T12:47:00.000Z"]],
      },
      {
        range: "New_Order_Table!Q18",
        values: [["21/05/2025 12:47 PM"]],
      },
      {
        range: "New_Order_Table!O18",
        values: [["Y"]],
      },
    ]);
  });
});
