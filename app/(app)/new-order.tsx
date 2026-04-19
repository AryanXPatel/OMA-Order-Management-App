import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
  useMemo,
} from "react";
import Animated, {
  FadeIn,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { BACKEND_URL, fetchWithRetry } from "@/utils/apiManager";
import { serializeOrderLineForSheet } from "@/utils/orderSheetSerializer";
import {
  TimePickerModal,
  DatePickerModal,
  registerTranslation,
} from "react-native-paper-dates";
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
import { ThemeContext } from "@/context/ThemeContext";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import NetInfo from "@react-native-community/netinfo";
import { omaTypography } from "@/utils/typography";
registerTranslation("en", {}); // English locale

const NewSalesOrderScreen = () => {
  const { colors, isDark } = useContext(ThemeContext);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Core state
  const [isLoading, setIsLoading] = useState(false);
  const [orderSource, setOrderSource] = useState("Phone");
  const [orderId, setOrderId] = useState("");
  const [isOrderIdLoading, setIsOrderIdLoading] = useState(true);

  // Customer state
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");
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

  useEffect(() => {
    if (scrollViewRef.current?.scrollTo) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [step]);

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
    } catch {
      setDateError(
        "Please use format DD/MM/YYYY for date and HH:MM AM/PM for time"
      );
      return false;
    }
  };

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
  const generateOrderId = useCallback(async () => {
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
  }, []);

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
  }, [generateOrderId]);

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
            } catch {
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
        const rows = response.data.values.slice(1);

        const customerData = rows
          .filter(
            (row) => row[1] && row[1].trim().toUpperCase().startsWith(letter)
          )
          .map((row) => ({
            "Customer CODE": row[0] || "",
            "Customer NAME": row[1] || "",
          }));

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
      productGroup:
        selectedProduct["Product Group Name"] ||
        selectedProduct["Category"] ||
        "",
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

      const currentTimestamp = new Date();
      const sysTime = formatDate(currentTimestamp);
      const orderTime = formatDate(orderDate);
      const createdAtIso = currentTimestamp.toISOString();

      const transformedRows = products.map((product, index) =>
        serializeOrderLineForSheet({
          sysTime,
          orderTime,
          user: userRole,
          orderComments,
          customerName,
          orderId,
          productName: product.productName || "",
          quantity:
            product.quantity !== undefined ? String(product.quantity) : "",
          unit: product.unit || "",
          productRate: product.formattedRate || "",
          orderAmount: product.orderAmount || "",
          source: orderSource,
          approvalStatus,
          managerComments: "",
          dispatchStatus: "",
          dispatchComments: "",
          dispatchTime: "",
          createdAtIso,
          customerCode: selectedCustomerCode,
          productCode: product.productCode || "",
          productGroup: product.productGroup || "",
          lineSequence: index,
        })
      );

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
    const palette = [
      colors.primary,
      colors.accentOrange,
      colors.accentGreen,
      colors.accentPurple,
      colors.accentRed,
      "#14b8a6",
      "#0f766e",
      "#2563eb",
    ];

    const charCode = name?.charCodeAt(0) || 65;
    return palette[charCode % palette.length];
  };

  const isWideLayout = Dimensions.get("window").width >= 420;
  const headerTopPadding =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 18;
  const totalAmount = calculateTotal();
  const totalItems = calculateTotalItems();
  const canAdvanceToProducts = Boolean(customerName);
  const canAdvanceToReview = products.length > 0;
  const canSubmitOrder = Boolean(customerName && products.length > 0) && !isLoading;
  const customerInitials = customerName
    ? customerName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "NA";
  const currentTitle =
    step === 1 ? "New Order" : step === 2 ? "Build Order" : "Review & Submit";
  const currentSubtitle =
    step === 1
      ? "Choose the customer account before building the line items."
      : step === 2
      ? customerName || "Add products from the live OMA catalog."
      : "Check fulfillment details and confirm the dispatch-ready draft.";

  const openCustomerPicker = () => {
    setCustomerModalVisible(true);

    if (customerSearchQuery.trim()) {
      searchCustomers(customerSearchQuery);
      return;
    }

    const nextLetter =
      selectedLetter || customerName.trim().charAt(0).toUpperCase() || "A";
    setSelectedLetter(nextLetter);
    fetchCustomers(nextLetter);
  };

  const openProductPicker = () => {
    setProductModalVisible(true);

    if (productSearchQuery.trim()) {
      searchProducts(productSearchQuery);
      return;
    }

    const nextLetter =
      selectedProductLetter ||
      selectedProduct?.["Product NAME"]?.trim().charAt(0).toUpperCase() ||
      "A";

    filterProductsByLetter(nextLetter);
  };

  const handleCustomerSelection = (customer) => {
    setCustomerName(customer["Customer NAME"]);
    setSelectedCustomerCode(customer["Customer CODE"] || "");
    setCustomerModalVisible(false);
    setCustomerSearchQuery("");
    setTimeout(() => setStep(2), 180);
  };

  const handleQuantityStep = (delta) => {
    const parsed = parseFloat(quantity);
    const current = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(current + delta, 0);

    setQuantity(next === 0 ? "" : `${next}`);
    if (quantityError) {
      setQuantityError("");
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 280,
          backgroundColor: isDark
            ? "rgba(0,102,255,0.14)"
            : "rgba(15, 23, 42, 0.05)",
        },
        contentContainer: {
          paddingHorizontal: 16,
          paddingBottom: 172,
        },
        headerShell: {
          paddingTop: headerTopPadding,
          paddingBottom: 8,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 18,
        },
        iconButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 22,
          elevation: 8,
        },
        headerCopy: {
          flex: 1,
        },
        headerEyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        headerTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 25,
          letterSpacing: -0.9,
        },
        headerSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 4,
        },
        orderIdPill: {
          minWidth: 88,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: 20,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "flex-end",
        },
        orderIdLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        orderIdValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 12,
        },
        progressShell: {
          marginBottom: 18,
        },
        progressRow: {
          flexDirection: "row",
          gap: 8,
          marginBottom: 12,
        },
        progressTrack: {
          flex: 1,
          height: 6,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        progressTrackActive: {
          backgroundColor: isDark ? colors.text : "#111111",
        },
        progressMetaRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 10,
        },
        progressMetaItem: {
          flex: 1,
          paddingHorizontal: 2,
        },
        progressMetaStep: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        progressMetaLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        progressMetaActiveText: {
          color: colors.text,
        },
        heroCard: {
          backgroundColor: colors.card,
          borderRadius: 30,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
          marginBottom: 20,
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 9,
        },
        heroGlow: {
          position: "absolute",
          top: -44,
          right: -24,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: isDark
            ? "rgba(192,132,252,0.18)"
            : "rgba(17,17,17,0.05)",
        },
        heroEyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        heroTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          lineHeight: 30,
          letterSpacing: -0.8,
          marginBottom: 8,
          paddingRight: 24,
        },
        heroBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          marginBottom: 18,
        },
        heroStatsRow: {
          flexDirection: "row",
          gap: 10,
          flexWrap: "wrap",
        },
        heroStatCard: {
          flex: 1,
          minWidth: isWideLayout ? "31%" : "47%",
          borderRadius: 20,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        heroStatLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 6,
        },
        heroStatValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 17,
          letterSpacing: -0.5,
        },
        sectionBlock: {
          marginBottom: 14,
        },
        sectionEyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        sectionHeading: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 21,
          letterSpacing: -0.7,
          marginBottom: 8,
        },
        sectionBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
        },
        pickerCard: {
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
        },
        pickerIconWrap: {
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        pickerCopy: {
          flex: 1,
        },
        pickerLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        pickerValue: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          lineHeight: 20,
        },
        pickerPlaceholder: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 15,
        },
        pickerHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginTop: 5,
        },
        customerSpotlight: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
        },
        customerSpotlightTop: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
        },
        customerAvatar: {
          width: 54,
          height: 54,
          borderRadius: 27,
          alignItems: "center",
          justifyContent: "center",
        },
        customerAvatarText: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
        },
        customerName: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 17,
          marginBottom: 4,
        },
        customerCode: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        statusChip: {
          marginLeft: "auto",
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        statusChipText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        helperCard: {
          borderRadius: 24,
          padding: 18,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        helperTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          marginBottom: 8,
        },
        helperBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
        },
        helperRow: {
          flexDirection: "row",
          gap: 10,
          marginTop: 16,
        },
        helperMetric: {
          flex: 1,
          borderRadius: 18,
          padding: 12,
          backgroundColor: colors.card,
        },
        helperMetricValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
          marginBottom: 4,
        },
        helperMetricLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
        },
        composerCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 8,
        },
        fieldLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        productPreviewCard: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          borderRadius: 22,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 14,
        },
        productPreviewMeta: {
          flex: 1,
          paddingRight: 12,
        },
        productPreviewTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          lineHeight: 20,
          marginBottom: 4,
        },
        productPreviewCode: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 18,
        },
        productPreviewRate: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
        },
        quantityShell: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        },
        quantityStepper: {
          width: 44,
          height: 44,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        quantityStepperPrimary: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        quantityInputShell: {
          flex: 1,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: quantityError ? colors.error : colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          paddingHorizontal: 16,
          paddingVertical: 4,
        },
        quantityInput: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          paddingVertical: 10,
          textAlign: "center",
        },
        quantityError: {
          color: colors.error,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginBottom: 10,
        },
        addLineButton: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderRadius: 20,
          paddingVertical: 15,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        addLineButtonDisabled: {
          opacity: 0.45,
        },
        addLineButtonText: {
          color: isDark ? colors.background : "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        listHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        },
        listHeaderText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
        },
        listHeaderPill: {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        listHeaderPillText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        emptyStateCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 36,
          paddingHorizontal: 22,
          alignItems: "center",
          marginBottom: 14,
        },
        emptyStateIconWrap: {
          width: 70,
          height: 70,
          borderRadius: 35,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 16,
        },
        emptyStateTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 18,
          marginBottom: 8,
        },
        emptyStateBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
          textAlign: "center",
        },
        lineItemCard: {
          backgroundColor: colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          marginBottom: 12,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 7,
        },
        lineItemTopRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        },
        lineItemIdentity: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          flex: 1,
        },
        lineItemDot: {
          width: 12,
          height: 12,
          borderRadius: 6,
          marginTop: 4,
        },
        lineItemTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 14,
          lineHeight: 20,
          marginBottom: 4,
        },
        lineItemMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        lineItemRemoveButton: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        lineItemBottomRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        lineItemAmount: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
        },
        reviewCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          marginBottom: 14,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 1,
          shadowRadius: 28,
          elevation: 8,
        },
        reviewCardHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 10,
        },
        reviewCardTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
        },
        reviewActionLink: {
          color: colors.primary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        sourceButtonsRow: {
          flexDirection: "row",
          gap: 8,
          marginBottom: 16,
        },
        sourceButton: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
        },
        sourceButtonActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        sourceText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        sourceTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        dateModeRow: {
          flexDirection: "row",
          gap: 8,
          marginBottom: 14,
        },
        dateModeChip: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        dateModeChipActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        dateModeChipText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        dateModeChipTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        deliveryGrid: {
          gap: 12,
        },
        deliveryCard: {
          borderRadius: 20,
          padding: 14,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        inlineInputRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        inlineInputIcon: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
        },
        inlineInput: {
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          paddingVertical: 10,
        },
        pickerIconButton: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
        },
        amPmButtons: {
          flexDirection: "row",
          gap: 6,
        },
        periodButton: {
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        activePeriodButton: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        periodButtonText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        activePeriodText: {
          color: isDark ? colors.background : "#ffffff",
        },
        dateTimeError: {
          color: colors.error,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginTop: 10,
        },
        notesCard: {
          backgroundColor: colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          marginBottom: 14,
        },
        notesInput: {
          minHeight: 112,
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          lineHeight: 20,
          padding: 8,
        },
        summaryDarkCard: {
          backgroundColor: isDark ? colors.surfaceVariant : "#111111",
          borderRadius: 30,
          padding: 20,
          overflow: "hidden",
          marginBottom: 12,
        },
        summaryDarkGlow: {
          position: "absolute",
          top: -34,
          right: -18,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        summaryDarkLabel: {
          color: "rgba(255,255,255,0.68)",
          fontFamily: omaTypography.semibold,
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        summaryDarkValue: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 32,
          letterSpacing: -1.1,
          marginBottom: 8,
        },
        summaryDarkBody: {
          color: "rgba(255,255,255,0.72)",
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          marginBottom: 18,
          paddingRight: 16,
        },
        summaryDarkRow: {
          flexDirection: "row",
          gap: 10,
        },
        summaryDarkMetric: {
          flex: 1,
          borderRadius: 18,
          padding: 12,
          backgroundColor: "rgba(255,255,255,0.08)",
        },
        summaryDarkMetricLabel: {
          color: "rgba(255,255,255,0.6)",
          fontFamily: omaTypography.medium,
          fontSize: 10,
          marginBottom: 4,
          textTransform: "uppercase",
        },
        summaryDarkMetricValue: {
          color: "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        bottomBar: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 18,
          backgroundColor: isDark
            ? "rgba(9,17,31,0.96)"
            : "rgba(247,248,249,0.94)",
        },
        bottomBarCard: {
          borderRadius: 28,
          padding: 12,
          backgroundColor: isDark ? colors.surface : "#111111",
          borderWidth: 1,
          borderColor: isDark ? colors.border : "#111111",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 10,
        },
        bottomBarInline: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        bottomBarMeta: {
          flex: 1,
          paddingHorizontal: 6,
        },
        bottomBarMetaLabel: {
          color: "rgba(255,255,255,0.64)",
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 4,
        },
        bottomBarMetaValue: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 17,
          letterSpacing: -0.5,
        },
        primaryCta: {
          borderRadius: 20,
          backgroundColor: "#ffffff",
          paddingHorizontal: 18,
          paddingVertical: 15,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        primaryCtaDisabled: {
          opacity: 0.45,
        },
        primaryCtaText: {
          color: "#111111",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        submitCta: {
          borderRadius: 22,
          backgroundColor: isDark ? colors.text : "#111111",
          paddingVertical: 16,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        submitCtaDisabled: {
          opacity: 0.5,
        },
        submitCtaText: {
          color: isDark ? colors.background : "#ffffff",
          fontFamily: omaTypography.semibold,
          fontSize: 14,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: "rgba(6, 11, 20, 0.55)",
          justifyContent: "flex-end",
        },
        modalSheet: {
          maxHeight: "88%",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          backgroundColor: colors.card,
          paddingTop: 16,
        },
        modalHeader: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          paddingHorizontal: 18,
          paddingBottom: 14,
        },
        modalHeaderCopy: {
          flex: 1,
        },
        modalEyebrow: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 6,
        },
        modalTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 20,
          letterSpacing: -0.6,
          marginBottom: 4,
        },
        modalSubtitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 18,
        },
        modalClose: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        modalSearchShell: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginHorizontal: 18,
          marginBottom: 14,
          paddingHorizontal: 14,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
        },
        modalSearchInput: {
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          paddingVertical: 12,
        },
        modalShortcutBlock: {
          marginBottom: 10,
          paddingHorizontal: 18,
        },
        modalShortcutTitle: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        letterRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        },
        letterChip: {
          flex: 1,
          minWidth: 34,
          paddingVertical: 9,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          alignItems: "center",
          justifyContent: "center",
        },
        letterChipActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        letterChipText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        letterChipTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        loaderContainer: {
          paddingVertical: 40,
          alignItems: "center",
          justifyContent: "center",
        },
        loaderText: {
          marginTop: 12,
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
        },
        modalListContent: {
          paddingHorizontal: 18,
          paddingBottom: 32,
        },
        modalCard: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderRadius: 22,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          marginBottom: 10,
        },
        modalCardBody: {
          flex: 1,
        },
        modalAvatar: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
        },
        modalAvatarText: {
          color: "#ffffff",
          fontFamily: omaTypography.extrabold,
          fontSize: 14,
        },
        modalProductSquare: {
          width: 46,
          height: 46,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
        },
        modalCardTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: 14,
          lineHeight: 19,
          marginBottom: 4,
        },
        modalCardMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        modalTag: {
          marginTop: 6,
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        modalTagText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
        },
        modalPrice: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 15,
          marginBottom: 2,
          textAlign: "right",
        },
        modalEmpty: {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 44,
          paddingHorizontal: 20,
        },
        modalEmptyTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 17,
          marginTop: 14,
          marginBottom: 6,
        },
        modalEmptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
          textAlign: "center",
        },
        loadingOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(9,17,31,0.42)",
          justifyContent: "center",
          alignItems: "center",
        },
        successOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(9,17,31,0.66)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
        },
        successCard: {
          width: "100%",
          maxWidth: 340,
          borderRadius: 30,
          backgroundColor: colors.card,
          padding: 24,
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
        },
        successIconWrap: {
          width: 96,
          height: 96,
          borderRadius: 48,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark
            ? "rgba(74,222,128,0.18)"
            : "rgba(34,197,94,0.12)",
          marginBottom: 18,
        },
        successTitle: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          marginBottom: 8,
        },
        successOrderId: {
          color: colors.primary,
          fontFamily: omaTypography.bold,
          fontSize: 15,
          marginBottom: 8,
        },
        successMessage: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
        },
      }),
    [colors, headerTopPadding, isDark, isWideLayout, quantityError]
  );

  const renderCustomerSelectionModal = () => (
    <Modal
      visible={customerModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setCustomerModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Customer selection</Text>
                <Text style={styles.modalTitle}>Choose client account</Text>
                <Text style={styles.modalSubtitle}>
                  Search directly or browse by first letter.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setCustomerModalVisible(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchShell}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
              />
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                onChangeText={searchCustomers}
                placeholder="Search by customer name or code"
                placeholderTextColor={colors.textSecondary}
                style={styles.modalSearchInput}
                value={customerSearchQuery}
              />

              {customerSearchQuery ? (
                <TouchableOpacity
                  onPress={() => {
                    setCustomerSearchQuery("");
                    if (selectedLetter) {
                      fetchCustomers(selectedLetter);
                    } else {
                      setFilteredCustomers([]);
                    }
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.modalShortcutBlock}>
              <Text style={styles.modalShortcutTitle}>Browse by initial</Text>
              {getAlphabetGroups().map((group, index) => (
                <View key={`customer-group-${index}`} style={styles.letterRow}>
                  {group.map((letter) => {
                    const active = selectedLetter === letter && !customerSearchQuery;

                    return (
                      <TouchableOpacity
                        key={letter}
                        activeOpacity={0.88}
                        onPress={() => {
                          setSelectedLetter(letter);
                          setCustomerSearchQuery("");
                          fetchCustomers(letter);
                        }}
                        style={[
                          styles.letterChip,
                          active && styles.letterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.letterChipText,
                            active && styles.letterChipTextActive,
                          ]}
                        >
                          {letter}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {isCustomerLoading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loaderText}>Loading customer accounts...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCustomers}
                keyExtractor={(item, index) =>
                  `${item["Customer CODE"] || item["Customer NAME"]}-${index}`
                }
                contentContainerStyle={styles.modalListContent}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleCustomerSelection(item)}
                    style={styles.modalCard}
                  >
                    <View
                      style={[
                        styles.modalAvatar,
                        {
                          backgroundColor: generateRandomColor(
                            item["Customer NAME"]
                          ),
                        },
                      ]}
                    >
                      <Text style={styles.modalAvatarText}>
                        {item["Customer NAME"]
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part.charAt(0).toUpperCase())
                          .join("")}
                      </Text>
                    </View>

                    <View style={styles.modalCardBody}>
                      <Text style={styles.modalCardTitle}>
                        {item["Customer NAME"]}
                      </Text>
                      <Text style={styles.modalCardMeta}>
                        {item["Customer CODE"]
                          ? `Customer code: ${item["Customer CODE"]}`
                          : "Customer code unavailable"}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Ionicons
                      name="people-outline"
                      size={40}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.modalEmptyTitle}>No customer results</Text>
                    <Text style={styles.modalEmptyBody}>
                      {customerSearchQuery
                        ? `Nothing matched "${customerSearchQuery}". Try a broader search or browse by initial.`
                        : "Choose a letter or type a customer name to load the live account list."}
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

  const renderProductSelectionModal = () => (
    <Modal
      visible={productModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setProductModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Product selection</Text>
                <Text style={styles.modalTitle}>Pick live catalog items</Text>
                <Text style={styles.modalSubtitle}>
                  Search by SKU, name, or group, or browse by first letter.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setProductModalVisible(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchShell}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={searchProducts}
                placeholder="Search by SKU, product, or group"
                placeholderTextColor={colors.textSecondary}
                style={styles.modalSearchInput}
                value={productSearchQuery}
              />

              {productSearchQuery ? (
                <TouchableOpacity
                  onPress={() => {
                    setProductSearchQuery("");
                    if (selectedProductLetter) {
                      filterProductsByLetter(selectedProductLetter);
                    } else {
                      setFilteredProducts([]);
                    }
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.modalShortcutBlock}>
              <Text style={styles.modalShortcutTitle}>Browse by initial</Text>
              {getAlphabetGroups().map((group, index) => (
                <View key={`product-group-${index}`} style={styles.letterRow}>
                  {group.map((letter) => {
                    const active =
                      selectedProductLetter === letter && !productSearchQuery;

                    return (
                      <TouchableOpacity
                        key={letter}
                        activeOpacity={0.88}
                        onPress={() => filterProductsByLetter(letter)}
                        style={[
                          styles.letterChip,
                          active && styles.letterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.letterChipText,
                            active && styles.letterChipTextActive,
                          ]}
                        >
                          {letter}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <FlatList
              data={filteredProducts}
              keyExtractor={(item, index) =>
                `${item["Product CODE"] || item["Product NAME"]}-${index}`
              }
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleProductSelect(item)}
                  style={styles.modalCard}
                >
                  <View
                    style={[
                      styles.modalProductSquare,
                      {
                        backgroundColor: getProductCategoryColor(
                          item["Product GROUP CODE"]
                        ),
                      },
                    ]}
                  >
                    <Ionicons name="cube-outline" size={20} color="#ffffff" />
                  </View>

                  <View style={styles.modalCardBody}>
                    <Text numberOfLines={2} style={styles.modalCardTitle}>
                      {item["Product NAME"]}
                    </Text>
                    <Text style={styles.modalCardMeta}>
                      {item["Product CODE"] || "No product code"}
                    </Text>
                    {item["Product Group Name"] ? (
                      <View style={styles.modalTag}>
                        <Text style={styles.modalTagText}>
                          {item["Product Group Name"]}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View>
                    <Text style={styles.modalPrice}>
                      ₹{formatIndianNumber(parseFloat(item["Rate"] || "0"))}
                    </Text>
                    <Ionicons
                      name="add-circle"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Ionicons
                    name="cube-outline"
                    size={40}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.modalEmptyTitle}>No products found</Text>
                  <Text style={styles.modalEmptyBody}>
                    {productSearchQuery
                      ? `Nothing matched "${productSearchQuery}". Try a shorter term or browse alphabetically.`
                      : "Choose a letter or type a product name to explore the live catalog."}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderCustomerStep = () => (
    <>
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionEyebrow}>Step 1</Text>
        <Text style={styles.sectionHeading}>Select customer</Text>
        <Text style={styles.sectionBody}>
          Lock the client account first, then build the order against the live
          OMA product list.
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openCustomerPicker}
        style={styles.pickerCard}
      >
        <View style={styles.pickerIconWrap}>
          <Ionicons name="people-outline" size={22} color={colors.text} />
        </View>

        <View style={styles.pickerCopy}>
          <Text style={styles.pickerLabel}>Customer account</Text>
          <Text style={customerName ? styles.pickerValue : styles.pickerPlaceholder}>
            {customerName || "Search or browse customer accounts"}
          </Text>
          <Text style={styles.pickerHint}>
            {customerName
              ? "Tap to switch the billing profile"
              : "Use the live customer master"}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {customerName ? (
        <View style={styles.customerSpotlight}>
          <View style={styles.customerSpotlightTop}>
            <View
              style={[
                styles.customerAvatar,
                { backgroundColor: generateRandomColor(customerName) },
              ]}
            >
              <Text style={styles.customerAvatarText}>{customerInitials}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerCode}>
                {selectedCustomerCode
                  ? `Customer code ${selectedCustomerCode}`
                  : "Customer code unavailable"}
              </Text>
            </View>

            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>Selected</Text>
            </View>
          </View>

          <View style={styles.helperCard}>
            <Text style={styles.helperTitle}>Ready for line building</Text>
            <Text style={styles.helperBody}>
              The account is locked in. Continue to product selection to add live
              catalog items and quantities.
            </Text>
            <View style={styles.helperRow}>
              <View style={styles.helperMetric}>
                <Text style={styles.helperMetricValue}>
                  {selectedCustomerCode || "OMA"}
                </Text>
                <Text style={styles.helperMetricLabel}>Profile</Text>
              </View>
              <View style={styles.helperMetric}>
                <Text style={styles.helperMetricValue}>0</Text>
                <Text style={styles.helperMetricLabel}>Line items</Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.helperCard}>
          <Text style={styles.helperTitle}>Start with the billing profile</Text>
          <Text style={styles.helperBody}>
            Customer choice drives the rest of the flow. Pick the account now,
            then move straight into the order builder.
          </Text>
        </View>
      )}
    </>
  );

  const renderProductsStep = () => (
    <>
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionEyebrow}>Step 2</Text>
        <Text style={styles.sectionHeading}>Build order</Text>
        <Text style={styles.sectionBody}>
          Add products, confirm quantities, and keep the running order total in
          view.
        </Text>
      </View>

      <View style={styles.composerCard}>
        <Text style={styles.fieldLabel}>Product</Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openProductPicker}
          style={styles.productPreviewCard}
        >
          <View style={styles.productPreviewMeta}>
            <Text style={styles.productPreviewTitle}>
              {selectedProduct?.["Product NAME"] || "Choose live catalog product"}
            </Text>
            <Text style={styles.productPreviewCode}>
              {selectedProduct
                ? `${selectedProduct["Product CODE"] || "No code"}${
                    selectedProduct["Product Group Name"]
                      ? ` • ${selectedProduct["Product Group Name"]}`
                      : ""
                  }`
                : "Search by name, SKU, or group"}
            </Text>
          </View>

          <View>
            {selectedProduct ? (
              <Text style={styles.productPreviewRate}>₹{selectedProductRate}</Text>
            ) : (
              <Ionicons
                name="search-outline"
                size={20}
                color={colors.textSecondary}
              />
            )}
          </View>
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Quantity</Text>
        <View style={styles.quantityShell}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => handleQuantityStep(-1)}
            style={styles.quantityStepper}
          >
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.quantityInputShell}>
            <TextInput
              ref={quantityInputRef}
              inputMode="numeric"
              onBlur={validateQuantityOnBlur}
              onChangeText={validateQuantity}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              style={styles.quantityInput}
              value={quantity}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => handleQuantityStep(1)}
            style={[styles.quantityStepper, styles.quantityStepperPrimary]}
          >
            <Ionicons
              name="add"
              size={18}
              color={isDark ? colors.background : "#ffffff"}
            />
          </TouchableOpacity>
        </View>

        {quantityError ? <Text style={styles.quantityError}>{quantityError}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!selectedProduct || !quantity || !!quantityError}
          onPress={addProduct}
          style={[
            styles.addLineButton,
            (!selectedProduct || !quantity || !!quantityError) &&
              styles.addLineButtonDisabled,
          ]}
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={isDark ? colors.background : "#ffffff"}
          />
          <Text style={styles.addLineButtonText}>Add line item</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeaderRow}>
        <Text style={styles.listHeaderText}>Line items</Text>
        <View style={styles.listHeaderPill}>
          <Text style={styles.listHeaderPillText}>
            {products.length} added
          </Text>
        </View>
      </View>

      {products.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIconWrap}>
            <Ionicons
              name="cube-outline"
              size={28}
              color={colors.textSecondary}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Nothing in the draft yet</Text>
          <Text style={styles.emptyStateBody}>
            Select a product, set the quantity, and add the first line to start
            the live order.
          </Text>
        </View>
      ) : (
        products.map((product, index) => (
          <Animated.View
            key={`${product.productCode || product.productName}-${index}`}
            entering={SlideInRight.duration(250).delay(index * 40)}
            exiting={SlideOutLeft.duration(180)}
            style={styles.lineItemCard}
          >
            <View style={styles.lineItemTopRow}>
              <View style={styles.lineItemIdentity}>
                <View
                  style={[
                    styles.lineItemDot,
                    { backgroundColor: generateRandomColor(product.productName) },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineItemTitle}>{product.productName}</Text>
                  <Text style={styles.lineItemMeta}>
                    {product.productCode
                      ? `Code ${product.productCode}`
                      : "No product code"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => removeProduct(index)}
                style={styles.lineItemRemoveButton}
              >
                <Ionicons name="close" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>

            <View style={styles.lineItemBottomRow}>
              <Text style={styles.lineItemMeta}>
                {product.quantity} {product.unit} × ₹{product.formattedRate}
              </Text>
              <Text style={styles.lineItemAmount}>₹{product.orderAmount}</Text>
            </View>
          </Animated.View>
        ))
      )}
    </>
  );

  const renderReviewStep = () => (
    <>
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionEyebrow}>Step 3</Text>
        <Text style={styles.sectionHeading}>Review & submit</Text>
        <Text style={styles.sectionBody}>
          Confirm fulfillment details, scan the line hierarchy, and dispatch the
          order through the existing OMA flow.
        </Text>
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewCardHeader}>
          <Text style={styles.reviewCardTitle}>Fulfillment logistics</Text>
        </View>

        <View style={styles.sourceButtonsRow}>
          {["Phone", "Email", "WhatsApp"].map((source) => {
            const active = orderSource === source;

            return (
              <TouchableOpacity
                key={source}
                activeOpacity={0.9}
                onPress={() => setOrderSource(source)}
                style={[styles.sourceButton, active && styles.sourceButtonActive]}
              >
                <Ionicons
                  name={
                    source === "Email"
                      ? "mail-outline"
                      : source === "Phone"
                      ? "call-outline"
                      : "logo-whatsapp"
                  }
                  size={16}
                  color={
                    active
                      ? isDark
                        ? colors.background
                        : "#ffffff"
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[styles.sourceText, active && styles.sourceTextActive]}
                >
                  {source}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dateModeRow}>
          {[
            { id: "live", label: "Use current time" },
            { id: "custom", label: "Custom schedule" },
          ].map((option) => {
            const active =
              option.id === "custom" ? isCustomDate : !isCustomDate;

            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.88}
                onPress={() => {
                  if (option.id === "custom") {
                    setIsCustomDate(true);
                    return;
                  }

                  const now = new Date();
                  setIsCustomDate(false);
                  setOrderDate(now);
                  updateDateTimeText(now);
                  setDateError("");
                }}
                style={[styles.dateModeChip, active && styles.dateModeChipActive]}
              >
                <Text
                  style={[
                    styles.dateModeChipText,
                    active && styles.dateModeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.deliveryGrid}>
          <View style={styles.deliveryCard}>
            <Text style={styles.fieldLabel}>Order date</Text>
            <View style={styles.inlineInputRow}>
              <View style={styles.inlineInputIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              <TextInput
                editable={isCustomDate}
                inputMode="numeric"
                onBlur={() => {
                  if (dateText && !validateDateInput(dateText)) {
                    setDateError("Usage: DD/MM/YYYY");
                  } else {
                    handleDateTimeChange();
                  }
                }}
                onChangeText={handleDateInputChange}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.textSecondary}
                style={styles.inlineInput}
                value={dateText}
              />
              <TouchableOpacity
                disabled={!isCustomDate}
                onPress={() => {
                  setIsCustomDate(true);
                  setDatePickerVisible(true);
                }}
                style={styles.pickerIconButton}
              >
                <Ionicons name="calendar" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.deliveryCard}>
            <Text style={styles.fieldLabel}>Requested time</Text>
            <View style={styles.inlineInputRow}>
              <View style={styles.inlineInputIcon}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              <TextInput
                editable={isCustomDate}
                inputMode="numeric"
                onBlur={() => {
                  if (timeText && !validateTimeInput(timeText)) {
                    setDateError("Usage: HH:MM with AM/PM");
                  } else {
                    handleDateTimeChange();
                  }
                }}
                onChangeText={(text) => {
                  const formattedTime = formatTimeInput(text);
                  const period = timeText.includes("PM") ? "PM" : "AM";
                  setTimeText(`${formattedTime} ${period}`);
                  setDateError("");
                }}
                placeholder="HH:MM"
                placeholderTextColor={colors.textSecondary}
                style={styles.inlineInput}
                value={timeText.split(" ")[0]}
              />

              <View style={styles.amPmButtons}>
                {["AM", "PM"].map((period) => {
                  const active = timeText.includes(period);

                  return (
                    <TouchableOpacity
                      key={period}
                      activeOpacity={0.88}
                      disabled={!isCustomDate}
                      onPress={() => {
                        const timePart = timeText.split(" ")[0] || "12:00";
                        setTimeText(`${timePart} ${period}`);
                        setDateError("");
                      }}
                      style={[
                        styles.periodButton,
                        active && styles.activePeriodButton,
                      ]}
                    >
                      <Text
                        style={[
                          styles.periodButtonText,
                          active && styles.activePeriodText,
                        ]}
                      >
                        {period}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                disabled={!isCustomDate}
                onPress={() => {
                  setIsCustomDate(true);
                  setTimePickerVisible(true);
                }}
                style={styles.pickerIconButton}
              >
                <Ionicons name="time" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {dateError ? <Text style={styles.dateTimeError}>{dateError}</Text> : null}
      </View>

      <View style={styles.customerSpotlight}>
        <View style={styles.reviewCardHeader}>
          <Text style={styles.reviewCardTitle}>Billing profile</Text>
          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.reviewActionLink}>Change</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.customerSpotlightTop}>
          <View
            style={[
              styles.customerAvatar,
              { backgroundColor: generateRandomColor(customerName) },
            ]}
          >
            <Text style={styles.customerAvatarText}>{customerInitials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{customerName}</Text>
            <Text style={styles.customerCode}>
              {selectedCustomerCode
                ? `Customer code ${selectedCustomerCode}`
                : "Customer code unavailable"}
            </Text>
          </View>

          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{orderSource}</Text>
          </View>
        </View>
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewCardHeader}>
          <Text style={styles.reviewCardTitle}>Line items</Text>
          <TouchableOpacity onPress={() => setStep(2)}>
            <Text style={styles.reviewActionLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        {products.map((product, index) => (
          <View
            key={`review-${product.productCode || product.productName}-${index}`}
            style={[
              styles.lineItemCard,
              {
                backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
                shadowOpacity: 0,
                elevation: 0,
              },
            ]}
          >
            <View style={styles.lineItemTopRow}>
              <View style={styles.lineItemIdentity}>
                <View
                  style={[
                    styles.lineItemDot,
                    { backgroundColor: generateRandomColor(product.productName) },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineItemTitle}>{product.productName}</Text>
                  <Text style={styles.lineItemMeta}>
                    {product.quantity} {product.unit} × ₹{product.formattedRate}
                  </Text>
                </View>
              </View>

              <Text style={styles.lineItemAmount}>₹{product.orderAmount}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.notesCard}>
        <Text style={styles.fieldLabel}>Order notes</Text>
        <TextInput
          multiline
          numberOfLines={4}
          onChangeText={setOrderComments}
          placeholder="Add delivery or dispatch notes"
          placeholderTextColor={colors.textSecondary}
          style={styles.notesInput}
          textAlignVertical="top"
          value={orderComments}
        />
      </View>

      <View style={styles.summaryDarkCard}>
        <View style={styles.summaryDarkGlow} />
        <Text style={styles.summaryDarkLabel}>Dispatch-ready total</Text>
        <Text style={styles.summaryDarkValue}>
          ₹{formatIndianNumber(totalAmount)}
        </Text>
        <Text style={styles.summaryDarkBody}>
          Submit the order using the current OMA create-order logic. This UI port
          only changes hierarchy, spacing, and touch flow.
        </Text>

        <View style={styles.summaryDarkRow}>
          <View style={styles.summaryDarkMetric}>
            <Text style={styles.summaryDarkMetricLabel}>Items</Text>
            <Text style={styles.summaryDarkMetricValue}>{totalItems}</Text>
          </View>
          <View style={styles.summaryDarkMetric}>
            <Text style={styles.summaryDarkMetricLabel}>Order ID</Text>
            <Text style={styles.summaryDarkMetricValue}>
              {isOrderIdLoading ? "Generating..." : orderId}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  const renderBottomBar = () => {
    if (step === 1) {
      return (
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarCard}>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={!canAdvanceToProducts}
              onPress={() => setStep(2)}
              style={[
                styles.submitCta,
                !canAdvanceToProducts && styles.submitCtaDisabled,
              ]}
            >
              <Text style={styles.submitCtaText}>Continue to products</Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={isDark ? colors.background : "#ffffff"}
              />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarCard}>
            <View style={styles.bottomBarInline}>
              <View style={styles.bottomBarMeta}>
                <Text style={styles.bottomBarMetaLabel}>
                  {totalItems} item{totalItems === 1 ? "" : "s"}
                </Text>
                <Text style={styles.bottomBarMetaValue}>
                  ₹{formatIndianNumber(totalAmount)}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                disabled={!canAdvanceToReview}
                onPress={() => setStep(3)}
                style={[
                  styles.primaryCta,
                  !canAdvanceToReview && styles.primaryCtaDisabled,
                ]}
              >
                <Text style={styles.primaryCtaText}>Review order</Text>
                <Ionicons name="arrow-forward" size={16} color="#111111" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarCard}>
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!canSubmitOrder}
            onPress={submitOrder}
            style={[styles.submitCta, !canSubmitOrder && styles.submitCtaDisabled]}
          >
            {isLoading ? (
              <ActivityIndicator
                color={isDark ? colors.background : "#ffffff"}
                size="small"
              />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={isDark ? colors.background : "#ffffff"}
                />
                <Text style={styles.submitCtaText}>
                  Confirm order & dispatch
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.topGlow} />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerShell}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                if (step === 1) {
                  router.back();
                  return;
                }

                setStep((prev) => (prev === 3 ? 2 : 1));
              }}
              style={styles.iconButton}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>
                Step {step} of 3
              </Text>
              <Text style={styles.headerTitle}>{currentTitle}</Text>
              <Text style={styles.headerSubtitle}>{currentSubtitle}</Text>
            </View>

            <View style={styles.orderIdPill}>
              <Text style={styles.orderIdLabel}>Order ID</Text>
              <Text numberOfLines={1} style={styles.orderIdValue}>
                {isOrderIdLoading ? "..." : orderId}
              </Text>
            </View>
          </View>

          <View style={styles.progressShell}>
            <View style={styles.progressRow}>
              {[1, 2, 3].map((index) => (
                <View
                  key={`progress-${index}`}
                  style={[
                    styles.progressTrack,
                    step >= index && styles.progressTrackActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.progressMetaRow}>
              {[
                { id: 1, label: "Customer" },
                { id: 2, label: "Products" },
                { id: 3, label: "Review" },
              ].map((item) => (
                <View key={item.id} style={styles.progressMetaItem}>
                  <Text
                    style={[
                      styles.progressMetaStep,
                      step === item.id && styles.progressMetaActiveText,
                    ]}
                  >
                    0{item.id}
                  </Text>
                  <Text
                    style={[
                      styles.progressMetaLabel,
                      step === item.id && styles.progressMetaActiveText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroEyebrow}>
            {step === 1
              ? "Customer intake"
              : step === 2
              ? "Product builder"
              : "Dispatch check"}
          </Text>
          <Text style={styles.heroTitle}>
            {step === 1
              ? "Start the draft with the right account."
              : step === 2
              ? "Add line items with a fast mobile rhythm."
              : "Review totals before submission."}
          </Text>
          <Text style={styles.heroBody}>
            {step === 1
              ? "The customer selection anchors the order. Once it is chosen, the flow moves directly into product building."
              : step === 2
              ? "Search the live catalog, set quantities, and keep the running amount visible without leaving the screen."
              : "Fulfillment timing, notes, and totals stay stacked in one place so the final check is short and clear."}
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>Customer</Text>
              <Text style={styles.heroStatValue}>
                {customerName || "Not selected"}
              </Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>Line items</Text>
              <Text style={styles.heroStatValue}>{products.length}</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatLabel}>Current total</Text>
              <Text style={styles.heroStatValue}>
                ₹{formatIndianNumber(totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        {step === 1 ? renderCustomerStep() : null}
        {step === 2 ? renderProductsStep() : null}
        {step === 3 ? renderReviewStep() : null}

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
      </ScrollView>

      {renderBottomBar()}
      {renderCustomerSelectionModal()}
      {renderProductSelectionModal()}

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      {orderSuccess ? (
        <View style={styles.successOverlay}>
          <Animated.View entering={FadeIn.duration(300)} style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={46} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Order submitted</Text>
            <Text style={styles.successOrderId}>Order #{orderId}</Text>
            <Text style={styles.successMessage}>
              The existing OMA submission flow completed successfully. Returning
              you to the app shortly.
            </Text>
            <ActivityIndicator
              style={{ marginTop: 18 }}
              color={colors.primary}
              size="small"
            />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
};

export default NewSalesOrderScreen;


