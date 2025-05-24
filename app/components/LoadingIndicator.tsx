import React, { useState, useEffect, useContext } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { ThemeContext } from "../context/ThemeContext";

export const LoadingIndicator = ({
  message = "Loading...",
  showTips = false,
  size = "large",
}) => {
  const { theme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tip, setTip] = useState("");

  const tips = [
    "The server might be waking up from sleep mode",
    "First request can take up to 30 seconds",
    "We're working on improving startup times",
    "Thank you for your patience",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (showTips && elapsedTime > 5) {
      const tipIndex = Math.floor((elapsedTime - 5) / 8) % tips.length;
      setTip(tips[tipIndex]);
    }
  }, [elapsedTime, showTips]);

  return (
    <View style={styles.container}>
      <ActivityIndicator
        size={size}
        color={isDark ? colors.primary : colors.primary}
      />
      <Text style={[styles.message, { color: isDark ? colors.text : "#333" }]}>
        {message} {elapsedTime > 3 ? `(${elapsedTime}s)` : ""}
      </Text>

      {showTips && elapsedTime > 5 && (
        <Text
          style={[
            styles.tip,
            { color: isDark ? colors.textSecondary : "#666" },
          ]}
        >
          {tip}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  message: {
    marginTop: 15,
    fontSize: 16,
    textAlign: "center",
  },
  tip: {
    marginTop: 10,
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
    maxWidth: "80%",
  },
});

export default LoadingIndicator;
