import { Dimensions, Platform } from "react-native";

const { width, height } = Dimensions.get("window");

// Base dimensions (standard iPhone dimensions)
const baseWidth = 375;
const baseHeight = 812;

export const screenWidth = width;
export const screenHeight = height;

// Responsive scaling functions
export const scale = (size) => (width / baseWidth) * size;
export const verticalScale = (size) => (height / baseHeight) * size;
export const moderateScale = (size, factor = 0.5) =>
  size + (scale(size) - size) * factor;

// Device detection utilities
export const isIOS = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
export const isTablet = width >= 768;
export const isSmallDevice = width < 375;
