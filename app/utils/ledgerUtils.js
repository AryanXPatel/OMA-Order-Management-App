import { fetchWithRetry } from "./apiManager";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

/**
 * Fetches and processes customer ledger data by customer name
 * @param customerName Customer name to fetch ledger for
 * @returns Processed ledger entries with totals
 */
export async function fetchCustomerLedger(customerName) {
  try {
    // Fetch the ledger data from new Customer_Ledger_2 sheet with all columns
    const response = await fetchWithRetry(
      `${BACKEND_URL}/api/sheets/Customer_Ledger_2!A1:L`,
      {},
      3,
      2000
    );

    if (!response.data || !response.data.values) {
      throw new Error("Invalid response from backend");
    }

    // Get headers and data rows
    const headerRow = response.data.values[0];
    const dataRows = response.data.values.slice(1);

    console.log(`Total ledger entries: ${dataRows.length}`);
    console.log(`Filtering for customer name: ${customerName}`);

    // Filter by customer name (index 8) instead of customer code
    const ledgerEntries = dataRows
      .filter((row) => {
        const rowCustomerName = row[8]; // Customer_NAME is at index 8
        const isMatch = rowCustomerName === customerName;
        return isMatch;
      })
      .map((row) => {
        // Create entry object with proper field names from new sheet
        const entry = {
          Date: row[0] || "",
          Amount: row[1] || "0",
          DC: row[2] || "",
          Company_Year: row[3] || "",
          Description: row[4] || "",
          Customer_CODE: row[5] || "",
          Customer_Group: row[6] || "",
          VOUCHER_NUMBER: row[7] || "",
          Customer_NAME: row[8] || "",
          Customer_City: row[9] || "",
          GST_Number: row[10] || "",
          Mobile: row[11] || "",
        };

        // Log for debugging
        console.log(
          `Entry: ${entry.Date} - ${entry.DC} - ${entry.Amount} - ${entry.Customer_NAME}`
        );

        return entry;
      });

    console.log(
      `Found ${ledgerEntries.length} entries for customer ${customerName}`
    );

    // Log the first few entries for debugging
    if (ledgerEntries.length > 0) {
      console.log("Sample entries:");
      ledgerEntries.slice(0, 3).forEach((entry) => {
        console.log(JSON.stringify(entry));
      });
    }

    return ledgerEntries;
  } catch (error) {
    console.error("Error fetching customer ledger:", error);
    throw error;
  }
}

/**
 * Calculate customer ledger statistics
 */
// Update the calculateLedgerStats function with this implementation:

