import React, { useEffect, useRef, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "../context/ThemeContext";

export type FeedbackType = "success" | "error" | "warning" | "info";

interface FeedbackModalProps {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  onClose: () => void;
  autoDismiss?: boolean;
  dismissTime?: number;
  actionText?: string;
  onAction?: () => void;
}

const FeedbackModal = ({
  visible,
  type = "success",
  title,
  message,
  onClose,
  autoDismiss = true,
  dismissTime = 3000,
  actionText,
  onAction,
}: FeedbackModalProps) => {
  const { theme, colors } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoDismiss) {
        const timer = setTimeout(() => {
          handleClose();
        }, dismissTime);
        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const getIconName = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "alert-circle";
      case "warning":
        return "warning";
      case "info":
        return "information-circle";
      default:
        return "checkmark-circle";
    }
  };

  const getIconColor = () => {
    switch (type) {
      case "success":
        return "#27ae60";
      case "error":
        return "#e74c3c";
      case "warning":
        return "#f39c12";
      case "info":
        return "#3498db";
      default:
        return "#27ae60";
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? colors.surfaceVariant : "#fff",
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Ionicons
            name={getIconName()}
            size={50}
            color={getIconColor()}
            style={styles.icon}
          />
          <Text
            style={[styles.title, { color: isDark ? colors.text : "#333" }]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.message,
              { color: isDark ? colors.textSecondary : "#666" },
            ]}
          >
            {message}
          </Text>

          <View style={styles.buttonsContainer}>
            {actionText && onAction && (
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPress={() => {
                  handleClose();
                  onAction();
                }}
              >
                <Text style={styles.actionButtonText}>{actionText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.closeButton]}
              onPress={handleClose}
            >
              <Text
                style={[
                  styles.closeButtonText,
                  { color: isDark ? colors.primary : colors.primary },
                ]}
              >
                {actionText ? "Cancel" : "Close"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  icon: {
    marginBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    backgroundColor: "#16a085",
    marginRight: 10,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default FeedbackModal;
