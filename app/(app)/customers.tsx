import React, { useState, useEffect, useContext } from "react";
import { useFeedback } from "../context/FeedbackContext";
import { scale, moderateScale, isTablet } from "../utils/responsive";
import { useMemo, useCallback } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  StatusBar,
  TextInput,
  Modal,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import LoadingIndicator from "../components/LoadingIndicator";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

//helper function
// Add this helper function near your other utility functions
const parseContactInfo = (contactString) => {
  try {
    if (!contactString) return [];

    // Handle the quotes in the input if present
    const cleanedString = contactString.replace(/["\\]/g, "");

    // Split by commas or newlines
    const parts = cleanedString
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Process each part to extract phone number and label
    return parts
      .map((part) => {
        try {
          // Extract the number - look for any sequence of digits (at least 10)
          const numberMatch = part.match(/\d{10,}/);
          if (!numberMatch) return null;

          const number = numberMatch[0];
          let label = "";

          // Look for common label patterns with more flexible matching
          if (part.toLowerCase().includes("mobile")) {
            label = "Mobile";
          } else if (part.toLowerCase().includes("home")) {
            label = "Home";
          } else if (part.toLowerCase().includes("office")) {
            label = "Office";
          } else if (part.toLowerCase().includes("land")) {
            label = "Landline";
          } else if (part.toLowerCase().includes("work")) {
            label = "Work";
          } else {
            // Try to extract any word before the number as a potential label
            const labelMatch = part.match(/([A-Za-z]+)[\s:]*\d+/);
            if (labelMatch) {
              label = labelMatch[1].trim();
            }
          }

          return { number, label };
        } catch (partError) {
          console.log("Error parsing contact part:", part);
          return null;
        }
      })
      .filter((item) => item !== null); // Remove any entries where we couldn't extract a phone number
  } catch (error) {
    console.error("Error parsing contact info:", error);
    return []; // Return empty array as fallback
  }
};
const parseDate = (dateStr) => {
  try {
    if (!dateStr || dateStr === "No orders yet") return 0; // Return epoch (lowest date value)

    // Handle dates in formats like "11/3" (missing year)
    if (dateStr.split("/").length === 2) {
      const currentYear = new Date().getFullYear();
      dateStr = `${dateStr}/${currentYear}`;
    }

    const [day, month, year] = dateStr.split("/").map(Number);

    // Validate parts exist and are reasonable
    if (!day || !month) return 0;

    // For abbreviated years (2-digit), expand to 4-digit
    let fullYear = year;
    if (year && year < 100) {
      fullYear = year < 50 ? 2000 + year : 1900 + year;
    } else if (!year) {
      fullYear = new Date().getFullYear(); // Default to current year if missing
    }

    const date = new Date(fullYear, month - 1, day);

    // Check if date is valid
    if (isNaN(date.getTime())) return 0;

    return date.getTime();
  } catch (e) {
    return 0;
  }
};
const splitOrderId = (orderId) => {
  if (!orderId) return ["", "0"];
  const parts = orderId.split("_");
  const fiscalYear = parts[0] || "";
  const orderNum = parts.length > 1 ? parts[1] : "0";
  return [fiscalYear, orderNum];
};
// Format Indian number with commas
const formatIndianNumber = (num) => {
  try {
    const parts = num.toFixed(2).split(".");
    const lastThree = parts[0].substring(parts[0].length - 3);
    const otherNumbers = parts[0].substring(0, parts[0].length - 3);
    const formatted =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") +
      (otherNumbers ? "," : "") +
      lastThree;
    return `${formatted}.${parts[1]}`;
  } catch (error) {
    return "0.00";
  }
};

// Memoized CustomerCard component to prevent unnecessary re-renders

const CustomersScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sortBy, setSortBy] = useState("name"); // name, orders, date
  const [sortDirection, setSortDirection] = useState("asc"); // asc, desc
  const { showFeedback } = useFeedback();
  const [paymentFilter, setPaymentFilter] = useState("all"); // "all", "credit", "due"
  const [displayLimit, setDisplayLimit] = useState(20);

  const themeColor = "#9b59b6"; // Purple theme for Customers
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [callOptions, setCallOptions] = useState([]);
  const [customerToCall, setCustomerToCall] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);
  const fetchLedgerSummary = async () => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Ledger!A1:G`,
        {},
        2,
        1500
      );

      if (!response.data || !response.data.values) {
        throw new Error("Invalid response from ledger API");
      }

      // Get headers and data rows
      const headerRow = response.data.values[0];
      const dataRows = response.data.values.slice(1);

      // Create customer balance mapping
      const customerBalances = {};

      dataRows.forEach((row) => {
        if (row.length < 6) return;

        const customerCode = row[5]; // Customer CODE column
        const amount = parseFloat(row[1] || "0");
        const dcType = row[2]; // 'C' for credit, 'D' for debit

        if (!customerCode || isNaN(amount)) return;

        if (!customerBalances[customerCode]) {
          customerBalances[customerCode] = {
            totalCredit: 0,
            totalDebit: 0,
          };
        }

        if (dcType === "C") {
          customerBalances[customerCode].totalCredit += amount;
        } else if (dcType === "D") {
          customerBalances[customerCode].totalDebit += amount;
        }
      });

      // Process final balance and status
      const ledgerSummary = {};
      Object.entries(customerBalances).forEach(([code, data]) => {
        const balance = data.totalDebit - data.totalCredit;
        ledgerSummary[code] = {
          balance: balance,
          hasCredit: balance <= 0,
        };
      });

      return ledgerSummary;
    } catch (error) {
      return {};
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Add this function before your loadCustomers function
  const fetchCustomerCodes = async () => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (!response.data || !response.data.values) {
        throw new Error("Invalid response from customer API");
      }

      // Create a mapping from customer name to code
      const customerCodesMap = {};
      const rows = response.data.values.slice(1); // Skip header

      rows.forEach((row) => {
        const code = row[0]; // Customer_Master column A = code
        const name = row[1]; // Customer_Master column B = name
        if (name) {
          customerCodesMap[name] = code;
        }
      });

      return customerCodesMap;
    } catch (error) {
      return {};
    }
  };
  const loadCustomers = async () => {
    try {
      setLoading(true);
      console.log("Starting to load customers data");

      // 1. First get all customer codes
      const customerCodesMap = await fetchCustomerCodes();
      console.log(
        `Loaded ${Object.keys(customerCodesMap).length} customer codes`
      );

      // 2. Get ledger balances
      const ledgerSummary = await fetchLedgerSummary();
      console.log(
        `Loaded ${Object.keys(ledgerSummary).length} customer ledger entries`
      );

      // 3. Load complete customer master data with contacts
      console.log("Loading customer master data with contacts");
      const masterResponse = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:C`,
        {},
        3, // Increase retries
        3000 // Increase timeout
      );

      if (!masterResponse?.data?.values) {
        throw new Error("Invalid response from Customer Master API");
      }

      console.log(
        `Got ${masterResponse.data.values.length} rows from Customer Master`
      );

      // Build a map of all customers from master with their contact info
      const masterCustomers = {};
      if (masterResponse.data && masterResponse.data.values) {
        const masterRows = masterResponse.data.values.slice(1); // Skip header
        masterRows.forEach((row) => {
          if (row.length < 2) return; // Skip invalid rows

          const code = row[0] || "";
          const name = row[1] || "";
          const contactString = row.length > 2 ? row[2] || "" : "";

          if (name) {
            // Parse contacts with improved error handling
            let contacts = [];
            try {
              contacts = parseContactInfo(contactString);
            } catch (contactError) {
              console.log(`Error parsing contact for ${name}:`, contactError);
            }

            masterCustomers[name] = {
              name: name,
              code: code,
              contacts: contacts,
              rawContact: contactString,
              totalSpend: 0,
              orderCount: 0,
              lastOrderDate: "No orders yet",
              latestOrderId: "",
              sources: [],
              salesReps: [],
              products: [],
              productCount: 0,
              isNew: true, // Flag for customers without order history
              // Default balance info (will be updated if ledger data exists)
              balance: ledgerSummary[code]?.balance || 0,
              hasCredit:
                ledgerSummary[code]?.hasCredit !== undefined
                  ? ledgerSummary[code]?.hasCredit
                  : true,
              formattedBalance: formatIndianNumber(
                Math.abs(ledgerSummary[code]?.balance || 0)
              ),
            };
          }
        });
      }

      console.log(
        `Created ${Object.keys(masterCustomers).length} master customer records`
      );

      // 4. Load order data to enhance customer info
      console.log("Loading order history data");
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A2:P`,
        {},
        3,
        3000
      );

      if (response?.data?.values) {
        console.log(`Got ${response.data.values.length} order rows`);

        // Process each row to get customer info
        const allRows = response.data.values.map((row) => ({
          date: row[0] || "", // SYS-TIME
          user: row[2] || "", // USER
          customerName: row[4] || "", // CUSTOMER NAME
          orderId: row[5] || "", // ORDER ID
          productName: row[6] || "", // PRODUCT NAME
          amount: row[10] || "", // ORDER AMOUNT
          source: row[11] || "", // SOURCE
        }));

        // Process order data and update the master customer map
        allRows.forEach((row) => {
          if (!row.customerName) return;

          // If customer doesn't exist in our master map, initialize them
          if (!masterCustomers[row.customerName]) {
            masterCustomers[row.customerName] = {
              name: row.customerName,
              code: customerCodesMap[row.customerName] || "",
              totalSpend: 0,
              orderCount: 0,
              lastOrderDate: "",
              latestOrderId: "",
              sources: new Set(),
              salesReps: new Set(),
              products: new Set(),
              contacts: [], // Empty contacts if they didn't exist in the master sheet
              isNew: false,
              // Add payment info
              balance:
                ledgerSummary[customerCodesMap[row.customerName]]?.balance || 0,
              hasCredit:
                ledgerSummary[customerCodesMap[row.customerName]]?.hasCredit !==
                undefined
                  ? ledgerSummary[customerCodesMap[row.customerName]]?.hasCredit
                  : true,
              formattedBalance: formatIndianNumber(
                Math.abs(
                  ledgerSummary[customerCodesMap[row.customerName]]?.balance ||
                    0
                )
              ),
            };
          } else {
            // If customer existed in master but had no orders, they're not "new" anymore
            masterCustomers[row.customerName].isNew = false;
          }

          // Add this order's info to the customer
          const customer = masterCustomers[row.customerName];

          // Add to total spend
          const cleanAmount = row.amount.replace(/,/g, "");
          customer.totalSpend += parseFloat(cleanAmount || 0);

          // Track unique orders
          if (!customer.orders) customer.orders = new Set();
          customer.orders.add(row.orderId);

          // Update order count
          customer.orderCount = customer.orders.size;

          // Track latest order date
          if (
            !customer.lastOrderDate ||
            customer.lastOrderDate === "No orders yet" ||
            isNewerDate(row.date, customer.lastOrderDate)
          ) {
            customer.lastOrderDate = row.date;
            customer.latestOrderId = row.orderId;
          }

          // Track sources, sales reps and products
          // Use proper Set initialization and check
          if (!(customer.sources instanceof Set)) {
            customer.sources = new Set(
              Array.isArray(customer.sources) ? customer.sources : []
            );
          }
          if (row.source) customer.sources.add(row.source);

          if (!(customer.salesReps instanceof Set)) {
            customer.salesReps = new Set(
              Array.isArray(customer.salesReps) ? customer.salesReps : []
            );
          }
          if (row.user) customer.salesReps.add(row.user);

          if (!(customer.products instanceof Set)) {
            customer.products = new Set(
              Array.isArray(customer.products) ? customer.products : []
            );
          }
          if (row.productName) customer.products.add(row.productName);
        });

        // 5. Convert Sets to arrays for easier rendering
        console.log("Converting data for display");
        const customerList = Object.values(masterCustomers).map((customer) => {
          return {
            ...customer,
            sources: Array.isArray(customer.sources)
              ? customer.sources
              : Array.from(customer.sources || []),
            salesReps: Array.isArray(customer.salesReps)
              ? customer.salesReps
              : Array.from(customer.salesReps || []),
            products: Array.isArray(customer.products)
              ? customer.products
              : Array.from(customer.products || []),
            productCount: Array.isArray(customer.products)
              ? customer.products.length
              : customer.products instanceof Set
              ? customer.products.size
              : 0,
          };
        });

        console.log(`Processed ${customerList.length} total customers`);
        setCustomers(customerList);
        apiCache.set("customers", customerList);
      } else {
        console.warn("No order data available");

        // Convert the master customers to a list even without orders
        const customerList = Object.values(masterCustomers).map((customer) => ({
          ...customer,
          sources: Array.isArray(customer.sources) ? customer.sources : [],
          salesReps: Array.isArray(customer.salesReps)
            ? customer.salesReps
            : [],
          products: Array.isArray(customer.products) ? customer.products : [],
          productCount: 0,
        }));

        setCustomers(customerList);
        apiCache.set("customers", customerList);
      }
    } catch (error) {
      console.error("Load customers error:", error);
      showFeedback({
        type: "error",
        title: "Load Failed",
        message: `Could not load customer data: ${error.message}`,
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Modify the searchCustomers function to include balance data

  const searchCustomers = async (query) => {
    if (!query || query.length < 2) return;

    try {
      setLoading(true);

      // First get ledger summary data
      const ledgerSummary = await fetchLedgerSummary();

      // Fetch all customers from Customer_Master
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:C`,
        {},
        2,
        1500
      );

      if (!response.data || !response.data.values) {
        throw new Error("Invalid response from Customer_Master API");
      }

      // Skip header row
      const rows = response.data.values.slice(1);

      // Filter customers that match the query
      const matchingCustomers = rows.filter((row) => {
        const code = row[0] || "";
        const name = row[1] || "";
        return (
          name.toLowerCase().includes(query.toLowerCase()) ||
          code.toLowerCase().includes(query.toLowerCase())
        );
      });

      // Create customer objects for display
      const newCustomers = matchingCustomers.map((row) => {
        const customerCode = row[0] || "";
        const customerName = row[1] || "";

        // Check if customer already exists in our loaded data
        const existingCustomer = customers.find(
          (c) => c.code === customerCode || c.name === customerName
        );

        if (existingCustomer) {
          return existingCustomer; // Return existing customer with full data
        }

        // Get the payment data for this customer if available
        const ledgerData = ledgerSummary[customerCode] || {
          balance: 0,
          hasCredit: true,
        };

        const balance = ledgerData.balance || 0;

        // Create a new customer object with minimal data
        return {
          name: customerName,
          code: customerCode,
          totalSpend: 0,
          orderCount: 0,
          lastOrderDate: "No orders yet",
          sources: [],
          salesReps: [],
          products: [],
          productCount: 0,
          // Include payment information:
          balance: balance,
          hasCredit: ledgerData.hasCredit,
          formattedBalance: formatIndianNumber(Math.abs(balance)),
          isNew: true, // Flag to identify customers without order history
        };
      });
      //REST

      // Update customers state with both existing and new customers
      const updatedCustomers = [...customers];

      // Add any new customers that don't already exist
      newCustomers.forEach((newCustomer) => {
        if (
          !updatedCustomers.some(
            (c) => c.code === newCustomer.code || c.name === newCustomer.name
          )
        ) {
          updatedCustomers.push(newCustomer);
        }
      });

      setCustomers(updatedCustomers);
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Search Failed",
        message: "Could not search customer database",
        autoDismiss: true,
      });
    } finally {
      setLoading(false);
    }
  };
  const debouncedSearch = useCallback(
    debounce((query) => {
      if (query.length >= 2) {
        searchCustomers(query);
      }
    }, 300),
    []
  );
  // Helper function to check if one date is newer than another
  const isNewerDate = (dateStr1, dateStr2) => {
    const date1 = parseDate(dateStr1);
    const date2 = parseDate(dateStr2);
    return date1 > date2;
  };

  // Helper function to parse DD/MM/YYYY format
  // Replace the parseDate function with this improved version

  const handleRefresh = async () => {
    setRefreshing(true);
    apiCache.set("customers", null); // Clear cache to force refresh
    await loadCustomers();
  };

  const viewCustomerDetails = (customer) => {
    setSelectedCustomer(customer);
    setModalVisible(true);
  };

  const callCustomer = (customer) => {
    if (!customer || !customer.contacts || customer.contacts.length === 0) {
      // No contact info available
      Alert.alert(
        "No Contact",
        "No phone number available for this customer.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

    // If there's only one number, call directly
    if (customer.contacts.length === 1) {
      Linking.openURL(`tel:${customer.contacts[0].number}`);
      return;
    }

    // If multiple numbers, show custom modal
    setCustomerToCall(customer);
    setCallOptions(customer.contacts);
    setCallModalVisible(true);
  };

  const emailCustomer = (email) => {
    if (!email) {
      Alert.alert("Error", "No email address available");
      return;
    }
    Linking.openURL(`mailto:${email}`);
  };

  // Add this before the return statement
  const filteredAndSortedCustomers = useMemo(() => {
    // Move the entire content of getFilteredAndSortedCustomers here
    if (!customers || customers.length === 0) return [];

    // First apply search filtering if any
    let filteredCustomers = customers;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();

      // Search by name OR code
      filteredCustomers = customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(query) ||
          (customer.code && customer.code.toLowerCase().includes(query))
      );
    }

    // Apply payment filter
    if (paymentFilter === "due") {
      filteredCustomers = filteredCustomers.filter((c) => c.balance > 0);
    } else if (paymentFilter === "credit") {
      filteredCustomers = filteredCustomers.filter((c) => c.balance < 0);
    }

    // Then apply sorting
    return [...filteredCustomers].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "orders":
          comparison = a.orderCount - b.orderCount;
          break;
        case "date":
          // First try to compare by date
          const dateA = parseDate(a.lastOrderDate);
          const dateB = parseDate(b.lastOrderDate);

          // If both have valid dates, use them
          if (dateA > 0 && dateB > 0) {
            comparison = dateA - dateB;
          }
          // Fall back to order IDs for comparison if available
          else if (a.latestOrderId && b.latestOrderId) {
            // Extract fiscal year and number parts for proper sorting
            const [aFY, aNum] = splitOrderId(a.latestOrderId);
            const [bFY, bNum] = splitOrderId(b.latestOrderId);

            // Compare fiscal years first
            if (aFY !== bFY) {
              comparison = bFY.localeCompare(aFY); // Most recent fiscal year first
            } else {
              // If same fiscal year, compare the order numbers
              comparison = parseInt(bNum, 10) - parseInt(aNum, 10); // Higher number = more recent
            }
          }
          // If one has a date but the other doesn't, the one with date comes first
          else if (dateA > 0) {
            comparison = -1;
          } else if (dateB > 0) {
            comparison = 1;
          }
          // If neither has date or order ID, fall back to name
          else {
            comparison = a.name.localeCompare(b.name);
          }
          break;
        case "spend":
          comparison = a.totalSpend - b.totalSpend;
          break;
        case "balance":
          comparison = Math.abs(a.balance) - Math.abs(b.balance);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [customers, searchQuery, sortBy, sortDirection, paymentFilter]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : "#f5f5f5",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 50,
      paddingBottom: 15,
      paddingHorizontal: 20,
      backgroundColor: isDark ? colors.surfaceVariant : themeColor,
    },
    headerTitle: {
      color: isDark ? colors.text : "#FFF",
      fontSize: 20,
      fontWeight: "bold",
    },
    iconStyle: {
      color: isDark ? colors.text : "#FFF",
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? colors.surfaceVariant : "white",
      marginHorizontal: 15,
      marginVertical: 10,
      paddingHorizontal: 15,
      borderRadius: 25,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 2,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      paddingRight: 10,
      fontSize: 15,
      color: isDark ? colors.text : "#000",
    },
    sortControls: {
      flexDirection: "row",
      paddingHorizontal: 15,
      marginBottom: 10,
      justifyContent: "flex-start",
      flexWrap: "wrap",
    },
    sortButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 15,
      marginRight: 10,
      marginBottom: 5,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    },
    sortText: {
      color: isDark ? colors.textSecondary : "#666",
      fontSize: 13,
      marginRight: 4,
    },
    activeSortText: {
      color: themeColor,
      fontWeight: "500",
    },
    customerCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      borderRadius: 12,
      padding: 15,
      marginHorizontal: 15,
      marginBottom: 10,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 2,
    },
    customerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    customerName: {
      fontSize: 17,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
      flex: 1,
    },
    statsTag: {
      backgroundColor: isDark
        ? "rgba(155, 89, 182, 0.2)"
        : "rgba(155, 89, 182, 0.1)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    statsTagText: {
      color: isDark ? "#9b59b6" : "#8e44ad",
      fontSize: 12,
      fontWeight: "500",
    },
    customerDetailRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    detailText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      marginLeft: 8,
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 12,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      marginHorizontal: 4,
    },
    actionText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "500",
      marginLeft: 4,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: isDark ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.5)",
      justifyContent: "center",
    },
    modalContent: {
      backgroundColor: isDark ? colors.background : "#fff",
      margin: 20,
      borderRadius: 15,
      maxHeight: "80%",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
    },
    closeButton: {
      padding: 5,
    },
    modalBody: {
      padding: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
      marginTop: 15,
      marginBottom: 10,
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: 12,
      alignItems: "flex-start",
    },
    infoLabel: {
      width: 100,
      fontSize: 15,
      color: isDark ? colors.textSecondary : "#666",
    },
    infoValue: {
      flex: 1,
      fontSize: 15,
      color: isDark ? colors.text : "#333",
      fontWeight: "500",
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      marginVertical: 15,
    },
    pill: {
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      marginRight: 8,
      marginBottom: 8,
    },
    pillText: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : "#666",
    },
    pillsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 5,
    },
    modalActions: {
      flexDirection: "row",
      padding: 15,
      borderTopWidth: 1,
      borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    modalAction: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 8,
      marginHorizontal: 5,
    },
    modalActionText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "500",
      marginLeft: 8,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
      marginTop: 50,
    },
    emptyText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : "#666",
      marginTop: 10,
      textAlign: "center",
    },
    customersCountText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
      textAlign: "center",
      marginVertical: 10,
    },
    filterContainer: {
      flexDirection: "row",
      paddingHorizontal: 15,
      marginBottom: 4,
    },
    filterButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 15,
      marginRight: 10,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    },
    activeFilterButton: {
      backgroundColor: isDark
        ? "rgba(155, 89, 182, 0.2)"
        : "rgba(155, 89, 182, 0.1)",
    },
    filterText: {
      color: isDark ? colors.textSecondary : "#666",
      fontSize: 13,
    },
    activeFilterText: {
      color: isDark ? "#9b59b6" : "#8e44ad",
      fontWeight: "500",
    },
    newCustomerInfo: {
      alignItems: "center",
      padding: 15,
      backgroundColor: isDark
        ? "rgba(52, 152, 219, 0.1)"
        : "rgba(52, 152, 219, 0.05)",
      borderRadius: 10,
      marginVertical: 15,
    },
    cardDivider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
      marginVertical: 8,
    },
    loadMoreButton: {
      alignItems: "center",
      padding: 15,
      marginBottom: 15,
      marginHorizontal: 15,
      backgroundColor: isDark
        ? "rgba(155, 89, 182, 0.1)"
        : "rgba(155, 89, 182, 0.05)",
      borderRadius: 10,
    },
    loadMoreText: {
      fontSize: 14,
      color: themeColor,
      fontWeight: "500",
    },
    headerTitleContainer: {
      alignItems: "center",
    },
    headerSubtitle: {
      color: isDark ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.85)",
      fontSize: 13,
      marginTop: 2,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      marginHorizontal: 15,
      marginVertical: 8,
    },

    callModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end", // Modal appears from bottom
    },
    callModalContainer: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingVertical: 20,
      paddingHorizontal: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      elevation: 10,
      // Make it fully opaque for better visibility in dark mode
      // backgroundColor: "#FFFFFF", // Remove this line as we set it conditionally
    },
    callModalHeader: {
      paddingHorizontal: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 15,
    },
    callModalTitle: {
      fontSize: 20,
      fontWeight: "600",
    },
    callModalCloseButton: {
      padding: 5,
    },
    callModalSubtitle: {
      fontSize: 14,
      marginBottom: 20,
      paddingHorizontal: 20,
    },
    callOptionsContainer: {
      marginBottom: 20,
    },
    callOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
    },
    callOptionIconContainer: {
      marginRight: 16,
    },
    callOptionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    callOptionContent: {
      flex: 1,
    },
    callOptionLabel: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 3,
    },
    callOptionNumber: {
      fontSize: 14,
    },
    cancelButton: {
      alignSelf: "center",
      paddingVertical: 15,
      paddingHorizontal: 40,
      borderRadius: 12,
      backgroundColor: "rgba(155, 89, 182, 0.1)",
      marginTop: 5,
    },
    cancelButtonText: {
      color: themeColor,
      fontSize: 16,
      fontWeight: "500",
    },
  });

  const CustomerCard = React.memo(
    ({
      item,
      viewCustomerDetails,
      formatIndianNumber,
      callCustomer,
      router,
      isDark,
      colors,
      themeColor,
    }) => {
      return (
        <TouchableOpacity
          style={[
            styles.customerCard,
            item.isNew && { borderLeftWidth: 3, borderLeftColor: "#3498db" },
          ]}
          onPress={() => viewCustomerDetails(item)}
        >
          <View style={styles.customerHeader}>
            <Text style={styles.customerName}>
              {item.name}
              {item.isNew && (
                <Text
                  style={{
                    color: "#3498db",
                    fontSize: 13,
                    fontWeight: "normal",
                  }}
                >
                  {" "}
                  (No Order History)
                </Text>
              )}
            </Text>
            <View style={styles.statsTag}>
              <Text style={styles.statsTagText}>{item.orderCount} orders</Text>
            </View>
          </View>

          {item.code && (
            <View style={styles.customerDetailRow}>
              <Ionicons
                name="barcode-outline"
                size={16}
                color={isDark ? colors.textSecondary : "#666"}
              />
              <Text style={styles.detailText}>Code: {item.code}</Text>
            </View>
          )}

          {item.balance !== 0 && (
            <View style={styles.customerDetailRow}>
              <Ionicons
                name={item.hasCredit ? "wallet-outline" : "cash-outline"}
                size={16}
                color={item.hasCredit ? "#27ae60" : "#e74c3c"}
              />
              <Text
                style={[
                  styles.detailText,
                  {
                    color: item.hasCredit ? "#27ae60" : "#e74c3c",
                    fontWeight: "500",
                  },
                ]}
              >
                {item.hasCredit
                  ? `Advance Payment: ₹${item.formattedBalance}`
                  : `Outstanding: ₹${item.formattedBalance}`}
              </Text>
            </View>
          )}

          {/* Divider */}
          {item.balance !== 0 && (
            <View
              style={{
                height: 2,
                backgroundColor: isDark ? "#444" : "#ddd",
                marginTop: 10,
                marginBottom: 10,
                width: "100%",
                alignSelf: "center",
              }}
            />
          )}

          <View style={styles.customerDetailRow}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text style={styles.detailText}>
              Last order: {item.lastOrderDate || "N/A"}
            </Text>
          </View>

          {!item.isNew && (
            <View style={styles.customerDetailRow}>
              <Ionicons
                name="pricetag-outline"
                size={16}
                color={isDark ? colors.textSecondary : "#666"}
              />
              <Text style={styles.detailText}>
                Total spend: ₹{formatIndianNumber(item.totalSpend)}
              </Text>
            </View>
          )}

          {!item.isNew && (
            <View style={styles.customerDetailRow}>
              <Ionicons
                name="cube-outline"
                size={16}
                color={isDark ? colors.textSecondary : "#666"}
              />
              <Text style={styles.detailText}>
                Products: {item.productCount} different items
              </Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#3498db" }]}
              onPress={() => callCustomer(item)}
            >
              <Ionicons name="call-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#27ae60" }]}
              onPress={() =>
                router.push(
                  "/(app)/new-order?customer=" + encodeURIComponent(item.name)
                )
              }
            >
              <Ionicons name="add-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>New Order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: themeColor }]}
              onPress={() => viewCustomerDetails(item)}
            >
              <Ionicons name="information-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Details</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} style={styles.iconStyle} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Customers</Text>
          {!loading && !refreshing && (
            <Text style={styles.headerSubtitle}>
              {filteredAndSortedCustomers.length} customers
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            style={styles.iconStyle}
          />
        </TouchableOpacity>
      </View>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={isDark ? colors.textSecondary : "#666"}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers by name or code..."
          placeholderTextColor={
            isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"
          }
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            debouncedSearch(text);
          }}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons
              name="close-circle"
              size={20}
              color={isDark ? colors.textSecondary : "#666"}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {/* ADD THE PAYMENT FILTER BUTTONS HERE */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            paymentFilter === "all" && styles.activeFilterButton,
          ]}
          onPress={() => setPaymentFilter("all")}
        >
          <Text
            style={[
              styles.filterText,
              paymentFilter === "all" && styles.activeFilterText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            paymentFilter === "due" && styles.activeFilterButton,
          ]}
          onPress={() => setPaymentFilter("due")}
        >
          <Text
            style={[
              styles.filterText,
              paymentFilter === "due" && styles.activeFilterText,
            ]}
          >
            Outstanding
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            paymentFilter === "credit" && styles.activeFilterButton,
          ]}
          onPress={() => setPaymentFilter("credit")}
        >
          <Text
            style={[
              styles.filterText,
              paymentFilter === "credit" && styles.activeFilterText,
            ]}
          >
            Advance Payment
          </Text>
        </TouchableOpacity>
      </View>

      {/* Divider Line */}
      <View style={[styles.divider, { marginVertical: 6 }]} />
      {/* Sort controls */}
      <View style={styles.sortControls}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            if (sortBy === "name") {
              setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
              setSortBy("name");
              setSortDirection("asc");
            }
          }}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "name" && styles.activeSortText,
            ]}
          >
            Name{" "}
            {sortBy === "name" && (sortDirection === "asc" ? "(A-Z)" : "(Z-A)")}
          </Text>
          {sortBy === "name" && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={themeColor}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            if (sortBy === "orders") {
              setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
              setSortBy("orders");
              setSortDirection("desc");
            }
          }}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "orders" && styles.activeSortText,
            ]}
          >
            Orders
          </Text>
          {sortBy === "orders" && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={themeColor}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            if (sortBy === "date") {
              setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
              setSortBy("date");
              setSortDirection("desc");
            }
          }}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "date" && styles.activeSortText,
            ]}
          >
            Recent
          </Text>
          {sortBy === "date" && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
              size={14}
              color={themeColor}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            if (sortBy === "spend") {
              setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
              setSortBy("spend");
              setSortDirection("desc");
            }
          }}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "spend" && styles.activeSortText,
            ]}
          >
            Spending
          </Text>
          {sortBy === "spend" && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={themeColor}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            if (sortBy === "balance") {
              setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            } else {
              setSortBy("balance");
              setSortDirection("desc"); // Default to highest outstanding first
            }
          }}
        >
          <Text
            style={[
              styles.sortText,
              sortBy === "balance" && styles.activeSortText,
            ]}
          >
            Payment
          </Text>
          {sortBy === "balance" && (
            <Ionicons
              name={sortDirection === "asc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={themeColor}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Customer list */}
      {loading ? (
        <LoadingIndicator message="Loading customers..." showTips={true} />
      ) : (
        // Replace your current FlatList with this version

        <FlatList
          data={filteredAndSortedCustomers.slice(0, displayLimit)}
          renderItem={({ item }) => (
            <CustomerCard
              item={item}
              viewCustomerDetails={viewCustomerDetails}
              formatIndianNumber={formatIndianNumber}
              callCustomer={callCustomer}
              router={router}
              isDark={isDark}
              colors={colors}
              themeColor={themeColor}
            />
          )}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[themeColor]}
            />
          }
          ListFooterComponent={() =>
            displayLimit < filteredAndSortedCustomers.length ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => setDisplayLimit((prev) => prev + 20)}
              >
                <Text style={styles.loadMoreText}>
                  Show More ({filteredAndSortedCustomers.length - displayLimit}{" "}
                  remaining)
                </Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="people-outline"
                size={60}
                color={isDark ? "rgba(255,255,255,0.2)" : "#ccc"}
              />
              <Text style={styles.emptyText}>
                No customers found
                {searchQuery ? ` matching "${searchQuery}"` : ""}
              </Text>
            </View>
          }
        />
      )}
      {/* Customer Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedCustomer && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedCustomer.name}</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={isDark ? colors.text : "#333"}
                    />
                  </TouchableOpacity>
                </View>

                {/* Only one FlatList component */}
                <FlatList
                  data={[1]} // Just a dummy item to use FlatList for scrolling
                  renderItem={() => (
                    <View style={styles.modalBody}>
                      {/* Customer Stats */}
                      <Text style={styles.sectionTitle}>Overview</Text>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Customer Code:</Text>
                        <Text style={styles.infoValue}>
                          {selectedCustomer.code || "Not available"}
                        </Text>
                      </View>

                      {/* Add the contact information section here */}

                      {selectedCustomer.contacts &&
                        selectedCustomer.contacts.length > 0 && (
                          <>
                            <Text style={styles.sectionTitle}>
                              Contact Information
                            </Text>
                            {selectedCustomer.contacts.map((contact, index) => (
                              <View key={index} style={styles.infoRow}>
                                <Text style={styles.infoLabel}>
                                  {contact.label || `Phone ${index + 1}`}:
                                </Text>
                                <TouchableOpacity
                                  onPress={() =>
                                    Linking.openURL(`tel:${contact.number}`)
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.infoValue,
                                      { color: "#3498db" },
                                    ]}
                                  >
                                    {contact.number}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                            <View style={styles.divider} />
                          </>
                        )}
                      {/* Payment details */}
                      {selectedCustomer.balance !== 0 && (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Payment Status:</Text>
                          {selectedCustomer.balance !== 0 ? (
                            <Text
                              style={[
                                styles.infoValue,
                                {
                                  color: selectedCustomer.hasCredit
                                    ? "#27ae60"
                                    : "#e74c3c",
                                  fontWeight: "600",
                                },
                              ]}
                            >
                              {selectedCustomer.hasCredit
                                ? `Advance Payment: ₹${selectedCustomer.formattedBalance}`
                                : `Outstanding: ₹${selectedCustomer.formattedBalance}`}
                            </Text>
                          ) : (
                            <Text style={styles.infoValue}>
                              No outstanding balance
                            </Text>
                          )}
                        </View>
                      )}
                      {selectedCustomer.isNew ? (
                        <View style={styles.newCustomerInfo}>
                          <Ionicons
                            name="information-circle"
                            size={24}
                            color="#3498db"
                            style={{ marginBottom: 10 }}
                          />
                          <Text
                            style={{
                              fontSize: 15,
                              color: isDark ? "#bbb" : "#555",
                              textAlign: "center",
                              marginBottom: 10,
                            }}
                          >
                            This customer exists in your master database but
                            hasn't placed any orders yet.
                          </Text>
                          <TouchableOpacity
                            style={{
                              backgroundColor: "#27ae60",
                              paddingVertical: 8,
                              paddingHorizontal: 15,
                              borderRadius: 8,
                              marginTop: 10,
                            }}
                            onPress={() => {
                              setModalVisible(false);
                              router.push(
                                "/(app)/new-order?customer=" +
                                  encodeURIComponent(selectedCustomer.name)
                              );
                            }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "500" }}>
                              Create First Order
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Total Orders:</Text>
                            <Text style={styles.infoValue}>
                              {selectedCustomer.orderCount}
                            </Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Total Spend:</Text>
                            <Text style={styles.infoValue}>
                              ₹{formatIndianNumber(selectedCustomer.totalSpend)}
                            </Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Last Order:</Text>
                            <Text style={styles.infoValue}>
                              {selectedCustomer.lastOrderDate || "N/A"}
                            </Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Products:</Text>
                            <Text style={styles.infoValue}>
                              {selectedCustomer.productCount} different items
                            </Text>
                          </View>

                          <View style={styles.divider} />

                          {/* Product History */}
                          <Text style={styles.sectionTitle}>
                            Products Ordered
                          </Text>
                          <View style={styles.pillsContainer}>
                            {selectedCustomer.products.map((product, index) => (
                              <View key={index} style={styles.pill}>
                                <Text style={styles.pillText}>{product}</Text>
                              </View>
                            ))}
                          </View>

                          <View style={styles.divider} />

                          {/* Sources and Sales Reps */}
                          <Text style={styles.sectionTitle}>Order Sources</Text>
                          <View style={styles.pillsContainer}>
                            {selectedCustomer.sources.length > 0 ? (
                              selectedCustomer.sources.map((source, index) => (
                                <View key={index} style={styles.pill}>
                                  <Text style={styles.pillText}>
                                    {source || "App"}
                                  </Text>
                                </View>
                              ))
                            ) : (
                              <Text style={styles.detailText}>
                                No source information available
                              </Text>
                            )}
                          </View>

                          <View style={styles.divider} />

                          <Text style={styles.sectionTitle}>
                            Sales Representatives
                          </Text>
                          <View style={styles.pillsContainer}>
                            {selectedCustomer.salesReps.map((rep, index) => (
                              <View key={index} style={styles.pill}>
                                <Text style={styles.pillText}>{rep}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                  keyExtractor={() => "customer-details"}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalAction, { backgroundColor: "#3498db" }]}
                    onPress={() => {
                      setModalVisible(false);
                      callCustomer(selectedCustomer);
                    }}
                  >
                    <Ionicons name="call-outline" size={20} color="#fff" />
                    <Text style={styles.modalActionText}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalAction, { backgroundColor: "#27ae60" }]}
                    onPress={() => {
                      setModalVisible(false);
                      router.push(
                        "/(app)/new-order?customer=" +
                          encodeURIComponent(selectedCustomer.name)
                      );
                    }}
                  >
                    <Ionicons name="add-outline" size={20} color="#fff" />
                    <Text style={styles.modalActionText}>New Order</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Phone Call Selection Modal */}
      <Modal
        transparent={true}
        visible={callModalVisible}
        animationType="fade"
        onRequestClose={() => setCallModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCallModalVisible(false)}>
          <View style={styles.callModalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.callModalContainer,
                  {
                    backgroundColor: isDark ? colors.background : "#ffffff", // Use background instead of surfaceVariant
                    borderTopColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "transparent", // Add border for better visibility
                    borderTopWidth: 1,
                  },
                ]}
              >
                <View style={styles.callModalHeader}>
                  <Text
                    style={[
                      styles.callModalTitle,
                      { color: isDark ? colors.text : "#333333" },
                    ]}
                  >
                    Call {customerToCall?.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCallModalVisible(false)}
                    style={styles.callModalCloseButton}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={isDark ? colors.textSecondary : "#999999"}
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  style={[
                    styles.callModalSubtitle,
                    { color: isDark ? colors.textSecondary : "#666666" },
                  ]}
                >
                  Select a phone number
                </Text>

                <View style={styles.callOptionsContainer}>
                  {callOptions.map((contact, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.callOption,
                        {
                          borderBottomColor: isDark
                            ? "rgba(255,255,255,0.15)"
                            : "#f0f0f0", // Increase opacity
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.03)"
                            : "transparent", // Add subtle highlight
                        },
                      ]}
                      onPress={() => {
                        setCallModalVisible(false);
                        Linking.openURL(`tel:${contact.number}`);
                      }}
                    >
                      <View style={styles.callOptionIconContainer}>
                        <View
                          style={[
                            styles.callOptionIcon,
                            { backgroundColor: "#3498db" },
                          ]}
                        >
                          <Ionicons
                            name={
                              contact.label?.toLowerCase().includes("mobile")
                                ? "phone-portrait"
                                : contact.label?.toLowerCase().includes("home")
                                ? "home"
                                : contact.label
                                    ?.toLowerCase()
                                    .includes("office")
                                ? "business"
                                : "call"
                            }
                            size={22}
                            color="#ffffff"
                          />
                        </View>
                      </View>
                      <View style={styles.callOptionContent}>
                        <Text
                          style={[
                            styles.callOptionLabel,
                            { color: isDark ? colors.text : "#333333" },
                          ]}
                        >
                          {contact.label || `Phone ${index + 1}`}
                        </Text>
                        <Text
                          style={[
                            styles.callOptionNumber,
                            {
                              color: isDark ? colors.textSecondary : "#666666",
                            },
                          ]}
                        >
                          {contact.number}
                        </Text>
                      </View>
                      <Ionicons name="call" size={22} color="#3498db" />
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setCallModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default CustomersScreen;
