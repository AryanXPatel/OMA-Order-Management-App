import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKEND_URL = "https://oma-demo-server.onrender.com";

// Types
interface CacheData {
  [key: string]: any;
}

interface CacheTimestamp {
  [key: string]: number;
}

interface ApiCache {
  data: CacheData;
  timestamp: CacheTimestamp;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  get: (key: string) => any;
  set: (key: string, data: any) => void;
  clear: () => Promise<void>; // Only the signature, not implementation
}

// Function to wake up the server before the user needs it
export const wakeUpServer = async (): Promise<boolean> => {
  try {
    console.log("Waking up server...");
    const start = Date.now();
    const response = await axios.get(`${BACKEND_URL}/`);
    const duration = Date.now() - start;
    console.log(`Server woke up in ${duration}ms:`, response.data);
    return true;
  } catch (error) {
    console.error("Failed to wake up server:", error);
    return false;
  }
};

// Function to preload commonly needed data
export const preloadData = async (): Promise<void> => {
  try {
    await wakeUpServer();

    const requests = [
      axios.get(`${BACKEND_URL}/api/sheets/Product_Master!A1:E`),
      axios.get(`${BACKEND_URL}/api/sheets/New_Order_Table!D2:D`),
    ];

    await Promise.all(requests);
    console.log("Data preloaded successfully");
  } catch (error) {
    console.error("Failed to preload data:", error);
  }
};

// Enhanced cache manager with AsyncStorage persistence
export const apiCache: ApiCache = {
  data: {},
  timestamp: {},

  loadFromStorage: async function (): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem("apiCache");
      if (cached) {
        const parsedCache = JSON.parse(cached);
        this.data = parsedCache.data || {};
        this.timestamp = parsedCache.timestamp || {};
        console.log("Cache loaded from storage");
      }
    } catch (error) {
      console.error("Failed to load cache:", error);
    }
  },

  saveToStorage: async function (): Promise<void> {
    try {
      await AsyncStorage.setItem(
        "apiCache",
        JSON.stringify({
          data: this.data,
          timestamp: this.timestamp,
        })
      );
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  },

  clear: async function (): Promise<void> {
    this.data = {};
    this.timestamp = {};
    await AsyncStorage.removeItem("apiCache");
    console.log("API cache cleared");
  },
  get: function (key: string): any {
    const now = Date.now();
    if (
      this.data[key] &&
      this.timestamp[key] &&
      now - this.timestamp[key] < 300000 // 5 minutes cache
    ) {
      return this.data[key];
    }
    return null;
  },

  set: function (key: string, data: any): void {
    this.data[key] = data;
    this.timestamp[key] = Date.now();
    this.saveToStorage(); // Persist after update
  },
};

export const fetchWithRetry = async <T = any>(
  url: string,
  options: AxiosRequestConfig = {},
  maxRetries: number = 5,
  initialDelay: number = 2000
): Promise<AxiosResponse<T>> => {
  let lastError: Error;
  let retryCount = 0;
  let delay = initialDelay;
  const maxDelay = 30000; // Cap maximum delay at 30 seconds

  if (url.includes("New_Order_Table") || url.includes("Customer_Master")) {
    console.log(`Loading data from ${url.split("/").pop()}, please wait...`);
  }

  while (retryCount < maxRetries) {
    try {
      const response = await axios<T>(url, options);

      if (retryCount > 0) {
        console.log(
          `Request succeeded after ${retryCount} ${
            retryCount === 1 ? "retry" : "retries"
          }`
        );
      }

      return response;
    } catch (error: any) {
      lastError = error;
      retryCount++;

      if (
        error.response &&
        error.response.status >= 400 &&
        error.response.status < 500
      ) {
        console.log(`Client error (${error.response.status}), not retrying`);
        throw error;
      }

      delay = Math.min(delay * 1.5, maxDelay);

      if (retryCount < maxRetries) {
        console.log(
          `API request failed (${
            error.message || "Unknown error"
          }). Retry ${retryCount}/${maxRetries} in ${delay / 1000}s...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.log(`Maximum retries (${maxRetries}) reached. Request failed.`);
      }
    }
  }

  throw lastError || new Error("Request failed after maximum retries");
};

export default {
  BACKEND_URL,
  wakeUpServer,
  preloadData,
  apiCache,
  fetchWithRetry,
};
