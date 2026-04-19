const LEGACY_NEW_ORDER_HEADERS = [
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

export const APPENDED_NEW_ORDER_FIELDS = [
  "order_line_id",
  "order_created_at_iso",
  "customer_code_snapshot",
  "product_code_snapshot",
  "product_group_snapshot",
  "source_channel_norm",
  "approval_status_norm",
  "dispatch_status_norm",
  "approval_at_iso",
  "dispatch_at_iso",
  "last_status_at_iso",
  "promised_dispatch_date_iso",
  "due_date_iso",
  "invoice_no",
  "invoice_date_iso",
  "invoice_amount",
  "cancelled_at_iso",
  "cancel_reason_code",
] as const;

type AppendedNewOrderFieldKey = (typeof APPENDED_NEW_ORDER_FIELDS)[number];

type SheetValueUpdate = {
  range: string;
  values: string[][];
};

export const LEGACY_NEW_ORDER_COLUMN_COUNT = LEGACY_NEW_ORDER_HEADERS.length;
export const APPENDED_NEW_ORDER_COLUMN_COUNT = APPENDED_NEW_ORDER_FIELDS.length;
export const TOTAL_NEW_ORDER_COLUMN_COUNT =
  LEGACY_NEW_ORDER_COLUMN_COUNT + APPENDED_NEW_ORDER_COLUMN_COUNT;

export type NewOrderSerializedRowInput = {
  sysTime: string;
  orderTime: string;
  user: string;
  orderComments: string;
  customerName: string;
  orderId: string;
  productName: string;
  quantity: string;
  unit: string;
  productRate: string;
  orderAmount: string;
  source: string;
  approvalStatus: string;
  managerComments: string;
  dispatchStatus: string;
  dispatchComments: string;
  dispatchTime: string;
  createdAtIso: string;
  customerCode: string;
  productCode: string;
  productGroup: string;
  lineSequence: number;
};

const normalizeSourceChannel = (source: string) => {
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

const buildOrderLineId = ({
  orderId,
  productCode,
  lineSequence,
}: Pick<NewOrderSerializedRowInput, "orderId" | "productCode" | "lineSequence">) => {
  const safeProductCode = (productCode || "line").replace(/\s+/g, "-");
  return `${orderId}_${String(lineSequence + 1).padStart(2, "0")}_${safeProductCode}`;
};

const buildNormalizedApprovalStatus = (approvalStatus: string) => {
  if (approvalStatus === "Y") {
    return "approved_waiting_dispatch";
  }

  if (approvalStatus === "N") {
    return "rejected";
  }

  return "pending_approval";
};

const buildNormalizedDispatchStatus = (
  approvalStatus: string,
  dispatchStatus: string
) => {
  if (dispatchStatus === "Y") {
    return "dispatched";
  }

  if (approvalStatus === "Y") {
    return "pending_dispatch";
  }

  return "not_ready";
};

const columnNumberToLetter = (columnNumber: number) => {
  let current = columnNumber;
  let letter = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    current = Math.floor((current - 1) / 26);
  }

  return letter;
};

const getAppendedFieldColumnLetter = (field: AppendedNewOrderFieldKey) => {
  const fieldIndex = APPENDED_NEW_ORDER_FIELDS.indexOf(field);

  if (fieldIndex < 0) {
    throw new Error(`Unknown appended order field: ${field}`);
  }

  return columnNumberToLetter(LEGACY_NEW_ORDER_COLUMN_COUNT + fieldIndex + 1);
};

export const getAppendedFieldRange = (
  rowIndex: number,
  field: AppendedNewOrderFieldKey
) => `New_Order_Table!${getAppendedFieldColumnLetter(field)}${rowIndex}`;

const buildSingleCellUpdate = (
  rowIndex: number,
  field: AppendedNewOrderFieldKey,
  value: string
): SheetValueUpdate => ({
  range: getAppendedFieldRange(rowIndex, field),
  values: [[value]],
});

export const serializeOrderLineForSheet = (
  input: NewOrderSerializedRowInput
) => {
  const legacyColumns = [
    input.sysTime,
    input.orderTime,
    input.user,
    input.orderComments,
    input.customerName,
    input.orderId,
    input.productName,
    input.quantity,
    input.unit,
    input.productRate,
    input.orderAmount,
    input.source,
    input.approvalStatus,
    input.managerComments,
    input.dispatchStatus,
    input.dispatchComments,
    input.dispatchTime,
  ];

  const normalizedApprovalStatus = buildNormalizedApprovalStatus(
    input.approvalStatus
  );
  const normalizedDispatchStatus = buildNormalizedDispatchStatus(
    input.approvalStatus,
    input.dispatchStatus
  );

  const appendedFieldValues: Record<AppendedNewOrderFieldKey, string> = {
    order_line_id: buildOrderLineId(input),
    order_created_at_iso: input.createdAtIso,
    customer_code_snapshot: input.customerCode,
    product_code_snapshot: input.productCode,
    product_group_snapshot: input.productGroup,
    source_channel_norm: normalizeSourceChannel(input.source),
    approval_status_norm: normalizedApprovalStatus,
    dispatch_status_norm: normalizedDispatchStatus,
    approval_at_iso: input.approvalStatus === "Y" ? input.createdAtIso : "",
    dispatch_at_iso: "",
    last_status_at_iso: input.createdAtIso,
    promised_dispatch_date_iso: "",
    due_date_iso: "",
    invoice_no: "",
    invoice_date_iso: "",
    invoice_amount: "",
    cancelled_at_iso: "",
    cancel_reason_code: "",
  };

  const appendedColumns = APPENDED_NEW_ORDER_FIELDS.map(
    (field) => appendedFieldValues[field]
  );

  return [...legacyColumns, ...appendedColumns];
};

export const buildApprovalSheetUpdates = ({
  rowIndex,
  comments,
  updatedAtIso,
}: {
  rowIndex: number;
  comments: string;
  updatedAtIso: string;
}): SheetValueUpdate[] => [
  buildSingleCellUpdate(rowIndex, "approval_status_norm", "approved_waiting_dispatch"),
  buildSingleCellUpdate(rowIndex, "dispatch_status_norm", "pending_dispatch"),
  buildSingleCellUpdate(rowIndex, "approval_at_iso", updatedAtIso),
  buildSingleCellUpdate(rowIndex, "last_status_at_iso", updatedAtIso),
  {
    range: `New_Order_Table!M${rowIndex}:N${rowIndex}`,
    values: [["Y", comments]],
  },
];

export const buildRejectionSheetUpdates = ({
  rowIndex,
  rejectionReason,
  updatedAtIso,
}: {
  rowIndex: number;
  rejectionReason: string;
  updatedAtIso: string;
}): SheetValueUpdate[] => [
  buildSingleCellUpdate(rowIndex, "approval_status_norm", "rejected"),
  buildSingleCellUpdate(rowIndex, "dispatch_status_norm", "not_ready"),
  buildSingleCellUpdate(rowIndex, "approval_at_iso", ""),
  buildSingleCellUpdate(rowIndex, "last_status_at_iso", updatedAtIso),
  {
    range: `New_Order_Table!M${rowIndex}:N${rowIndex}`,
    values: [["N", rejectionReason]],
  },
];

export const buildDispatchSheetUpdates = ({
  rowIndex,
  dispatchRemark,
  dispatchDisplayTime,
  dispatchAtIso,
}: {
  rowIndex: number;
  dispatchRemark: string;
  dispatchDisplayTime: string;
  dispatchAtIso: string;
}): SheetValueUpdate[] => {
  const updates: SheetValueUpdate[] = [
    buildSingleCellUpdate(rowIndex, "dispatch_status_norm", "dispatched"),
    buildSingleCellUpdate(rowIndex, "dispatch_at_iso", dispatchAtIso),
    buildSingleCellUpdate(rowIndex, "last_status_at_iso", dispatchAtIso),
  ];

  if (dispatchRemark) {
    updates.push({
      range: `New_Order_Table!P${rowIndex}`,
      values: [[dispatchRemark]],
    });
  }

  return [
    ...updates,
    {
      range: `New_Order_Table!Q${rowIndex}`,
      values: [[dispatchDisplayTime]],
    },
    {
      range: `New_Order_Table!O${rowIndex}`,
      values: [["Y"]],
    },
  ];
};
