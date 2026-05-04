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
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ThemeContext } from "@/context/ThemeContext";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import NetInfo from "@react-native-community/netinfo";
import { isManagerRole, normalizeAppRole } from "@/utils/roles";
import { omaTypography } from "@/utils/typography";
registerTranslation("en", {}); // English locale

const webTextInputReset =
  Platform.OS === "web"
    ? ({
        outlineStyle: "none",
        outlineColor: "transparent",
        outlineWidth: 0,
        outlineOffset: 0,
        boxShadow: "none",
        appearance: "none",
        WebkitAppearance: "none",
        borderWidth: 0,
        backgroundColor: "transparent",
      } as any)
    : {};

type SheetRecord = Record<string, string>;

const getSheetValue = (
  record: SheetRecord | null | undefined,
  keys: string[],
  fallback = ""
) => {
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
};

const formatCompactCurrency = (value: string) => {
  const parsed = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(parsed);
  } catch {
    return `${Math.round(parsed)}`;
  }
};

const getCustomerLocationLine = (customer: SheetRecord | null | undefined) =>
  [
    getSheetValue(customer, ["city"]),
    getSheetValue(customer, ["zone"]),
  ]
    .filter(Boolean)
    .join(" • ");

const getCustomerProfileLine = (customer: SheetRecord | null | undefined) =>
  [
    getSheetValue(customer, ["channel"]),
    getSheetValue(customer, ["industry"]),
  ]
    .filter(Boolean)
    .join(" • ");

const getCustomerTermsLabel = (customer: SheetRecord | null | undefined) => {
  const terms = getSheetValue(customer, ["payment_terms_days"]);
  return terms ? `${terms}d terms` : "Terms n/a";
};

const getCustomerRiskLabel = (customer: SheetRecord | null | undefined) => {
  const risk = getSheetValue(customer, ["risk_tier"]);
  return risk ? `${risk} risk` : "Risk n/a";
};

const getCreditLimitLabel = (customer: SheetRecord | null | undefined) => {
  const limit = formatCompactCurrency(getSheetValue(customer, ["credit_limit"]));
  return limit ? `₹${limit} limit` : "Limit n/a";
};

const getProductGroup = (product: SheetRecord | null | undefined) =>
  getSheetValue(product, [
    "Product Group Name",
    "product_group_norm",
    "Category",
  ]);

const getProductUnit = (product: SheetRecord | null | undefined) =>
  getSheetValue(product, ["uom", "UOM", "Unit"], "Unit");

