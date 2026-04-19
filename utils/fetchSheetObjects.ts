export type SheetObject = Record<string, string>;

const normalizeHeader = (value: unknown): string => String(value ?? "").trim();

export const assertRequiredHeaders = (
  headers: readonly unknown[],
  requiredHeaders: readonly string[]
): void => {
  const availableHeaders = new Set(
    headers.map((header) => normalizeHeader(header)).filter(Boolean)
  );
  const missingHeaders = requiredHeaders
    .map((header) => normalizeHeader(header))
    .filter((header) => header && !availableHeaders.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);
  }
};

export const fetchSheetObjects = (
  values: readonly (readonly unknown[])[],
  requiredHeaders: readonly string[] = []
): SheetObject[] => {
  if (!Array.isArray(values) || values.length === 0) {
    assertRequiredHeaders([], requiredHeaders);
    return [];
  }

  const [headers, ...rows] = values;
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

  assertRequiredHeaders(normalizedHeaders, requiredHeaders);

  return rows.map((row) =>
    normalizedHeaders.reduce<SheetObject>((record, header, index) => {
      record[header] = String(row[index] ?? "");
      return record;
    }, {})
  );
};
