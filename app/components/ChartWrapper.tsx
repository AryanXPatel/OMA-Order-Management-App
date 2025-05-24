import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ThemeContext } from "../context/ThemeContext";

interface ChartWrapperProps {
  children: React.ReactNode;
  title: string;
  fallbackHeight?: number;
}

const ChartWrapper = ({
  children,
  title,
  fallbackHeight = 250,
}: ChartWrapperProps) => {
  const { theme, colors } = React.useContext(ThemeContext);
  const isDark = theme === "dark";
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View
        style={[
          styles.chartContainer,
          {
            backgroundColor: isDark ? colors.surfaceVariant : "#fff",
            height: fallbackHeight,
          },
        ]}
      >
        <Text
          style={[styles.chartTitle, { color: isDark ? colors.text : "#333" }]}
        >
          {title}
        </Text>

        <View style={styles.errorContainer}>
          <Text
            style={[
              styles.errorText,
              { color: isDark ? colors.textSecondary : "#666" },
            ]}
          >
            Unable to render chart. Please try again later.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.chartContainer,
        { backgroundColor: isDark ? colors.surfaceVariant : "#fff" },
      ]}
    >
      <Text
        style={[styles.chartTitle, { color: isDark ? colors.text : "#333" }]}
      >
        {title}
      </Text>

      <React.ErrorBoundary
        fallback={<View />}
        onError={() => setHasError(true)}
      >
        {children}
      </React.ErrorBoundary>
    </View>
  );
};

const styles = StyleSheet.create({
  chartContainer: {
    margin: 15,
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    textAlign: "center",
  },
});

export default ChartWrapper;
