export const formatCompactOrderId = (orderId: string | null | undefined) => {
  const raw = String(orderId ?? "").trim();

  if (!raw) {
    return "Order";
  }

  const fiscalMatch = raw.match(/^(\d{4})(?:-\d{4})?[_-](\d+)/);
  if (fiscalMatch) {
    const year = fiscalMatch[1].slice(-2);
    const sequence = fiscalMatch[2].slice(-4).padStart(4, "0");
    return `${year}-${sequence}`;
  }

  const yearMatch = raw.match(/\b(\d{4})\b/);
  const sequenceMatch = raw.match(/(\d+)(?!.*\d)/);

  if (yearMatch && sequenceMatch) {
    const year = yearMatch[1].slice(-2);
    const sequence = sequenceMatch[1].slice(-4).padStart(4, "0");
    return `${year}-${sequence}`;
  }

  return raw.replace(/^#?ORD-?/i, "");
};