const getProductRate = (product: SheetRecord | null | undefined) => {
  const parsed = Number.parseFloat(getSheetValue(product, ["Rate"], "0"));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getProductDescriptor = (product: SheetRecord | null | undefined) =>
  [
    getSheetValue(product, ["brand"]),
    getSheetValue(product, ["subcategory"]),
    getProductGroup(product),
  ]
    .filter(Boolean)
    .join(" • ");

const getProductMarginLabel = (product: SheetRecord | null | undefined) => {
  const margin = getSheetValue(product, ["margin_pct"]);
  return margin ? `${margin}% margin` : "Margin n/a";
};

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
  const [selectedCustomer, setSelectedCustomer] = useState<SheetRecord | null>(
    null
  );
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("");
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [filteredCustomers, setFilteredCustomers] = useState<SheetRecord[]>([]);

  // Product state
  const [selectedProduct, setSelectedProduct] = useState<SheetRecord | null>(
    null
  );
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productList, setProductList] = useState<SheetRecord[]>([]);
  const [quantity, setQuantity] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<SheetRecord[]>([]);
  const [selectedProductGroup, setSelectedProductGroup] = useState("All");
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
        `${BACKEND_URL}/api/sheets/Product_Master!A1:L`,
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
            const product: SheetRecord = {};
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
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:N`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        const rows = response.data.values.slice(1);

        const headers = response.data.values[0];
        const customerData = rows
          .filter(
            (row) => row[1] && row[1].trim().toUpperCase().startsWith(letter)
          )
          .map((row) => {
            const customer: SheetRecord = {};
            headers.forEach((header, index) => {
              customer[header] = row[index] || "";
            });
            return customer;
          });

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
      const fallbackLetter =
        selectedLetter || customerName.trim().charAt(0).toUpperCase() || "A";
      setSelectedLetter(fallbackLetter);
      fetchCustomers(fallbackLetter);
      return;
    }

    setIsCustomerLoading(true);
    try {
      const response = await fetchWithRetry(
        `${BACKEND_URL}/api/sheets/Customer_Master!A1:N`,
        {},
        2,
        1500
      );

      if (response.data && response.data.values) {
        const headers = response.data.values[0];
        const rows = response.data.values.slice(1);

        const allCustomers = rows.map((row) => {
          const customer: SheetRecord = {};
          headers.forEach((header, index) => {
            customer[header] = row[index] || "";
          });
          return customer;
        });

        // Filter by query (both name and code)
        const filtered = allCustomers.filter(
          (customer) =>
            [
              customer["Customer NAME"],
              customer["Customer CODE"],
              customer.city,
              customer.zone,
              customer.sales_owner,
              customer.channel,
              customer.industry,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value).toLowerCase().includes(query.toLowerCase())
              )
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
      filterProductsByGroup(selectedProductGroup || "All");
      return;
    }

    setSelectedProductGroup("");

    try {
      // For better performance, filter the already loaded products
      const filtered = productList.filter(
        (product) =>
          [
            product["Product NAME"],
            product["Product CODE"],
            product["Product Group Name"],
            product.product_group_norm,
            product.brand,
            product.subcategory,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(query.toLowerCase())
            )
      );

      setFilteredProducts(filtered);
    } catch (error) {
      console.error("Search products error:", error);
    }
  };

  const productGroupOptions = useMemo(() => {
    const groups = Array.from(
      new Set(
        productList
          .map((product) => getProductGroup(product))
          .filter(Boolean)
      )
    );

    return ["All", ...groups.slice(0, 8)];
  }, [productList]);

  // Filter products by sheet-backed product group
  const filterProductsByGroup = useCallback(
    (group) => {
      const nextGroup = group || "All";
      setSelectedProductGroup(nextGroup);
      setProductSearchQuery("");

      const filtered =
        nextGroup === "All"
          ? productList
          : productList.filter(
              (product) =>
                getProductGroup(product) === nextGroup ||
                getSheetValue(product, ["product_group_norm"]) === nextGroup
            );

      setFilteredProducts(filtered);
    },
    [productList]
  );

  useEffect(() => {
    if (step === 1 && !customerSearchQuery.trim() && !selectedLetter) {
      const initialLetter = customerName.trim().charAt(0).toUpperCase() || "A";
      setSelectedLetter(initialLetter);
      fetchCustomers(initialLetter);
    }
  }, [step, customerName, customerSearchQuery, selectedLetter]);

  useEffect(() => {
    if (
      step === 2 &&
      !productSearchQuery.trim() &&
      filteredProducts.length === 0 &&
      productList.length > 0
    ) {
      filterProductsByGroup(selectedProductGroup || "All");
    }
  }, [
    filterProductsByGroup,
    filteredProducts.length,
    productList.length,
    productSearchQuery,
    selectedProductGroup,
    step,
  ]);

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setQuantity("1");
    setQuantityError("");
    setProductModalVisible(false);
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
    const numericRate = getProductRate(selectedProduct);

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
      productGroup: getProductGroup(selectedProduct),
      productBrand: getSheetValue(selectedProduct, ["brand"]),
      productSubcategory: getSheetValue(selectedProduct, ["subcategory"]),
      productMargin: getSheetValue(selectedProduct, ["margin_pct"]),
      quantity: numericQuantity,
      unit: getProductUnit(selectedProduct),
      rate: numericRate,
      formattedRate: formatIndianNumber(numericRate),
      orderAmount: formattedAmount,
      numericAmount: rawAmount,
    };

    setProducts([...products, newProduct]);

    // Reset fields for next product
    setSelectedProduct(null);
    setQuantity("");
    setQuantityError("");
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
      const activeRole = normalizeAppRole(userRole);
      if (!activeRole) {
        throw new Error("Session not found");
      }

      if (userRole !== activeRole) {
        await AsyncStorage.setItem("userRole", activeRole);
      }

      const approvalStatus = isManagerRole(activeRole) ? "Y" : "R"; // Manager-created orders are auto-approved.

      const currentTimestamp = new Date();
      const sysTime = formatDate(currentTimestamp);
      const orderTime = formatDate(orderDate);
      const createdAtIso = currentTimestamp.toISOString();

      const transformedRows = products.map((product, index) =>
        serializeOrderLineForSheet({
          sysTime,
          orderTime,
          user: activeRole,
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
  const quantityNumber = Number.parseFloat(quantity);
  const hasValidQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const selectedProductRate = selectedProduct
    ? formatIndianNumber(getProductRate(selectedProduct))
    : "";
  const selectedProductDescriptor = getProductDescriptor(selectedProduct);
  const selectedProductUnit = getProductUnit(selectedProduct);
  const selectedProductMargin = getProductMarginLabel(selectedProduct);
  const selectedCustomerLocation = getCustomerLocationLine(selectedCustomer);
  const selectedCustomerProfile = getCustomerProfileLine(selectedCustomer);
  const selectedCustomerTerms = getCustomerTermsLabel(selectedCustomer);
  const selectedCustomerRisk = getCustomerRiskLabel(selectedCustomer);
  const selectedCustomerLimit = getCreditLimitLabel(selectedCustomer);
  const canAdvanceToProducts = Boolean(customerName);
  const canAdvanceToReview = products.length > 0;
  const canSubmitOrder = Boolean(customerName && products.length > 0) && !isLoading;
  const draftLineAmount =
    selectedProduct && hasValidQuantity
      ? formatIndianNumber(getProductRate(selectedProduct) * quantityNumber)
      : "";
  const addLineButtonLabel = !selectedProduct
    ? "Choose a product"
    : quantityError
    ? "Fix quantity"
    : !hasValidQuantity
    ? "Set quantity"
    : "Add to order";
  const customerInitials = customerName
    ? customerName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "NA";
  const openProductPicker = () => {
    setProductModalVisible(true);

    if (productSearchQuery.trim()) {
      searchProducts(productSearchQuery);
      return;
    }

    filterProductsByGroup(selectedProductGroup || "All");
  };

  const handleCustomerSelection = (customer) => {
    setSelectedCustomer(customer);
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
          backgroundColor: colors.appChrome,
        },
        topGlow: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 280,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.018)"
            : "rgba(255,255,255,0.04)",
        },
        contentContainer: {
          paddingHorizontal: 20,
          paddingBottom: 188,
        },
        headerShell: {
          paddingTop: headerTopPadding,
          paddingBottom: 4,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 12,
        },
        iconButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(52,52,56,0.56)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 8,
        },
        headerSpacer: {
          width: 44,
          height: 44,
        },
        headerProgressRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        headerProgressDot: {
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.18)",
        },
        headerProgressDotActive: {
          width: 18,
          backgroundColor: "#ffffff",
        },
        headerProgressDotComplete: {
          backgroundColor: colors.accentGreen,
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
          display: "none",
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
        stepPageTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 24,
          letterSpacing: -0.8,
          marginBottom: 20,
        },
        referenceSearchShell: {
          position: "relative",
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: "rgba(246,198,76,0.75)",
          backgroundColor: "rgba(28,28,30,0.86)",
          paddingHorizontal: 14,
          paddingVertical: 14,
          marginBottom: 18,
        },
        referenceSearchInput: {
          ...webTextInputReset,
          flex: 1,
          color: "#ffffff",
          fontFamily: omaTypography.medium,
          fontSize: 15,
          minHeight: 24,
          paddingVertical: 0,
          paddingLeft: 10,
        },
        referenceSectionLabel: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.bold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          marginBottom: 12,
          paddingHorizontal: 2,
        },
        referenceClientList: {
          gap: 12,
        },
        referenceClientCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.03)",
          paddingHorizontal: 14,
          paddingVertical: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        referenceClientBody: {
          flex: 1,
        },
        referenceClientTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 17,
          letterSpacing: -0.3,
          marginBottom: 4,
        },
        referenceClientMeta: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 18,
        },
        referenceClientSubMeta: {
          color: "rgba(255,255,255,0.52)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
          marginTop: 3,
        },
        referenceClientTag: {
          alignSelf: "center",
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f1f3f7",
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        referenceTagColumn: {
          alignItems: "flex-end",
          gap: 7,
          maxWidth: 110,
        },
        referenceClientTagText: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 11,
        },
        referenceRiskText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          textAlign: "right",
        },
        referenceClientInsightRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 10,
        },
        referenceClientMiniPill: {
          borderRadius: 999,
          paddingHorizontal: 9,
          paddingVertical: 5,
          backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#f1f3f7",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
        },
        referenceClientMiniText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
        },
        referenceEmptyCard: {
          borderRadius: 18,
          backgroundColor: colors.appChromeElevated,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.03)",
          paddingHorizontal: 16,
          paddingVertical: 18,
        },
        referenceEmptyTitle: {
          color: "#ffffff",
          fontFamily: omaTypography.bold,
          fontSize: 16,
          marginBottom: 6,
        },
        referenceEmptyBody: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          lineHeight: 19,
        },
        heroCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 30,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          padding: 22,
          marginBottom: 20,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
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
            ? "rgba(255,255,255,0.03)"
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
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
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
          borderColor: "rgba(255,255,255,0.05)",
          backgroundColor: colors.appChromeElevated,
          padding: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
          elevation: 8,
        },
        pickerIconWrap: {
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
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
          backgroundColor: colors.appChromeElevated,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
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
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
        },
        statusChipText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        helperCard: {
          borderRadius: 24,
          padding: 18,
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
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
          backgroundColor: colors.appChromeElevated,
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
          backgroundColor: colors.appChromeElevated,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          padding: 18,
          marginBottom: 14,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.16,
          shadowRadius: 20,
          elevation: 8,
        },
        composerCardHeader: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        },
        fieldLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 10,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          marginBottom: 8,
        },
        composerHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          lineHeight: 17,
        },
        readyChip: {
          minHeight: 32,
          paddingHorizontal: 10,
          borderRadius: 999,
          backgroundColor: isDark
            ? "rgba(50,215,75,0.11)"
            : "rgba(52,199,89,0.12)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(50,215,75,0.24)"
            : "rgba(52,199,89,0.22)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 5,
        },
        readyChipText: {
          color: colors.success,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        productPreviewCard: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 96,
          padding: 16,
          borderRadius: 22,
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
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
        productPreviewAction: {
          minWidth: 78,
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 4,
        },
        productPreviewActionText: {
          color: colors.primary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        changeProductPill: {
          minHeight: 30,
          borderRadius: 999,
          paddingHorizontal: 9,
          backgroundColor: isDark
            ? "rgba(255,214,10,0.11)"
            : "rgba(255,204,0,0.14)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,214,10,0.26)"
            : "rgba(255,204,0,0.28)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 4,
        },
        changeProductPillText: {
          color: colors.primary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        productSpecGrid: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        },
        productSpecPill: {
          borderRadius: 999,
          paddingHorizontal: 11,
          paddingVertical: 7,
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        productSpecText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        quantityHeaderRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        },
        quantityHelperText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 11,
          marginBottom: 8,
        },
        quantityShell: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        },
        quantityStepper: {
          width: 48,
          height: 48,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
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
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          paddingHorizontal: 16,
          paddingVertical: 4,
          minHeight: 48,
        },
        quantityInput: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 24,
          paddingVertical: 10,
          textAlign: "center",
        },
        quantityPresetRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        },
        quantityPresetChip: {
          flex: 1,
          minHeight: 44,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        quantityPresetChipActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        quantityPresetText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        quantityPresetTextActive: {
          color: isDark ? colors.background : "#ffffff",
        },
        quantityError: {
          color: colors.error,
          fontFamily: omaTypography.medium,
          fontSize: 12,
          marginBottom: 10,
        },
        linePreviewStrip: {
          minHeight: 48,
          borderRadius: 18,
          paddingHorizontal: 14,
          marginBottom: 12,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.045)"
            : "rgba(17,24,39,0.045)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        linePreviewLabel: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        linePreviewValue: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 15,
          textAlign: "right",
          flexShrink: 1,
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
          backgroundColor: colors.appChromeElevated,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
        },
        listHeaderPillText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 11,
        },
        emptyStateCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
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
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
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
          backgroundColor: colors.appChromeElevated,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          padding: 16,
          marginBottom: 12,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.15,
          shadowRadius: 18,
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
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark ? colors.appChromeMuted : colors.cardMuted,
        },
        lineItemBottomRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingTop: 4,
        },
        lineItemAmount: {
          color: colors.text,
          fontFamily: omaTypography.extrabold,
          fontSize: 16,
          textAlign: "right",
          flexShrink: 0,
        },
        reviewCard: {
          backgroundColor: colors.appChromeElevated,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          padding: 18,
          marginBottom: 14,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.16,
          shadowRadius: 20,
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
          backgroundColor: "transparent",
        },
        bottomBarCard: {
          borderRadius: 28,
          padding: 12,
          backgroundColor: "rgba(52,52,56,0.58)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
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
          backgroundColor: "rgba(0, 0, 0, 0.72)",
          justifyContent: "flex-end",
        },
        modalSheet: {
          maxHeight: "88%",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          backgroundColor: colors.appChromeElevated,
          borderTopWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
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
          ...webTextInputReset,
          flex: 1,
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          minHeight: 24,
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
        groupShortcutScroll: {
          paddingRight: 18,
        },
        groupChip: {
          minHeight: 36,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surfaceVariant : colors.cardMuted,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 8,
        },
        groupChipActive: {
          backgroundColor: isDark ? colors.text : "#111111",
          borderColor: isDark ? colors.text : "#111111",
        },
        groupChipText: {
          color: colors.textSecondary,
          fontFamily: omaTypography.semibold,
          fontSize: 12,
        },
        groupChipTextActive: {
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Customer selection</Text>
                <Text style={styles.modalTitle}>Choose client account</Text>
                <Text style={styles.modalSubtitle}>
                  Search by customer name, code, city, rep, or channel.
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
                        {[
                          item["Customer CODE"]
                            ? `Code ${item["Customer CODE"]}`
                            : "Code unavailable",
                          getCustomerLocationLine(item),
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </Text>
                      {getCustomerProfileLine(item) ? (
                        <Text style={styles.referenceClientSubMeta}>
                          {getCustomerProfileLine(item)}
                        </Text>
                      ) : null}
                      <View style={styles.referenceClientInsightRow}>
                        <View style={styles.referenceClientMiniPill}>
                          <Text style={styles.referenceClientMiniText}>
                            {getCustomerTermsLabel(item)}
                          </Text>
                        </View>
                        <View style={styles.referenceClientMiniPill}>
                          <Text style={styles.referenceClientMiniText}>
                            {getCustomerRiskLabel(item)}
                          </Text>
                        </View>
                      </View>
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
                        ? `Nothing matched "${customerSearchQuery}". Try a broader customer name, city, rep, or code.`
                        : "Type a customer name, city, rep, or code to search the live account list."}
                    </Text>
                  </View>
                }
              />
            )}
        </View>
      </View>
    </Modal>
  );

  const renderProductSelectionModal = () => (
    <Modal
      visible={productModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setProductModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Product selection</Text>
                <Text style={styles.modalTitle}>Pick live catalog items</Text>
                <Text style={styles.modalSubtitle}>
                  Search by SKU, name, or brand, or use product groups.
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
                onChangeText={searchProducts}
                placeholder="Search by SKU, product, or group"
                placeholderTextColor={colors.textSecondary}
                style={styles.modalSearchInput}
                value={productSearchQuery}
              />

              {productSearchQuery ? (
                <TouchableOpacity
                  accessibilityLabel="Clear product search"
                  accessibilityRole="button"
                  onPress={() => {
                    setProductSearchQuery("");
                    filterProductsByGroup(selectedProductGroup || "All");
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
              <Text style={styles.modalShortcutTitle}>Catalog shortcuts</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupShortcutScroll}
              >
                {productGroupOptions.map((group) => {
                  const active =
                    selectedProductGroup === group && !productSearchQuery;

                  return (
                    <TouchableOpacity
                      accessibilityLabel={`Filter products by ${group}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={group}
                      activeOpacity={0.88}
                      onPress={() => filterProductsByGroup(group)}
                      style={[styles.groupChip, active && styles.groupChipActive]}
                    >
                      <Text
                        style={[
                          styles.groupChipText,
                          active && styles.groupChipTextActive,
                        ]}
                      >
                        {group}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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
                      {[
                        item["Product CODE"] || "No product code",
                        getProductDescriptor(item),
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                    {getProductDescriptor(item) ? (
                      <View style={styles.modalTag}>
                        <Text style={styles.modalTagText}>
                          {`${getProductUnit(item)} • ${getProductMarginLabel(
                            item
                          )}`}
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
                      ? `Nothing matched "${productSearchQuery}". Try a shorter term or another product group.`
                      : "Choose a product group or type a product name to explore the live catalog."}
                  </Text>
                </View>
              }
            />
        </View>
      </View>
    </Modal>
  );

  const renderCustomerStep = () => (
    <>
      <Text style={styles.stepPageTitle}>Select Client</Text>

      <View style={styles.referenceSearchShell}>
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textSecondary}
        />
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          onChangeText={searchCustomers}
          placeholder="Search clients..."
          placeholderTextColor={colors.textSecondary}
          style={styles.referenceSearchInput}
          value={customerSearchQuery}
        />

        {customerSearchQuery ? (
          <TouchableOpacity
            onPress={() => {
              setCustomerSearchQuery("");
              if (selectedLetter) {
                fetchCustomers(selectedLetter);
              } else {
                fetchCustomers("A");
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

      <Text style={styles.referenceSectionLabel}>
        {customerSearchQuery.trim() ? "Search Results" : "Recent Clients"}
      </Text>

      <View style={styles.referenceClientList}>
        {isCustomerLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading client accounts...</Text>
          </View>
        ) : filteredCustomers.length > 0 ? (
          filteredCustomers.slice(0, 8).map((item, index) => {
            const selected =
              item["Customer NAME"] === customerName &&
              item["Customer CODE"] === selectedCustomerCode;

            return (
              <TouchableOpacity
                activeOpacity={0.9}
                key={`${item["Customer CODE"] || item["Customer NAME"]}-${index}`}
                onPress={() => handleCustomerSelection(item)}
                style={[
                  styles.referenceClientCard,
                  selected && {
                    backgroundColor: isDark
                      ? "rgba(246,198,76,0.08)"
                      : "#fff8dd",
                    borderColor: colors.accentGold,
                  },
                ]}
              >
                <View style={styles.referenceClientBody}>
                  <Text style={styles.referenceClientTitle}>
                    {item["Customer NAME"]}
                  </Text>
                  <Text style={styles.referenceClientMeta}>
                    {[
                      item["Customer CODE"]
                        ? `Code ${item["Customer CODE"]}`
                        : "Code unavailable",
                      getCustomerLocationLine(item),
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                  {getCustomerProfileLine(item) ? (
                    <Text style={styles.referenceClientSubMeta}>
                      {getCustomerProfileLine(item)}
                    </Text>
                  ) : null}
                  <View style={styles.referenceClientInsightRow}>
                    <View style={styles.referenceClientMiniPill}>
                      <Text style={styles.referenceClientMiniText}>
                        {getCustomerTermsLabel(item)}
                      </Text>
                    </View>
                    <View style={styles.referenceClientMiniPill}>
                      <Text style={styles.referenceClientMiniText}>
                        {getCreditLimitLabel(item)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.referenceTagColumn}>
                  <View style={styles.referenceClientTag}>
                    <Text style={styles.referenceClientTagText}>
                      {selected ? "Selected" : getCustomerTermsLabel(item)}
                    </Text>
                  </View>
                  <Text style={styles.referenceRiskText}>
                    {getCustomerRiskLabel(item)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.referenceEmptyCard}>
            <Text style={styles.referenceEmptyTitle}>No matching clients</Text>
            <Text style={styles.referenceEmptyBody}>
              Try another search term or use the full picker to browse the live
              customer master.
            </Text>
          </View>
        )}
      </View>
    </>
  );

  const renderProductsStep = () => (
    <>
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionEyebrow}>Step 2</Text>
        <Text style={styles.sectionHeading}>Add Products</Text>
        <Text style={styles.sectionBody}>
          Ordering for {customerName}
          {selectedCustomerLocation ? ` • ${selectedCustomerLocation}` : ""}
          {selectedCustomerTerms ? ` • ${selectedCustomerTerms}` : ""}.
        </Text>
      </View>

      <View style={styles.composerCard}>
        <View style={styles.composerCardHeader}>
          <View>
            <Text style={styles.fieldLabel}>Product</Text>
            <Text style={styles.composerHint}>
              {selectedProduct
                ? "Quantity starts at 1. Tap the card to change product."
                : products.length > 0
                ? "Choose another catalog product for the next line."
                : "Pick an item to price this line."}
            </Text>
          </View>
          {selectedProduct ? (
            <View style={styles.readyChip}>
              <Ionicons name="checkmark-circle" size={13} color={colors.success} />
              <Text style={styles.readyChipText}>Ready</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            selectedProduct ? "Change selected product" : "Open product catalog"
          }
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
                ? [
                    selectedProduct["Product CODE"] || "No code",
                    selectedProductDescriptor,
                    selectedProductUnit,
                  ]
                    .filter(Boolean)
                    .join(" • ")
                : "Search by name, SKU, or group"}
            </Text>
          </View>

          <View style={styles.productPreviewAction}>
            {selectedProduct ? (
              <>
                <Text style={styles.productPreviewRate}>₹{selectedProductRate}</Text>
                <View style={styles.changeProductPill}>
                  <Ionicons
                    name="search-outline"
                    size={12}
                    color={colors.primary}
                  />
                  <Text style={styles.changeProductPillText}>Change</Text>
                </View>
              </>
            ) : (
              <Ionicons
                name="search-outline"
                size={20}
                color={colors.textSecondary}
              />
            )}
          </View>
        </TouchableOpacity>

        {selectedProduct ? (
          <View style={styles.productSpecGrid}>
            {[selectedProductUnit, selectedProductMargin, selectedProductDescriptor]
              .filter(Boolean)
              .map((label) => (
                <View key={label} style={styles.productSpecPill}>
                  <Text style={styles.productSpecText}>{label}</Text>
                </View>
              ))}
          </View>
        ) : null}

        <View style={styles.quantityHeaderRow}>
          <Text style={styles.fieldLabel}>Quantity</Text>
          {selectedProduct ? (
            <Text style={styles.quantityHelperText}>
              Rate ₹{selectedProductRate} / {selectedProductUnit}
            </Text>
          ) : null}
        </View>
        <View style={styles.quantityShell}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
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
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
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

        <View style={styles.quantityPresetRow}>
          {[1, 2, 5, 10].map((option) => {
            const active = quantity === String(option);

            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={0.88}
                key={`quantity-${option}`}
                onPress={() => {
                  setQuantity(String(option));
                  setQuantityError("");
                }}
                style={[
                  styles.quantityPresetChip,
                  active && styles.quantityPresetChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.quantityPresetText,
                    active && styles.quantityPresetTextActive,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {quantityError ? <Text style={styles.quantityError}>{quantityError}</Text> : null}

        <View style={styles.linePreviewStrip}>
          <Text style={styles.linePreviewLabel}>Line value</Text>
          <Text style={styles.linePreviewValue}>
            {draftLineAmount
              ? `₹${draftLineAmount}`
              : selectedProduct
              ? "Pick a quantity"
              : "Choose a product"}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{
            disabled: !selectedProduct || !hasValidQuantity || !!quantityError,
          }}
          activeOpacity={0.9}
          disabled={!selectedProduct || !hasValidQuantity || !!quantityError}
          onPress={addProduct}
          style={[
            styles.addLineButton,
            (!selectedProduct || !hasValidQuantity || !!quantityError) &&
              styles.addLineButtonDisabled,
          ]}
        >
          <Ionicons
            name="add-circle-outline"
            size={20}
            strokeWidth={2.5}
            color={isDark ? colors.background : "#ffffff"}
          />
          <Text style={styles.addLineButtonText}>{addLineButtonLabel}</Text>
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
            Choose a product. Quantity starts at 1, then tap Add to order to
            create the first line.
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
                    {[
                      product.productCode
                        ? `Code ${product.productCode}`
                        : "No product code",
                      product.productBrand,
                      product.productGroup,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove ${product.productName}`}
                onPress={() => removeProduct(index)}
                style={styles.lineItemRemoveButton}
              >
                <Ionicons name="close" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>

            <View style={styles.lineItemBottomRow}>
              <Text style={styles.lineItemMeta} numberOfLines={1}>
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
        <Text style={styles.sectionHeading}>Review & Details</Text>
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
              {[
                selectedCustomerCode
                  ? `Customer code ${selectedCustomerCode}`
                  : "Customer code unavailable",
                selectedCustomerLocation,
              ]
                .filter(Boolean)
                .join(" • ")}
            </Text>
            {selectedCustomerProfile ? (
              <Text style={styles.referenceClientSubMeta}>
                {selectedCustomerProfile}
              </Text>
            ) : null}
            <View style={styles.referenceClientInsightRow}>
              {[selectedCustomerTerms, selectedCustomerRisk, selectedCustomerLimit]
                .filter(Boolean)
                .map((label) => (
                  <View key={label} style={styles.referenceClientMiniPill}>
                    <Text style={styles.referenceClientMiniText}>{label}</Text>
                  </View>
                ))}
            </View>
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
          Confirm the customer, schedule, and line items before sending the order
          for approval and dispatch.
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
              <Ionicons name={step === 1 ? "close" : "arrow-back"} size={20} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.headerProgressRow}>
              {[1, 2, 3].map((index) => (
                <View
                  key={`header-dot-${index}`}
                  style={[
                    styles.headerProgressDot,
                    step >= index && styles.headerProgressDotActive,
                    step === 3 && index === 3 && styles.headerProgressDotComplete,
                  ]}
                />
              ))}
            </View>

            <View style={styles.headerSpacer} />
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