export function calculateLedgerStats(ledgerData) {
  // Define all possible transaction types that should be displayed
  const allTransactionTypes = [
    "Default Bank Payment Voucher",
    "Default Bank Receipt Voucher",
    "Default Cash Receipt Voucher",
    "Default Credit Note",
    "Default Sales Invoice",
    "Default Sales Return Invoice",
    "Default Debit Note",
    "Default Journal Voucher",
  ];

  if (!ledgerData || ledgerData.length === 0) {
    const emptyTransactionTypes = {};
    allTransactionTypes.forEach((type) => {
      emptyTransactionTypes[type] = { C: 0, D: 0 };
    });

    return {
      totalCredit: formatIndianNumber(0),
      totalDebit: formatIndianNumber(0),
      totalCreditRaw: 0,
      totalDebitRaw: 0,
      hasCredit: true,
      transactionTypes: emptyTransactionTypes,
    };
  }

  try {
    const transactionTypes = {};
    allTransactionTypes.forEach((type) => {
      transactionTypes[type] = { C: 0, D: 0 };
    });

    let totalCredit = 0;
    let totalDebit = 0;
    const creditAmounts = [];
    const debitAmounts = [];

    ledgerData.forEach((entry, index) => {
      try {
        if (!entry || typeof entry !== "object") {
          return;
        }

        // FIXED: Handle negative amounts properly
        let amount = entry.Amount;
        if (typeof amount !== "string") {
          amount = String(amount ?? "0");
        }
        if (typeof amount.replace === "function") {
          amount = amount.replace(/,/g, "");
        }
        amount = Math.abs(parseFloat(amount) || 0);
        try {
          // First try to get amount from the Amount field
          if (entry.Amount !== undefined && entry.Amount !== null) {
            let amountValue = entry.Amount;

            // Convert to string and handle negative numbers
            if (typeof amountValue !== "string") {
              amountValue = String(amountValue);
            }

            // Remove commas and parse to float (handles negatives automatically)
            if (amountValue && typeof amountValue === "string") {
              // Remove commas but keep negative sign
              amountValue = amountValue.replace(/,/g, "");
              amount = parseFloat(amountValue) || 0;
            } else {
              amount = 0;
            }
          }
          // Fallback to Amount (+-)
          else if (
            entry["Amount (+-)"] !== undefined &&
            entry["Amount (+-)"] !== null
          ) {
            let amountValue = entry["Amount (+-)"];

            // Convert to string and handle negative numbers
            if (typeof amountValue !== "string") {
              amountValue = String(amountValue);
            }

            // Remove commas and parse to float (handles negatives automatically)
            if (amountValue && typeof amountValue === "string") {
              amountValue = amountValue.replace(/,/g, "");
              amount = parseFloat(amountValue) || 0;
            } else {
              amount = 0;
            }
          }
        } catch (parseError) {
          console.warn("Amount parsing error:", parseError, entry.Amount);
          amount = 0;
        }

        // Handle NaN
        if (isNaN(amount)) {
          amount = 0;
        }

        // Use absolute value for calculations since DC indicates direction
        const absoluteAmount = Math.abs(amount);

        const type = entry.Description || "Other Transactions";

        if (!transactionTypes[type]) {
          transactionTypes[type] = { C: 0, D: 0 };
        }

        // Process based on debit/credit indicator
        if (entry.DC === "D") {
          transactionTypes[type].D += absoluteAmount;
          totalDebit += absoluteAmount;
          debitAmounts.push({
            date: entry.Date,
            description: entry.Description,
            amount: absoluteAmount,
          });
        } else if (entry.DC === "C") {
          transactionTypes[type].C += absoluteAmount;
          totalCredit += absoluteAmount;
          creditAmounts.push({
            date: entry.Date,
            description: entry.Description,
            amount: absoluteAmount,
          });
        }
      } catch (error) {
        console.error("Error processing ledger entry:", error, entry);
      }
    });

    const hasCredit = totalCredit >= totalDebit;

    return {
      totalCredit: formatIndianNumber(totalCredit),
      totalDebit: formatIndianNumber(totalDebit),
      totalCreditRaw: totalCredit,
      totalDebitRaw: totalDebit,
      hasCredit: hasCredit,
      transactionTypes: transactionTypes,
    };
  } catch (error) {
    console.error("Error calculating customer stats:", error);
    return {
      totalCredit: formatIndianNumber(0),
      totalDebit: formatIndianNumber(0),
      totalCreditRaw: 0,
      totalDebitRaw: 0,
      hasCredit: true,
      transactionTypes: {},
    };
  }
}
export function formatIndianNumber(num) {
  try {
    // Handle undefined, null, or invalid inputs
    if (num === undefined || num === null || num === "" || isNaN(num)) {
      return "0.00";
    }

    // Convert to number if it's a string
    let numValue = num;
    if (typeof num === "string") {
      // Remove existing commas and convert to number
      numValue = parseFloat(num.replace(/,/g, "")) || 0;
    } else if (typeof num !== "number") {
      numValue = parseFloat(num) || 0;
    }

    // Handle NaN
    if (isNaN(numValue)) {
      return "0.00";
    }

    // Format to 2 decimal places
    const parts = numValue.toFixed(2).split(".");

    if (!parts || parts.length !== 2) {
      return "0.00";
    }

    // Apply Indian number formatting
    const lastThree = parts[0].substring(Math.max(0, parts[0].length - 3));
    const otherNumbers = parts[0].substring(
      0,
      Math.max(0, parts[0].length - 3)
    );

    const formatted = otherNumbers
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;

    return `${formatted}.${parts[1]}`;
  } catch (error) {
    console.error("Error formatting number:", error, "Input:", num);
    return "0.00";
  }
}
/**
 * Helper function to convert DD/MM/YYYY to Date object
 */
function convertToDateObj(dateStr) {
  try {
    // Validate input
    if (!dateStr || typeof dateStr !== "string") {
      return 0;
    }

    // Check common date formats
    let day, month, year;

    if (dateStr.includes("/")) {
      [day, month, year] = dateStr.split("/");
    } else if (dateStr.includes("-")) {
      [day, month, year] = dateStr.split("-");
    } else {
      return 0; // Unrecognized format
    }

    // Validate parts
    if (
      !day ||
      !month ||
      !year ||
      isNaN(parseInt(day)) ||
      isNaN(parseInt(month)) ||
      isNaN(parseInt(year))
    ) {
      return 0;
    }

    // Ensure we have 4-digit year
    if (year.length === 2) {
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      year = century + parseInt(year);
    }

    // Create and validate date object
    const dateObj = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    );

    if (isNaN(dateObj.getTime())) {
      return 0; // Invalid date
    }

    return dateObj.getTime();
  } catch (e) {
    console.warn("Date conversion error:", e, dateStr);
    return 0; // Return epoch if parsing fails
  }
}
