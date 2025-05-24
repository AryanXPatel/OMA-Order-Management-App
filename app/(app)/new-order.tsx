import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from "react";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { fetchWithRetry } from "../utils/apiManager";
import {
  DatePickerInput,
  TimePickerModal,
  DatePickerModal,
} from "react-native-paper-dates";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import axios from "axios";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

const BACKEND_URL = "https://oma-demo-server.onrender.com";

import { registerTranslation } from "react-native-paper-dates";
registerTranslation("en", {}); // English locale

const NewSalesOrderScreen = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  // Core state
  const [isLoading, setIsLoading] = useState(false);
  const [orderSource, setOrderSource] = useState("Phone");
  const [orderId, setOrderId] = useState("");
  const [isOrderIdLoading, setIsOrderIdLoading] = useState(true);

  // Customer state
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState([]);
  const [selectedLetter, setSelectedLetter] = useState("");
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [filteredCustomers, setFilteredCustomers] = useState([]);

  // Product state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productList, setProductList] = useState([]);
  const [quantity, setQuantity] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [products, setProducts] = useState([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProductLetter, setSelectedProductLetter] = useState("");
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Add to your state declarations inside NewSalesOrderScreen
  const [orderDate, setOrderDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isCustomDate, setIsCustomDate] = useState(false);
  const [orderComments, setOrderComments] = useState("");

  // Add these to your state declarations
  const [dateText, setDateText] = useState("");
  const [timeText, setTimeText] = useState("");
  const [dateError, setDateError] = useState("");

  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  // References
  const scrollViewRef = useRef(null);
  const quantityInputRef = useRef(null);

  // Define alphabet for letter selectors
  const alphabet = Array.from({ length: 26 }, (_, i) =>
    String.fromCharCode(65 + i)
  );

  // Add these callback functions for the date picker
  const onDismissDatePicker = useCallback(() => {
    setDatePickerVisible(false);
  }, []);

  const onConfirmDatePicker = useCallback(
    (params) => {
      setDatePickerVisible(false);

      // Keep the time information from the current orderDate
      const newDate = new Date(params.date);
      newDate.setHours(orderDate.getHours());
      newDate.setMinutes(orderDate.getMinutes());

      setOrderDate(newDate);
      setIsCustomDate(true);
      updateDateTimeText(newDate);
    },
    [orderDate]
  );

  // Add these callback functions for the time picker
  const onDismissTimePicker = useCallback(() => {
    setTimePickerVisible(false);
  }, []);

  const onConfirmTimePicker = useCallback(
    ({ hours, minutes }) => {
      setTimePickerVisible(false);

      // Create a new date with the updated time
      const newDate = new Date(orderDate);
      newDate.setHours(hours);
      newDate.setMinutes(minutes);

      setOrderDate(newDate);
      setIsCustomDate(true);
      updateDateTimeText(newDate);
    },
    [orderDate]
  );

  // Group alphabet into chunks for better display
  const getAlphabetGroups = () => {
    return [
      alphabet.slice(0, 7), // A-G
      alphabet.slice(7, 14), // H-N
      alphabet.slice(14, 21), // O-U
      alphabet.slice(21), // V-Z
    ];
  };

  // Update the handleDateChange function with this improved version
  const handleDateChange = (event, selectedDate) => {
    // Close the picker immediately to avoid the dismiss error
    setShowDatePicker(false);

    // Only update if a date was actually selected (user didn't cancel)
    if (selectedDate) {
      setOrderDate(selectedDate);
      setIsCustomDate(true);
    }
  };

  // Format numbers with Indian comma style
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
      console.error("Number formatting error:", error);
      return "0.00";
    }
  };

  // Add this useEffect to initialize date/time text when component loads
  useEffect(() => {
    updateDateTimeText(new Date());
  }, []);

  // Function to update text fields from a Date object
  const updateDateTimeText = (date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; // Convert 0 to 12
    const formattedHours = String(hours12).padStart(2, "0");

    setDateText(`${day}/${month}/${year}`);
    setTimeText(`${formattedHours}:${minutes} ${ampm}`);
  };

  // Replace the date/time input section with this implementation

  // Add these functions near the top of your component
  const formatDateInput = (text) => {
    // Remove any non-digit characters
    const digits = text.replace(/\D/g, "");

    // Format with slashes
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 4) {
      return `${digits.substring(0, 2)}/${digits.substring(2)}`;
    } else {
      return `${digits.substring(0, 2)}/${digits.substring(
        2,
        4
      )}/${digits.substring(4, 8)}`;
    }
  };

  const formatTimeInput = (text) => {
    // Remove any non-numeric characters and spaces
    const digits = text.replace(/[^0-9]/g, "");

    // Format with colon
    if (digits.length <= 2) {
      return digits;
    } else {
      return `${digits.substring(0, 2)}:${digits.substring(2, 4)}`;
    }
  };
  const validateDateInput = (text) => {
    if (!text) return false;

    // Check format DD/MM/YYYY
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const matches = text.match(dateRegex);

    if (!matches) return false;

    const [, day, month, year] = matches;
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    // Check ranges
    if (monthNum < 1 || monthNum > 12) return false;
    if (dayNum < 1 || dayNum > 31) return false;
    if (yearNum < 2000 || yearNum > 2100) return false;

    // Check days in month
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    if (dayNum > daysInMonth) return false;

    return true;
  };

  const validateTimeInput = (text) => {
    if (!text) return false;

    // Check format HH:MM AM/PM
    const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
    const matches = text.match(timeRegex);

    if (!matches) return false;

    const [, hours, minutes] = matches;
    const hoursNum = parseInt(hours, 10);
    const minutesNum = parseInt(minutes, 10);

    // Check ranges
    if (hoursNum < 1 || hoursNum > 12) return false;
    if (minutesNum < 0 || minutesNum > 59) return false;

    return true;
  };

  // Add this handler for date changes
  const handleDateInputChange = (text) => {
    const formatted = formatDateInput(text);
    setDateText(formatted);
    setDateError("");
  };

  // Add this handler for time changes
  const handleTimeInputChange = (text) => {
    const formatted = formatTimeInput(text);
    setTimeText(formatted);
    setDateError("");
  };

  // Function to validate and convert entered text to Date object
  const handleDateTimeChange = () => {
    try {
      // Parse the date in DD/MM/YYYY format
      const [day, month, year] = dateText.split("/").map(Number);

      // Parse the time in HH:MM AM/PM format
      let [timeValue, period] = timeText.split(" ");
      let [hours, minutes] = timeValue.split(":").map(Number);

      // Convert hours to 24-hour format if PM
      if (period?.toUpperCase() === "PM" && hours < 12) {
        hours += 12;
      }
      if (period?.toUpperCase() === "AM" && hours === 12) {
        hours = 0;
      }

      // Create date object
      const newDate = new Date(year, month - 1, day, hours, minutes);

      // Validate date
      if (isNaN(newDate.getTime())) {
        setDateError("Invalid date or time format");
        return false;
      }

      // Update state
      setOrderDate(newDate);
      setIsCustomDate(true);
      setDateError("");
      return true;
    } catch (error) {
      setDateError(
        "Please use format DD/MM/YYYY for date and HH:MM AM/PM for time"
      );
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        if (mounted) {
          setIsLoading(true);
          await Promise.all([fetchProducts(), generateOrderId()]);
        }
      } catch (error) {
        console.error("Initialization error:", error);
        Alert.alert(
          "Error",
          "Failed to initialize the order screen. Please try again."
        );
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // Network detection for reconnection
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        console.log("Network connected");
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const showSuccessScreen = async (orderId) => {
    // Set success state
    setOrderSuccess(true);

    // Wait 2 seconds before navigating back
    setTimeout(() => {
      router.replace("/main"); // or try one of these alternatives:
      // router.replace("main");
      // router.replace("/(app)/main");
    }, 2000);
  };
  // Generate order ID
  const generateOrderId = async () => {
    try {
      setIsOrderIdLoading(true);

      // Generate a temporary ID immediately for better UX
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-indexed (January is 0)
      const currentYear = today.getFullYear();

      // April is month 3 (0-indexed), so if current month is >= 3 (April or later),
      // use current year as fiscal year start, otherwise use previous year
      const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fiscalYearEnd = fiscalYearStart + 1;
      const yearPrefix = `${fiscalYearStart}-${fiscalYearEnd}`;
      const tempId = `${yearPrefix}_00001`;

      // Show the temporary ID while the real one loads
      setOrderId(tempId);

      // Get the real ID
      const newOrderId = await getNextOrderId();
      if (newOrderId) {
        setOrderId(newOrderId);
      }
    } catch (error) {
      console.error("Error generating order ID:", error);
    } finally {
      setIsOrderIdLoading(false);
    }
  };

  // Add this function above your component
  const getProductCategoryColor = (groupCode) => {
    // Generate consistent colors based on group code
    const colors = [
      "#3498db",
      "#e74c3c",
      "#2ecc71",
      "#f39c12",
      "#9b59b6",
      "#1abc9c",
      "#d35400",
      "#c0392b",
    ];

    if (!groupCode) return colors[0];

    // Use the first character of the group code to determine color
    const charCode = groupCode.charCodeAt(0) || 65;
    return colors[charCode % colors.length];
  };

  const getNextOrderId = async () => {
    try {
      // Determine current financial year (April 1 to March 31)
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fiscalYearEnd = fiscalYearStart + 1;
      const yearPrefix = `${fiscalYearStart}-${fiscalYearEnd}`;

      console.log(`Generating order ID for fiscal year: ${yearPrefix}`);

      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/New_Order_Table!A1:F`,
        {},
        2,
        1500
      );

      let maxId = 0;

      if (response.data && response.data.values) {
        // ORDER ID is column 6 (index 5)
        response.data.values.forEach((row) => {
          if (row[5] && row[5].startsWith(yearPrefix)) {
            try {
              const [, idPart] = row[5].split("_");
              const id = parseInt(idPart, 10);
              if (!isNaN(id) && id > maxId) {
                maxId = id;
              }
            } catch (e) {
              console.log("Skipping malformed order ID");
            }
          }
        });
      }

      // Increment highest ID and pad with zeros
      const nextId = String(maxId + 1).padStart(5, "0");
      const finalId = `${yearPrefix}_${nextId}`;

      console.log(`Generated new order ID: ${finalId}`);
      return finalId;
    } catch (error) {
      console.error("Error generating order ID:", error);

      // Fallback with correct financial year
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;
      const fiscalYearEnd = fiscalYearStart + 1;
      const yearPrefix = `${fiscalYearStart}-${fiscalYearEnd}`;
      const fallbackId = String(Math.floor(Math.random() * 99999)).padStart(
        5,
        "0"
      );

      const finalId = `${yearPrefix}_${fallbackId}`;
      console.log(`Generated fallback ID: ${finalId}`);
      return finalId;
    }
  };
  // Fetch products

  const fetchProducts = async () => {
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Product_Master!A1:E`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        // Convert the 2D array to objects
        const headers = response.data.values[0];
        const rows = response.data.values.slice(1);

        setProductList(
          rows.map((row) => {
            const product = {};
            headers.forEach((header, index) => {
              product[header] = row[index] || "";
            });
            return product;
          })
        );
      }
    } catch (error) {
      console.error("Fetch products error:", error);
      Alert.alert("Error", "Failed to fetch products");
    }
  };

  // Fetch customers by letter
  const fetchCustomers = async (letter) => {
    setIsCustomerLoading(true);
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        const headers = ["Customer CODE", "Customer NAME"];
        const rows = response.data.values.slice(1);

        const customerData = rows
          .filter(
            (row) => row[1] && row[1].trim().toUpperCase().startsWith(letter)
          )
          .map((row) => ({
            "Customer CODE": row[0] || "",
            "Customer NAME": row[1] || "",
          }));

        setCustomers(customerData);
        setFilteredCustomers(customerData);
      }
    } catch (error) {
      console.error("Fetch customers error:", error);
      Alert.alert("Error", "Failed to fetch customers");
    } finally {
      setIsCustomerLoading(false);
    }
  };

  // Format date for order submission
  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12; // Convert 0 to 12
    const formattedHours = String(hours12).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
  };

  // Search customers
  const searchCustomers = async (query) => {
    setCustomerSearchQuery(query);

    if (!query.trim()) {
      setFilteredCustomers([]);
      return;
    }

    setIsCustomerLoading(true);
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:B`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        const headers = ["Customer CODE", "Customer NAME"];
        const rows = response.data.values.slice(1);

        const allCustomers = rows.map((row) => ({
          "Customer CODE": row[0] || "",
          "Customer NAME": row[1] || "",
        }));

        // Filter by query (both name and code)
        const filtered = allCustomers.filter(
          (customer) =>
            customer["Customer NAME"]
              .toLowerCase()
              .includes(query.toLowerCase()) ||
            (customer["Customer CODE"] &&
              customer["Customer CODE"]
                .toLowerCase()
                .includes(query.toLowerCase()))
        );

        setFilteredCustomers(filtered);
      }
    } catch (error) {
      console.error("Search customers error:", error);
    } finally {
      setIsCustomerLoading(false);
    }
  };

  // Replace your searchProducts function
  const searchProducts = async (query) => {
    setProductSearchQuery(query);

    if (!query.trim()) {
      setFilteredProducts([]);
      return;
    }

    try {
      // For better performance, filter the already loaded products
      const filtered = productList.filter(
        (product) =>
          product["Product NAME"].toLowerCase().includes(query.toLowerCase()) ||
          product["Product CODE"].toLowerCase().includes(query.toLowerCase()) ||
          (product["Product Group Name"] &&
            product["Product Group Name"]
              .toLowerCase()
              .includes(query.toLowerCase()))
      );

      setFilteredProducts(filtered);
    } catch (error) {
      console.error("Search products error:", error);
    }
  };

  // Filter products by letter
  const filterProductsByLetter = (letter) => {
    setSelectedProductLetter(letter);
    setProductSearchQuery("");

    const filtered = productList.filter((product) =>
      product["Product NAME"].trim().toUpperCase().startsWith(letter)
    );

    setFilteredProducts(filtered);
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setProductModalVisible(false);

    // Focus quantity input after selecting product
    setTimeout(() => {
      if (quantityInputRef.current) {
        quantityInputRef.current.focus();
      }
    }, 300);
  };

  // Validate quantity
  const validateQuantity = (text) => {
    // Just update the state value directly without validation
    setQuantity(text);

    // Clear any error immediately when typing starts
    if (quantityError) {
      setQuantityError("");
    }
  };
  // Add this new function to handle validation on blur (when input loses focus)
  const validateQuantityOnBlur = () => {
    // Only validate when user has finished typing
    if (!quantity) {
      setQuantityError("Quantity is required");
      return false;
    } else if (isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      setQuantityError("Enter a valid quantity");
      return false;
    } else {
      setQuantityError("");
      return true;
    }
  };

  // Add product to order
  const addProduct = () => {
    if (!selectedProduct) {
      Alert.alert("Error", "Please select a product first");
      return;
    }
    if (!validateQuantityOnBlur()) {
      return;
    }

    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      setQuantityError("Please enter a valid quantity");
      return;
    }

    const numericQuantity = parseFloat(quantity);
    const numericRate = parseFloat(selectedProduct["Rate"]);

    if (isNaN(numericRate)) {
      Alert.alert("Error", "Product has invalid rate");
      return;
    }

    // Calculate amount
    const rawAmount = numericQuantity * numericRate;
    const formattedAmount = formatIndianNumber(rawAmount);

    // Add product to list
    const newProduct = {
      productName: selectedProduct["Product NAME"],
      productCode: selectedProduct["Product CODE"] || "",
      quantity: numericQuantity,
      unit: "Unit",
      rate: numericRate,
      formattedRate: formatIndianNumber(numericRate),
      orderAmount: formattedAmount,
      numericAmount: rawAmount,
    };

    setProducts([...products, newProduct]);

    // Reset fields for next product
    setQuantity("");
    setQuantityError("");

    // Scroll to bottom to show newly added product
    setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 200);
  };

  // Remove product from order
  const removeProduct = (index) => {
    Alert.alert(
      "Remove Product",
      "Are you sure you want to remove this product?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const updatedProducts = [...products];
            updatedProducts.splice(index, 1);
            setProducts(updatedProducts);
          },
        },
      ]
    );
  };

  // Calculate total order amount
  const calculateTotal = () => {
    return products.reduce((sum, product) => sum + product.numericAmount, 0);
  };

  // Calculate total number of items
  const calculateTotalItems = () => {
    return products.reduce((sum, product) => sum + product.quantity, 0);
  };

  // Submit the order
  const submitOrder = async () => {
    if (!customerName) {
      Alert.alert("Error", "Please select a customer");
      return;
    }

    if (products.length === 0) {
      Alert.alert("Error", "Please add at least one product");
      return;
    }

    if (!orderId) {
      Alert.alert("Error", "Invalid order ID");
      return;
    }

    setIsLoading(true);
    try {
      const userRole = await AsyncStorage.getItem("userRole");
      if (!userRole) {
        throw new Error("User not logged in");
      }

      const approvalStatus = userRole === "Manager" ? "Y" : "R"; // If manager is creating order, auto-approve

      const transformedRows = products.map((product) => [
        formatDate(new Date()), // SYS-TIME
        formatDate(orderDate), // ORDER-TIME
        userRole, // USER
        orderComments, // ORDER COMMENTS
        customerName, // CUSTOMER NAME
        orderId, // ORDER ID
        product.productName || "", // PRODUCT NAME
        (product.quantity !== undefined ? product.quantity : "").toString(), // QUANTITY
        product.unit || "", // UNIT
        product.formattedRate || "", // PRODUCT RATE
        product.orderAmount || "", // ORDER AMOUNT
        orderSource, // SOURCE
        approvalStatus, // APPROVED BY MANAGER: Y/N/R
        "", // MANAGER COMMENTS
        "", // ORDER DISPATCHED: Y/N
        "", // DISPATCH COMMENTS
      ]);

      const response = await fetch(
        `${BACKEND_URL}/api/sheets/New_Order_Table`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: transformedRows,
            operation: "append",
          }),
        }
      );

      const responseData = await response.json();

      if (
        responseData &&
        responseData.updates &&
        responseData.updates.updatedRows > 0
      ) {
        // Show success screen and navigate back after delay
        showSuccessScreen(orderId);
      } else {
        throw new Error("Failed to create order");
      }
    } catch (error) {
      console.error("Submit Error:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to submit order. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to generate consistent colors
  const generateRandomColor = (name) => {
    const colors = [
      "#3498db",
      "#e74c3c",
      "#2ecc71",
      "#f39c12",
      "#9b59b6",
      "#1abc9c",
      "#d35400",
      "#c0392b",
    ];

    const charCode = name.charCodeAt(0) || 65;
    return colors[charCode % colors.length];
  };

  // Customer Selection Modal Component
  // Modify your customer selection modal to use direct search
  const renderCustomerSelectionModal = () => {
    return (
      <Modal
        visible={customerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: isDark ? "#222222" : "#ffffff" },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                ]}
              >
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? "#ffffff" : "#000000" },
                  ]}
                >
                  Select Customer
                </Text>
                <TouchableOpacity
                  onPress={() => setCustomerModalVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? "#ffffff" : "#000000"}
                  />
                </TouchableOpacity>
              </View>

              {/* Search bar - autoFocus added */}
              <View
                style={[
                  styles.modalSearchContainer,
                  { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                ]}
              >
                <View
                  style={[
                    styles.modalSearchWrapper,
                    {
                      backgroundColor: isDark ? "#333333" : "#f5f6fa",
                      borderColor: isDark ? "#444444" : "#e0e0e0",
                    },
                  ]}
                >
                  <Ionicons
                    name="search"
                    size={20}
                    color={isDark ? "#999999" : "#666666"}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[
                      styles.modalSearchInput,
                      { color: isDark ? "#ffffff" : "#000000" },
                    ]}
                    placeholder="Search by name or code..."
                    placeholderTextColor={isDark ? "#999999" : "#999999"}
                    value={customerSearchQuery}
                    onChangeText={searchCustomers}
                    autoFocus={true}
                  />
                  {customerSearchQuery ? (
                    <TouchableOpacity
                      onPress={() => setCustomerSearchQuery("")}
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={isDark ? "#999999" : "#666666"}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Remove alphabet groups section */}

              {/* Customer list */}
              {isCustomerLoading ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#3498db" />
                  <Text
                    style={{
                      marginTop: 10,
                      color: isDark ? "#999999" : "#666666",
                    }}
                  >
                    Loading customers...
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredCustomers}
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.customerItem,
                        { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                      ]}
                      onPress={() => {
                        setCustomerName(item["Customer NAME"]);
                        setCustomerModalVisible(false);
                      }}
                    >
                      <View style={styles.customerItemContent}>
                        <View
                          style={[
                            styles.customerAvatarCircle,
                            {
                              backgroundColor: generateRandomColor(
                                item["Customer NAME"]
                              ),
                            },
                          ]}
                        >
                          <Text style={styles.customerInitial}>
                            {item["Customer NAME"].charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.customerItemText,
                              { color: isDark ? "#ffffff" : "#000000" },
                            ]}
                          >
                            {item["Customer NAME"]}
                          </Text>
                          {item["Customer CODE"] && (
                            <Text
                              style={[
                                styles.customerItemCode,
                                { color: isDark ? "#999999" : "#666666" },
                              ]}
                            >
                              ID: {item["Customer CODE"]}
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyListContainer}>
                      <Ionicons
                        name="people"
                        size={40}
                        color={isDark ? "#333333" : "#dddddd"}
                        style={{ marginBottom: 12 }}
                      />
                      <Text
                        style={[
                          styles.emptyListText,
                          { color: isDark ? "#999999" : "#666666" },
                        ]}
                      >
                        {customerSearchQuery
                          ? `No results for "${customerSearchQuery}"`
                          : "Type to search for customers"}
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // Product Selection Modal Component
  // Modify your product selection modal similarly - remove alphabet groups
  const renderProductSelectionModal = () => {
    return (
      <Modal
        visible={productModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProductModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: isDark ? "#222222" : "#ffffff" },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                ]}
              >
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? "#ffffff" : "#000000" },
                  ]}
                >
                  Select Product
                </Text>
                <TouchableOpacity
                  onPress={() => setProductModalVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? "#ffffff" : "#000000"}
                  />
                </TouchableOpacity>
              </View>

              {/* Search bar with autoFocus */}
              <View
                style={[
                  styles.modalSearchContainer,
                  { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                ]}
              >
                <View
                  style={[
                    styles.modalSearchWrapper,
                    {
                      backgroundColor: isDark ? "#333333" : "#f5f6fa",
                      borderColor: isDark ? "#444444" : "#e0e0e0",
                    },
                  ]}
                >
                  <Ionicons
                    name="search"
                    size={20}
                    color={isDark ? "#999999" : "#666666"}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[
                      styles.modalSearchInput,
                      { color: isDark ? "#ffffff" : "#000000" },
                    ]}
                    placeholder="Search by name, code or category..."
                    placeholderTextColor={isDark ? "#999999" : "#999999"}
                    value={productSearchQuery}
                    onChangeText={searchProducts}
                    autoFocus={true}
                  />
                  {productSearchQuery ? (
                    <TouchableOpacity onPress={() => setProductSearchQuery("")}>
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={isDark ? "#999999" : "#666666"}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Remove alphabet groups section */}

              {/* Products list - keep this part as is */}
              <FlatList
                data={filteredProducts}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.productModalItem,
                      { borderBottomColor: isDark ? "#333333" : "#eeeeee" },
                    ]}
                    onPress={() => handleProductSelect(item)}
                  >
                    <View style={styles.productModalIconContainer}>
                      <View
                        style={[
                          styles.productModalIcon,
                          {
                            backgroundColor: getProductCategoryColor(
                              item["Product GROUP CODE"]
                            ),
                          },
                        ]}
                      >
                        <Ionicons name="cube" size={18} color="#fff" />
                      </View>
                    </View>
                    <View style={styles.productModalContent}>
                      <Text
                        style={[
                          styles.productModalName,
                          { color: isDark ? "#ffffff" : "#333333" },
                          { fontSize: 14 }, // Reduce from 16 to 14
                        ]}
                        numberOfLines={2} // Allow up to 2 lines
                      >
                        {item["Product NAME"]}
                      </Text>
                      <View style={styles.productModalMeta}>
                        <Text
                          style={[
                            styles.productModalCode,
                            { color: isDark ? "#999999" : "#666666" },
                          ]}
                        >
                          {item["Product CODE"]}
                        </Text>
                        {item["Product Group Name"] && (
                          <Text style={styles.productModalCategory}>
                            • {item["Product Group Name"]}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.productPriceContainer}>
                      <Text style={styles.productModalPrice}>
                        ₹{formatIndianNumber(parseFloat(item["Rate"]))}
                      </Text>
                      <Ionicons
                        name="add-circle"
                        size={20}
                        color="#3498db"
                        style={{ marginLeft: 6 }}
                      />
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyListContainer}>
                    <Ionicons
                      name="cube"
                      size={40}
                      color={isDark ? "#333333" : "#dddddd"}
                      style={{ marginBottom: 12 }}
                    />
                    <Text
                      style={[
                        styles.emptyListText,
                        { color: isDark ? "#999999" : "#666666" },
                      ]}
                    >
                      {productSearchQuery
                        ? `No products found matching "${productSearchQuery}"`
                        : "Type to search for products"}
                    </Text>
                  </View>
                }
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#1a1a1a" : "#f4f4f8" },
      ]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: isDark ? "#222222" : "#3498db" },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>New Sales Order</Text>
          <Text style={styles.orderId}>
            {isOrderIdLoading ? "Generating..." : orderId}
          </Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={20}
            color="#ffffff"
          />
        </TouchableOpacity>
      </View>
      {/* Main content */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Selection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
            >
              Customer Information
            </Text>
            <TouchableOpacity onPress={() => setCustomerModalVisible(true)}>
              <Ionicons
                name="chevron-up"
                size={20}
                color={isDark ? "#ffffff" : "#000000"}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.selectionButton,
              {
                backgroundColor: isDark ? "#333333" : "#ffffff",
                borderColor: isDark ? "#444444" : "#e0e0e0",
              },
              !customerName && { borderStyle: "dashed" },
            ]}
            onPress={() => setCustomerModalVisible(true)}
          >
            {customerName ? (
              <View style={styles.selectedCustomerContainer}>
                <View
                  style={[
                    styles.customerAvatar,
                    { backgroundColor: generateRandomColor(customerName) },
                  ]}
                >
                  <Text style={styles.customerAvatarText}>
                    {customerName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.selectedText,
                    { color: isDark ? "#ffffff" : "#000000" },
                  ]}
                >
                  {customerName}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.placeholderText,
                  { color: isDark ? "#999999" : "#999999" },
                ]}
              >
                Select Customer
              </Text>
            )}
            <Ionicons
              name="chevron-down"
              size={20}
              color={isDark ? "#999999" : "#666666"}
            />
          </TouchableOpacity>
        </View>
        {/* Product Selection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
            >
              Product Selection
            </Text>
            <TouchableOpacity onPress={() => setProductModalVisible(true)}>
              <Ionicons
                name="chevron-up"
                size={20}
                color={isDark ? "#ffffff" : "#000000"}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.selectionButton,
              {
                backgroundColor: isDark ? "#333333" : "#ffffff",
                borderColor: isDark ? "#444444" : "#e0e0e0",
              },
              !selectedProduct && { borderStyle: "dashed" },
            ]}
            onPress={() => setProductModalVisible(true)}
          >
            {selectedProduct ? (
              <Text
                style={[
                  styles.selectedText,
                  { color: isDark ? "#ffffff" : "#000000" },
                ]}
              >
                {selectedProduct["Product NAME"]}
              </Text>
            ) : (
              <Text
                style={[
                  styles.placeholderText,
                  { color: isDark ? "#999999" : "#999999" },
                ]}
              >
                Select Product
              </Text>
            )}
            <Ionicons
              name="chevron-down"
              size={20}
              color={isDark ? "#999999" : "#666666"}
            />
          </TouchableOpacity>

          {/* Quantity input field - only shown when product is selected */}
          {selectedProduct && (
            <View style={styles.quantityContainer}>
              <TextInput
                ref={quantityInputRef}
                style={[
                  styles.quantityInput,
                  {
                    backgroundColor: isDark ? "#333333" : "#ffffff",
                    borderColor: isDark ? "#444444" : "#e0e0e0",
                    color: isDark ? "#ffffff" : "#000000",
                  },
                  quantityError && { borderColor: "#ff4444" },
                ]}
                placeholder="Enter Quantity"
                placeholderTextColor={isDark ? "#999999" : "#999999"}
                value={quantity}
                onChangeText={validateQuantity}
                onBlur={validateQuantityOnBlur} // Add this line to validate on blur
                inputMode="numeric"
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[
                  styles.addButton,
                  { backgroundColor: "#3498db" },
                  (!quantity || quantityError) && { opacity: 0.5 },
                ]}
                onPress={addProduct}
                disabled={!quantity || !!quantityError}
              >
                <Ionicons name="add" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}

          {quantityError && (
            <Text style={styles.errorText}>{quantityError}</Text>
          )}
        </View>
        {/* Cart Icon for No Products */}
        {products.length === 0 && (
          <View style={styles.emptyCartContainer}>
            <Ionicons
              name="cart-outline"
              size={80}
              color={isDark ? "#333333" : "#dddddd"}
            />
            <Text
              style={[
                styles.emptyCartText,
                { color: isDark ? "#999999" : "#666666" },
              ]}
            >
              No products added yet
            </Text>
            <Text
              style={[
                styles.emptyCartSubtext,
                { color: isDark ? "#999999" : "#999999" },
              ]}
            >
              Select a product and add quantity to build your order
            </Text>
          </View>
        )}
        {/* Added Products */}
        {products.length > 0 && (
          <View style={styles.productsContainer}>
            {products.map((product, index) => (
              <Animated.View
                key={index}
                entering={SlideInRight.duration(300).delay(index * 50)}
                exiting={SlideOutLeft.duration(200)}
                style={[
                  styles.productItem,
                  {
                    backgroundColor: isDark ? "#333333" : "#ffffff",
                    borderColor: isDark ? "#444444" : "#e0e0e0",
                  },
                ]}
              >
                <View style={styles.productHeader}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flex: 1,
                    }}
                  >
                    <View
                      style={[
                        styles.productColorDot,
                        {
                          backgroundColor: generateRandomColor(
                            product.productName
                          ),
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.productName,
                        { color: isDark ? "#ffffff" : "#000000" },
                        { fontSize: 14 }, // Reduce font size from 16 to 14
                      ]}
                      numberOfLines={2} // Allow up to 2 lines instead of 1
                    >
                      {product.productName}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeProduct(index)}
                  >
                    <Ionicons name="close-circle" size={22} color="#ff4444" />
                  </TouchableOpacity>
                </View>
                <View style={styles.productDetails}>
                  <View>
                    <Text
                      style={[
                        styles.productDetailText,
                        { color: isDark ? "#cccccc" : "#666666" },
                      ]}
                    >
                      {product.quantity} {product.unit} × ₹
                      {product.formattedRate}
                    </Text>
                    {product.productCode && (
                      <Text
                        style={[
                          styles.productCodeText,
                          { color: isDark ? "#999999" : "#888888" },
                        ]}
                      >
                        Code: {product.productCode}
                      </Text>
                    )}
                  </View>

                  <Text style={[styles.productAmount, { color: "#3498db" }]}>
                    ₹{product.orderAmount}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
        {/* Order Source Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
            >
              Order Source
            </Text>
            <Ionicons
              name="chevron-up"
              size={20}
              color={isDark ? "#ffffff" : "#000000"}
            />
          </View>

          <View style={styles.sourceButtonsContainer}>
            {["Phone", "Email", "WhatsApp"].map((source) => (
              <TouchableOpacity
                key={source}
                style={[
                  styles.sourceButton,
                  {
                    backgroundColor: isDark ? "#333333" : "#ffffff",
                    borderColor: isDark ? "#444444" : "#e0e0e0",
                  },
                  orderSource === source && {
                    backgroundColor: "#3498db",
                    borderColor: "#3498db",
                  },
                ]}
                onPress={() => setOrderSource(source)}
              >
                <Ionicons
                  name={
                    source === "Email"
                      ? "mail"
                      : source === "Phone"
                      ? "call"
                      : "logo-whatsapp"
                  }
                  size={20}
                  color={
                    orderSource === source
                      ? "#ffffff"
                      : isDark
                      ? "#999999"
                      : "#666666"
                  }
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.sourceText,
                    {
                      color: isDark ? "#999999" : "#666666",
                    },
                    orderSource === source && {
                      color: "#ffffff",
                      fontWeight: "500",
                    },
                  ]}
                >
                  {source}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* Date/Time Selection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
            >
              Order Date & Time
            </Text>
            <TouchableOpacity
              style={[
                styles.dateToggleButton,
                {
                  backgroundColor: isCustomDate
                    ? isDark
                      ? "rgba(52, 152, 219, 0.2)"
                      : "rgba(52, 152, 219, 0.1)"
                    : "transparent",
                },
              ]}
              onPress={() => {
                setIsCustomDate(!isCustomDate);
                if (!isCustomDate) {
                  updateDateTimeText(new Date());
                  setOrderDate(new Date());
                }
              }}
            >
              <Ionicons
                name={isCustomDate ? "time" : "time-outline"}
                size={16}
                color="#3498db"
                style={{ marginRight: 5 }}
              />
              <Text
                style={{ color: "#3498db", fontWeight: "500", fontSize: 14 }}
              >
                {isCustomDate ? "Custom Time" : "Use Current Time"}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.dateTimeContainer,
              {
                backgroundColor: isDark ? "#333333" : "#ffffff",
                borderColor: isDark ? "#444444" : "#e0e0e0",
              },
            ]}
          >
            {isCustomDate ? (
              <View>
                {/* Date input field with auto-formatting */}
                <View style={styles.dateTimeRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={isDark ? "#999999" : "#666666"}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[
                      styles.dateTimeInput,
                      {
                        color: isDark ? "#ffffff" : "#000000",
                        borderBottomColor: "#3498db",
                        borderBottomWidth: 1,
                      },
                    ]}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={isDark ? "#999999" : "#999999"}
                    value={dateText}
                    onChangeText={handleDateInputChange}
                    onBlur={() => {
                      if (dateText && !validateDateInput(dateText)) {
                        setDateError("Usage: DD/MM/YYYY");
                      } else {
                        handleDateTimeChange();
                      }
                    }}
                    inputMode="numeric"
                  />
                  <TouchableOpacity
                    onPress={() => setDatePickerVisible(true)}
                    style={styles.timePickerButton}
                  >
                    <Ionicons name="calendar" size={20} color="#3498db" />
                  </TouchableOpacity>
                </View>

                {/* Time input field with AM/PM buttons */}
                <View style={styles.dateTimeRow}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={isDark ? "#999999" : "#666666"}
                    style={{ marginRight: 8 }}
                  />
                  <View style={styles.timeInputWithButtons}>
                    <TextInput
                      style={[
                        styles.dateTimeInput,
                        {
                          color: isDark ? "#ffffff" : "#000000",
                          borderBottomColor: "#3498db",
                          borderBottomWidth: 1,
                        },
                      ]}
                      placeholder="HH:MM"
                      placeholderTextColor={isDark ? "#999999" : "#999999"}
                      value={timeText.split(" ")[0]} // Only show HH:MM part in the input
                      onChangeText={(text) => {
                        // Format time without the AM/PM part
                        const formattedTime = formatTimeInput(text);
                        // Keep the AM/PM part from the current timeText
                        const period = timeText.includes("PM") ? "PM" : "AM";
                        setTimeText(`${formattedTime} ${period}`);
                        setDateError("");
                      }}
                      onBlur={() => {
                        if (timeText && !validateTimeInput(timeText)) {
                          setDateError("Usage: HH:MM with AM/PM");
                        } else {
                          handleDateTimeChange();
                        }
                      }}
                      inputMode="numeric"
                    />

                    <View style={styles.amPmButtons}>
                      <TouchableOpacity
                        style={[
                          styles.periodButton,
                          timeText.includes("AM") && styles.activePeriodButton,
                        ]}
                        onPress={() => {
                          const timePart = timeText.split(" ")[0];
                          setTimeText(`${timePart} AM`);
                          handleDateTimeChange();
                        }}
                      >
                        <Text
                          style={[
                            styles.periodButtonText,
                            timeText.includes("AM") && styles.activePeriodText,
                          ]}
                        >
                          AM
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.periodButton,
                          timeText.includes("PM") && styles.activePeriodButton,
                        ]}
                        onPress={() => {
                          const timePart = timeText.split(" ")[0];
                          setTimeText(`${timePart} PM`);
                          handleDateTimeChange();
                        }}
                      >
                        <Text
                          style={[
                            styles.periodButtonText,
                            timeText.includes("PM") && styles.activePeriodText,
                          ]}
                        >
                          PM
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => setTimePickerVisible(true)}
                      style={styles.timePickerButton}
                    >
                      <Ionicons name="time" size={20} color="#3498db" />
                    </TouchableOpacity>
                  </View>
                </View>

                {dateError ? (
                  <Text style={styles.dateTimeError}>{dateError}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.dateTimeRow}>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={isDark ? "#999999" : "#666666"}
                />
                <Text
                  style={[
                    styles.dateTimeText,
                    { color: isDark ? "#ffffff" : "#000000" },
                  ]}
                >
                  Current Time
                </Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    updateDateTimeText(new Date());
                    setOrderDate(new Date());
                    setIsCustomDate(true);
                  }}
                >
                  <Text
                    style={[styles.datePickerButtonText, { color: "#3498db" }]}
                  >
                    Set Custom Time
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Date Picker Modal */}
          <DatePickerModal
            locale="en"
            mode="single"
            visible={datePickerVisible}
            onDismiss={onDismissDatePicker}
            date={orderDate}
            onConfirm={onConfirmDatePicker}
            saveLabel="Confirm"
            uppercase={false}
            animationType="slide"
            presentationStyle="pageSheet"
          />

          {/* Time Picker Modal */}
          <TimePickerModal
            visible={timePickerVisible}
            onDismiss={onDismissTimePicker}
            onConfirm={onConfirmTimePicker}
            hours={orderDate.getHours()}
            minutes={orderDate.getMinutes()}
            locale="en"
            label="Select time"
            uppercase={false}
            cancelLabel="Cancel"
            confirmLabel="Confirm"
            animationType="slide"
          />
        </View>
        {/* Order Comments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
            >
              Order Comments
            </Text>
            <Ionicons
              name="chatbox-outline"
              size={20}
              color={isDark ? "#ffffff" : "#000000"}
            />
          </View>

          <View
            style={[
              styles.commentsContainer,
              {
                backgroundColor: isDark ? "#333333" : "#ffffff",
                borderColor: isDark ? "#444444" : "#e0e0e0",
              },
            ]}
          >
            <TextInput
              style={[
                styles.commentsInput,
                { color: isDark ? "#ffffff" : "#000000" },
              ]}
              placeholder="Add notes about this order (optional)"
              placeholderTextColor={isDark ? "#999999" : "#999999"}
              value={orderComments}
              onChangeText={setOrderComments}
              multiline={true}
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
        {/* Order Summary (Only shown if products added) */}
        {products.length > 0 && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={[
              styles.summaryContainer,
              {
                backgroundColor: isDark ? "#2c3e50" : "#f8f9fa",
                borderColor: isDark ? "#34495e" : "#e9ecef",
              },
            ]}
          >
            <View style={styles.summaryHeader}>
              <Ionicons name="receipt-outline" size={20} color="#3498db" />
              <Text
                style={[
                  styles.summaryHeaderText,
                  { color: isDark ? "#fff" : "#2c3e50" },
                ]}
              >
                Order Summary
              </Text>
            </View>

            <View style={styles.summaryItemsContainer}>
              <View style={styles.summaryRow}>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: isDark ? "#bdc3c7" : "#6c757d" },
                  ]}
                >
                  Products
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{products.length}</Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: isDark ? "#bdc3c7" : "#6c757d" },
                  ]}
                >
                  Total Items
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {calculateTotalItems()}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.divider,
                  { backgroundColor: isDark ? "#34495e" : "#e9ecef" },
                ]}
              />

              <View style={styles.totalRow}>
                <Text
                  style={[
                    styles.totalLabel,
                    { color: isDark ? "#ecf0f1" : "#2c3e50" },
                  ]}
                >
                  Total Amount
                </Text>
                <Text style={styles.totalValue}>
                  ₹{formatIndianNumber(calculateTotal())}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}
        {/* Extra padding for button */}
        <View style={{ height: 100 }} />
      </ScrollView>
      {/* Submit Button */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: isDark
              ? "rgba(34, 34, 34, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
            borderTopColor: isDark ? "#333333" : "#eeeeee",
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor:
                !customerName || products.length === 0 || isLoading
                  ? isDark
                    ? "#555"
                    : "#ccc"
                  : "#2ecc71",
              elevation: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
            },
          ]}
          onPress={submitOrder}
          disabled={!customerName || products.length === 0 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color="#ffffff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.submitButtonText}>
                {products.length > 0
                  ? `Submit Order (₹${formatIndianNumber(calculateTotal())})`
                  : "Submit Order"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      {/* Customer Selection Modal */}
      {renderCustomerSelectionModal()}
      {/* Product Selection Modal */}
      {renderProductSelectionModal()}
      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      )}

      {orderSuccess && (
        <View style={styles.successOverlay}>
          <Animated.View
            entering={FadeIn.duration(400)}
            style={[
              styles.successCard,
              { backgroundColor: isDark ? "#222222" : "#ffffff" },
            ]}
          >
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#2ecc71" />
            </View>
            <Text
              style={[
                styles.successTitle,
                { color: isDark ? "#ffffff" : "#333333" },
              ]}
            >
              Order Submitted!
            </Text>
            <Text style={styles.successOrderId}>Order #{orderId}</Text>
            <Text
              style={[
                styles.successMessage,
                { color: isDark ? "#bbbbbb" : "#666666" },
              ]}
            >
              Your order has been successfully submitted
            </Text>
            <ActivityIndicator
              style={{ marginTop: 20 }}
              color="#3498db"
              size="small"
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 16,
  },
  headerTitleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  orderId: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  selectionButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  selectedCustomerContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  customerAvatarText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  selectedText: {
    fontSize: 16,
    flex: 1,
  },
  placeholderText: {
    fontSize: 16,
  },
  quantityContainer: {
    flexDirection: "row",
    marginTop: 8,
  },
  quantityInput: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    marginRight: 10,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    marginTop: 4,
    marginLeft: 4,
    fontSize: 14,
    color: "#ff4444",
  },
  emptyCartContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyCartText: {
    fontSize: 18,
    fontWeight: "500",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyCartSubtext: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: "70%",
  },
  productsContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  productItem: {
    borderRadius: 10,
    padding: 14, // Slightly reduced padding
    marginBottom: 12,
    borderWidth: 1,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start", // Changed from center to allow text to expand
    marginBottom: 6, // Reduced from 8
  },
  productName: {
    fontSize: 14, // Reduced from 16
    fontWeight: "500",
    flex: 1,
    marginRight: 4, // Add margin to keep space from remove button
  },
  removeButton: {
    padding: 4,
  },
  productDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productDetailText: {
    fontSize: 14,
  },
  productAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  sourceButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sourceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    maxWidth: "31%",
  },
  sourceText: {
    fontSize: 14,
    fontWeight: "500",
  },
  summaryContainer: {
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "500",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3498db",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: "row",
    height: 54,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxHeight: "80%",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  modalSearchContainer: {
    padding: 12,
    borderBottomWidth: 1,
  },
  modalSearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    padding: 4,
  },
  alphabetGroupContainer: {
    padding: 8,
  },
  alphabetGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 8,
  },
  letterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    margin: 4,
  },
  letterText: {
    fontSize: 15,
    fontWeight: "500",
  },
  loaderContainer: {
    padding: 24,
    alignItems: "center",
  },
  customerItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  customerItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  customerItemText: {
    fontSize: 16,
  },
  customerItemCode: {
    fontSize: 13,
    marginTop: 2,
  },
  customerAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  customerInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  emptyListContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: 15,
    textAlign: "center",
  },
  productModalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  productModalContent: {
    flex: 1,
    marginRight: 8,
  },
  productModalName: {
    fontSize: 14, // Reduced from 16
    fontWeight: "500",
    marginBottom: 2,
    flexWrap: "wrap", // Allow text to wrap
    flex: 1, // Take available space
  },
  productModalCode: {
    fontSize: 13,
  },
  productModalPrice: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3498db",
  },
  // Add these to your styles object
  progressContainer: {
    marginBottom: 20,
    marginTop: 10,
    paddingHorizontal: 10,
  },
  progressSteps: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressStep: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  progressLine: {
    height: 3,
    flex: 1,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 12,
    width: 80,
    textAlign: "center",
  },
  productColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  productCodeText: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryHeaderText: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
  },
  summaryItemsContainer: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 12,
  },
  countBadge: {
    backgroundColor: "#3498db",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  productModalIconContainer: {
    marginRight: 12,
  },
  productModalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  productModalMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  productModalCategory: {
    fontSize: 13,
    color: "#888",
    marginLeft: 4,
  },
  productPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  successCard: {
    // backgroundColor: isDark ? "#222222" : "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "80%",
    maxWidth: 320,
  },
  successIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(46, 204, 113, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    // color: isDark ? "#ffffff" : "#333333",
    marginBottom: 8,
  },
  successOrderId: {
    fontSize: 16,
    color: "#3498db",
    marginBottom: 8,
    fontWeight: "600",
  },
  successMessage: {
    fontSize: 16,
    // color: isDark ? "#bbbbbb" : "#666666",
    textAlign: "center",
  },
  // Add to your existing styles object
  dateTimeContainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    // backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)",
  },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dateTimeText: {
    fontSize: 15,
    marginLeft: 10,
    flex: 1,
    paddingVertical: 8,
  },
  datePickerButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  datePickerButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  commentsContainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 16,
  },
  commentsInput: {
    height: 80,
    fontSize: 15,
    padding: 8,
  },
  // In your styles object
  //
  dateTimeInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  dateTimeError: {
    color: "#ff4444",
    fontSize: 14,
    marginTop: 4,
    marginLeft: 30,
  },
  dateTimeHint: {
    fontSize: 12,
    color: "#999999",
    marginTop: 8,
    marginLeft: 30,
    fontStyle: "italic",
  },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
  },
  datePickerInput: {
    flex: 1,
    backgroundColor: "transparent",
  },
  dateFormatHelper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 10,
  },
  dateFormatText: {
    fontSize: 12,
    marginLeft: 4,
    fontStyle: "italic",
  },
  timeInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
    overflow: "hidden",
  },
  timeInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  timePickerButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  // Add these to your styles object
  timeInputWithButtons: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  amPmButtons: {
    flexDirection: "row",
    marginLeft: 8,
  },
  periodButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ddd",
    marginHorizontal: 2,
  },
  activePeriodButton: {
    backgroundColor: "#3498db",
    borderColor: "#3498db",
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  activePeriodText: {
    color: "#fff",
  },
});

export default NewSalesOrderScreen;
