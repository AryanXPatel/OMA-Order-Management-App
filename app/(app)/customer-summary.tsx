import React, { useState, useEffect, useContext, useCallback } from "react";
import { useFeedback } from "../context/FeedbackContext";
import { useMemo } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  TextInput,
  Modal,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { fetchWithRetry, apiCache } from "../utils/apiManager";
import {
  fetchCustomerLedger,
  calculateLedgerStats,
  formatIndianNumber,
} from "../utils/ledgerUtils";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

// Create debounce helper function
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const ALPHABET = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i)
);

const CustomerSummaryScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const { showFeedback } = useFeedback();

  // Customer selection state
  const [selectedLetter, setSelectedLetter] = useState("");
  const [customers, setCustomers] = useState([]);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Ledger data state
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Transaction details modal
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Replace letter picker with horizontal letter buttons
  const renderLetterSelection = () => {
    return (
      <View style={styles.lettersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.letterScrollContent}
        >
          {ALPHABET.map((letter) => (
            <TouchableOpacity
              key={letter}
              style={[
                styles.letterButton,
                selectedLetter === letter && styles.selectedLetter,
              ]}
              onPress={() => {
                setSelectedLetter(letter);
                fetchCustomers(letter);
              }}
            >
              <Text
                style={[
                  styles.letterText,
                  selectedLetter === letter && styles.selectedLetterText,
                ]}
              >
                {letter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  useEffect(() => {
    const preloadData = async () => {
      try {
        // Preload some common data if needed
        await fetchWithRetry(
          `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
          {},
          1,
          1000
        );
      } catch (error) {
        // Silent fail - no error handling needed for preload
      }
    };

    preloadData();
  }, []);

  const fetchCustomers = async (letter) => {
    if (!letter) return;

    setIsCustomerLoading(true);
    try {
      // Check cache first
      const cacheKey = `customers_${letter}`;
      const cachedCustomers = apiCache.get(cacheKey);
      if (cachedCustomers) {
        setCustomers(cachedCustomers);
        setIsCustomerLoading(false);
        return;
      }

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (
        response.data &&
        response.data.values &&
        Array.isArray(response.data.values)
      ) {
        const header = response.data.values[0];
        const customerData = response.data.values.slice(1);

        const filteredCustomers = customerData
          .filter((row) => row[1]?.startsWith(letter))
          .map((row) => {
            return {
              "Customer CODE": row[0] || "",
              "Customer NAME": row[1] || "",
            };
          })
          .sort((a, b) => a["Customer NAME"].localeCompare(b["Customer NAME"]));

        setCustomers(filteredCustomers);
        apiCache.set(cacheKey, filteredCustomers);
      } else {
        throw new Error("Invalid response from backend");
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Data Load Error",
        message: `Failed to fetch customers: ${error.message}`,
        autoDismiss: false,
      });
    } finally {
      setIsCustomerLoading(false);
    }
  };

  const searchCustomers = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (
        response.data &&
        response.data.values &&
        Array.isArray(response.data.values)
      ) {
        const customerData = response.data.values.slice(1);
        const results = customerData
          .filter(
            (row) =>
              row[1]?.toLowerCase().includes(query.toLowerCase()) ||
              row[0]?.toLowerCase().includes(query.toLowerCase())
          )
          .map((row) => {
            return {
              "Customer CODE": row[0] || "",
              "Customer NAME": row[1] || "",
            };
          })
          .sort((a, b) => a["Customer NAME"].localeCompare(b["Customer NAME"]));

        setSearchResults(results);
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Search Error",
        message: "Failed to search customers. Please try again.",
        autoDismiss: true,
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Create a debounced version of search
  const debouncedSearch = useCallback(
    debounce((text) => {
      searchCustomers(text);
    }, 300),
    []
  );

  // Update the loadCustomerLedger function to search by name directly
  const loadCustomerLedger = async (customer) => {
    if (!customer) return;

    try {
      setLedgerLoading(true);
      setSelectedCustomer(customer);

      // Clear search when a customer is selected
      setSearchQuery("");
      setSearchResults([]);

      // Get the customer name (this is the key change - using name instead of code)
      const customerName = customer["Customer NAME"];

      if (!customerName) {
        Alert.alert("Error", "Invalid customer name");
        setLedgerLoading(false);
        return;
      }

      // Fetch ledger data directly using customer name
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Ledger_2!A1:L`,
        {},
        2,
        2000
      );

      if (response.data && response.data.values) {
        const headers = response.data.values[0] || [];

        // Filter ledger entries by customer name (column 8)
        // const ledgerEntries = response.data.values
        //   .slice(1)
        //   .filter((row) => row.length > 8 && row[8] === customerName)
        //   .map((row) => {
        //     const entry = {};
        //     headers.forEach((header, index) => {
        //       if (index < row.length) {
        //         entry[header] = row[index];
        //       }
        //     });
        //     return entry;
        //   });
        const ledgerEntries = await fetchCustomerLedger(customerName);

        setLedgerData(ledgerEntries);
      } else {
        setLedgerData([]);
      }
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Data Load Failed",
        message: "Could not load customer ledger data. Please try again.",
        autoDismiss: false,
      });
      setLedgerData([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const customerStats = useMemo(() => {
    return selectedCustomer ? calculateLedgerStats(ledgerData) : null;
  }, [selectedCustomer, ledgerData]);

  const viewTransactionDetails = (transaction) => {
    setSelectedTransaction(transaction);
    setModalVisible(true);
  };

  const parseTransactionDate = (dateStr) => {
    if (!dateStr) return 0;
    const [day, month, year] = dateStr.split("/").map(Number);
    if (!day || !month || !year) return 0;
    return new Date(year, month - 1, day).getTime();
  };

  const getTransactionsByDate = useMemo(() => {
    if (!ledgerData || ledgerData.length === 0) return [];

    // Group transactions by date
    const transactionsByDate = {};

    ledgerData.forEach((transaction) => {
      if (!transaction.Date) return;

      if (!transactionsByDate[transaction.Date]) {
        transactionsByDate[transaction.Date] = {
          date: transaction.Date,
          transactions: [],
          totalAmount: 0,
        };
      }

      transactionsByDate[transaction.Date].transactions.push(transaction);

      // Calculate running total: debits positive, credits negative
      const amount = parseFloat(transaction.Amount.replace(/,/g, "")) || 0;
      transactionsByDate[transaction.Date].totalAmount +=
        transaction.DC === "D" ? amount : -amount;
    });

    // Sort dates from newest to oldest
    return Object.values(transactionsByDate).sort((a, b) => {
      const dateA = parseTransactionDate(a.date);
      const dateB = parseTransactionDate(b.date);
      if (dateA === 0 && dateB === 0) return 0;
      if (dateA === 0) return 1;
      if (dateB === 0) return -1;
      return dateB - dateA;
    });
  }, [ledgerData]);

  const styles = StyleSheet.create({
    scrollContainer: {
      paddingBottom: 20,
    },
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : "#f4f4f8",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: StatusBar.currentHeight || 50,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: isDark ? colors.surfaceVariant : "#16a085",
    },
    headerTitle: {
      color: isDark ? colors.text : "#FFF",
      fontSize: 20,
      fontWeight: "bold",
    },
    searchContainer: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      margin: 15,
      borderRadius: 10,
      padding: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    searchInput: {
      backgroundColor: isDark ? colors.surface : "#f5f6fa",
      padding: 10,
      borderRadius: 8,
      color: isDark ? colors.text : "#000",
      borderWidth: 1,
      borderColor: isDark ? colors.border : "#e0e0e0",
    },
    pickerContainer: {
      marginVertical: 8,
      marginHorizontal: 15,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      borderWidth: 1,
      borderColor: isDark ? colors.border : "#e0e0e0",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    picker: {
      height: 50,
      backgroundColor: "transparent",
      color: isDark ? colors.text : "#000000",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      paddingHorizontal: 15,
      paddingVertical: 10,
      color: isDark ? colors.text : "#333",
    },
    customerCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      margin: 15,
      marginTop: 0,
      borderRadius: 10,
      padding: 15,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    customerName: {
      fontSize: 20,
      fontWeight: "bold",
      color: isDark ? colors.text : "#333",
      marginBottom: 5,
    },
    customerCode: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#777",
      marginBottom: 15,
    },
    summaryCard: {
      backgroundColor: isDark
        ? "rgba(22, 160, 133, 0.1)"
        : "rgba(22, 160, 133, 0.05)",
      padding: 15,
      borderRadius: 8,
      marginBottom: 10,
      borderLeftWidth: 3,
      borderLeftColor: isDark
        ? "rgba(22, 160, 133, 0.5)"
        : "rgba(22, 160, 133, 0.3)",
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
    },
    summaryLabel: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : "#666",
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
    },
    totalCredit: {
      color: "#27ae60",
    },
    totalDebit: {
      color: "#e74c3c",
    },
    balanceValue: {
      fontSize: 16,
      fontWeight: "bold",
    },
    transactionCard: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      marginHorizontal: 15,
      marginVertical: 6,
      borderRadius: 10,
      padding: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    dateHeader: {
      fontSize: 16,
      fontWeight: "600",
      color: isDark ? colors.text : "#333",
      marginBottom: 5,
    },
    transactionItem: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    transactionDescription: {
      fontSize: 15,
      color: isDark ? colors.text : "#333",
      marginBottom: 5,
    },
    transactionAmount: {
      fontSize: 14,
      fontWeight: "500",
      textAlign: "right",
    },
    creditAmount: {
      color: "#27ae60",
    },
    debitAmount: {
      color: "#e74c3c",
    },
    transactionDetails: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : "#777",
    },
    modalContainer: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      width: "90%",
      borderRadius: 15,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 5,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: isDark ? colors.text : "#333",
      marginBottom: 15,
    },
    modalDetailRow: {
      flexDirection: "row",
      marginBottom: 10,
      flexWrap: "wrap",
    },
    modalDetailLabel: {
      width: "40%",
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
    },
    modalDetailValue: {
      width: "60%",
      fontSize: 14,
      fontWeight: "500",
      color: isDark ? colors.text : "#333",
    },
    closeButton: {
      marginTop: 20,
      alignSelf: "flex-end",
      padding: 10,
    },
    noResults: {
      textAlign: "center",
      padding: 20,
      color: isDark ? colors.textSecondary : "#777",
    },
    searchResultItem: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "#eee",
    },
    searchResultText: {
      fontSize: 16,
      color: isDark ? colors.text : "#333",
    },
    searchResultCode: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#777",
    },
    dateTotal: {
      fontSize: 14,
      fontWeight: "500",
      textAlign: "right",
      paddingTop: 5,
      marginTop: 5,
      borderTopWidth: 1,
      borderTopColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    debugToggle: {
      alignSelf: "center",
      paddingVertical: 6,
      paddingHorizontal: 15,
      backgroundColor: isDark
        ? "rgba(52, 152, 219, 0.2)"
        : "rgba(52, 152, 219, 0.1)",
      borderRadius: 15,
      marginTop: 10,
    },
    debugToggleText: {
      fontSize: 12,
      color: isDark ? "#3498db" : "#2980b9",
      fontWeight: "500",
    },
    sectionTitleContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    transactionCount: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : "#666",
    },
    noResultsContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
    },
    dateHeaderContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    transactionCountBadge: {
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    transactionCountText: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : "#666",
    },
    transactionContent: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 15,
    },
    modalDCBadge: {
      alignSelf: "center",
      paddingVertical: 4,
      paddingHorizontal: 12,
      backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.05)",
      borderRadius: 15,
      marginBottom: 10,
    },
    modalDCText: {
      fontWeight: "600",
      fontSize: 12,
    },
    modalAmountContainer: {
      alignItems: "center",
      marginBottom: 20,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    modalAmount: {
      fontSize: 24,
      fontWeight: "bold",
    },
    closeButton: {
      padding: 5,
    },
    lettersContainer: {
      marginVertical: 10,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
    },
    letterScrollContent: {
      paddingHorizontal: 15,
    },
    letterButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginRight: 6,
      borderRadius: 4,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    },
    selectedLetter: {
      backgroundColor: colors.primary,
    },
    letterText: {
      fontSize: 15,
      fontWeight: "500",
      color: isDark ? colors.text : "#000",
    },
    selectedLetterText: {
      color: "#FFF",
    },
    searchContainer: {
      backgroundColor: isDark ? colors.surfaceVariant : "#fff",
      margin: 15,
      borderRadius: 10,
      padding: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.1,
      shadowRadius: 3,
      elevation: 2,
      flexDirection: "row",
      alignItems: "center",
    },
    searchInput: {
      backgroundColor: isDark ? colors.surface : "#f5f6fa",
      padding: 12,
      borderRadius: 8,
      color: isDark ? colors.text : "#000",
      borderWidth: 1,
      borderColor: isDark ? colors.border : "#e0e0e0",
      flex: 1,
    },
    searchIconContainer: {
      position: "absolute",
      right: 20,
      padding: 10,
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={isDark ? colors.text : "#FFF"}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Summary</Text>
        <TouchableOpacity onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={24}
            color={isDark ? colors.text : "#FFF"}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer by name or code..."
            placeholderTextColor={
              isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"
            }
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              debouncedSearch(text);
            }}
          />
          <View style={styles.searchIconContainer}>
            <Ionicons
              name="search"
              size={20}
              color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
            />
          </View>
        </View>

        {isSearching ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 20 }}
          />
        ) : searchQuery.length > 0 ? (
          searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item, index) =>
                `search-${item["Customer CODE"] || index}`
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => loadCustomerLedger(item)}
                >
                  <Text style={styles.searchResultText}>
                    {item["Customer NAME"]}
                  </Text>
                  <Text style={styles.searchResultCode}>
                    Code: {item["Customer CODE"]}
                  </Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <Text style={styles.noResults}>
              No customers found matching your search
            </Text>
          )
        ) : (
          <>
            {/* Customer Selection by Letter */}
            <Text style={styles.sectionTitle}>Select Customer</Text>

            {/* Replace Picker with horizontal letter selection */}
            {renderLetterSelection()}

            <View style={styles.pickerContainer}>
              {isCustomerLoading ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ padding: 15 }}
                />
              ) : (
                <Picker
                  selectedValue={selectedCustomer?.["Customer NAME"] || ""}
                  onValueChange={(itemValue) => {
                    const customer = customers.find(
                      (c) => c["Customer NAME"] === itemValue
                    );
                    if (customer) {
                      loadCustomerLedger(customer);
                    }
                  }}
                  style={[
                    styles.picker,
                    Platform.OS === "android" && {
                      color: isDark ? "#ffffff" : "#000000",
                      backgroundColor: isDark ? "transparent" : "#f5f6fa",
                    },
                  ]}
                  dropdownIconColor={isDark ? "#ffffff" : "#000000"}
                >
                  <Picker.Item label="Select Customer" value="" />
                  {customers.map((customer, index) => (
                    <Picker.Item
                      key={index}
                      label={`${customer["Customer NAME"]} (${customer["Customer CODE"]})`}
                      value={customer["Customer NAME"]}
                    />
                  ))}
                </Picker>
              )}
            </View>
          </>
        )}

        {/* Customer Information and Ledger */}
        {selectedCustomer && (
          <>
            <View style={styles.customerCard}>
              <Text style={styles.customerName}>
                {selectedCustomer["Customer NAME"]}
              </Text>
              <Text style={styles.customerCode}>
                Customer Code: {selectedCustomer["Customer CODE"]}
              </Text>
              {customerStats && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Credits:</Text>
                    <Text style={[styles.summaryValue, styles.totalCredit]}>
                      ₹{customerStats.totalCredit}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Debits:</Text>
                    <Text style={[styles.summaryValue, styles.totalDebit]}>
                      ₹{customerStats.totalDebit}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { fontWeight: "600" }]}>
                      Balance:
                    </Text>
                    <Text
                      style={[
                        styles.balanceValue,
                        customerStats.hasCredit
                          ? styles.totalCredit
                          : styles.totalDebit,
                      ]}
                    >
                      {customerStats.hasCredit ? "CR " : "DR "}₹
                      {formatIndianNumber(
                        Math.abs(
                          customerStats.totalCreditRaw -
                            customerStats.totalDebitRaw
                        )
                      )}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Transaction History</Text>

            {ledgerLoading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={{ marginTop: 20 }}
              />
            ) : ledgerData.length === 0 ? (
              <Text style={styles.noResults}>
                No transaction history available
              </Text>
            ) : (
              <FlatList
                data={getTransactionsByDate}
                keyExtractor={(item) => item.date}
                renderItem={({ item }) => (
                  <View style={styles.transactionCard}>
                    <Text style={styles.dateHeader}>{item.date}</Text>

                    {item.transactions.map((transaction, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.transactionItem}
                        onPress={() => viewTransactionDetails(transaction)}
                      >
                        <Text style={styles.transactionDescription}>
                          {transaction.Description.replace("Default ", "")}
                        </Text>
                        <Text
                          style={[
                            styles.transactionAmount,
                            transaction.DC === "C"
                              ? styles.creditAmount
                              : styles.debitAmount,
                          ]}
                        >
                          {transaction.DC === "C" ? "CR: " : "DR: "}₹
                          {transaction.Amount}
                        </Text>
                        <Text style={styles.transactionDetails}>
                          {transaction.Company_Year}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    <Text
                      style={[
                        styles.dateTotal,
                        item.totalAmount < 0
                          ? styles.creditAmount
                          : styles.debitAmount,
                      ]}
                    >
                      Day Total: ₹
                      {formatIndianNumber(Math.abs(item.totalAmount))}
                      {item.totalAmount < 0 ? " CR" : " DR"}
                    </Text>
                  </View>
                )}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Transaction Details Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={isDark ? colors.text : "#333"}
                />
              </TouchableOpacity>
            </View>

            {selectedTransaction && (
              <>
                <View style={styles.modalDCBadge}>
                  <Text
                    style={[
                      styles.modalDCText,
                      selectedTransaction.DC === "C"
                        ? styles.creditAmount
                        : styles.debitAmount,
                    ]}
                  >
                    {selectedTransaction.DC === "C" ? "CREDIT" : "DEBIT"}
                  </Text>
                </View>

                <View style={styles.modalAmountContainer}>
                  <Text
                    style={[
                      styles.modalAmount,
                      selectedTransaction.DC === "C"
                        ? styles.creditAmount
                        : styles.debitAmount,
                    ]}
                  >
                    ₹{selectedTransaction.Amount}
                  </Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Date:</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedTransaction.Date}
                  </Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Description:</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedTransaction.Description}
                  </Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Company Year:</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedTransaction.Company_Year}
                  </Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Customer Code:</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedTransaction.Customer_CODE}
                  </Text>
                </View>

                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Customer Group:</Text>
                  <Text style={styles.modalDetailValue}>
                    {selectedTransaction.Customer_Group || "N/A"}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};
export default CustomerSummaryScreen;
