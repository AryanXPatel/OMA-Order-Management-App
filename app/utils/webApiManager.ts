import { Platform } from "react-native";
import { fetchWithRetry, BACKEND_URL } from "./apiManager";

// Use a proxy service for web to bypass CORS issues
export const getApiUrl = (endpoint: string) => {
  if (Platform.OS === "web") {
    // For web, use a CORS proxy or ensure your backend allows cross-origin requests
    const isLocalhost = window.location.hostname === "localhost";

    if (isLocalhost) {
      console.log(`[Web API] Local request: ${BACKEND_URL}${endpoint}`);
      return `${BACKEND_URL}${endpoint}`;
    } else {
      // When deployed to GitHub Pages, use a CORS proxy
      const fullUrl = `${BACKEND_URL}${endpoint}`;
      const proxyUrl = `https://cors.eu.org/${BACKEND_URL}${endpoint}`;
      console.log(`[Web API] Using CORS proxy: ${proxyUrl}`);
      return proxyUrl;
    }
  }
  return `${BACKEND_URL}${endpoint}`;
};

// Web-safe fetch function that handles CORS
export const webFetchWithRetry = async (
  url: string,
  options = {},
  maxRetries = 3,
  initialDelay = 1000
) => {
  try {
    console.log(`[Web API] Original request URL: ${url}`);

    // Extract just the endpoint part from the URL
    const endpoint = url.replace(BACKEND_URL, "");

    // Get the proper URL for the current environment
    const proxyUrl = getApiUrl(endpoint);
    console.log(`[Web API] Sending request to: ${proxyUrl}`);

    // Use the built-in fetchWithRetry with the proxied URL
    const result = await fetchWithRetry(
      proxyUrl,
      options,
      maxRetries,
      initialDelay
    );
    return result;
  } catch (error) {
    console.error(`[Web API] Error in web fetch: ${error.message}`);
    throw error;
  }
};
