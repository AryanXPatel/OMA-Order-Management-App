import React, {
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { wakeUpServer, preloadData } from "../utils/apiManager";
import { useFeedback } from "../context/FeedbackContext";
import { scale, moderateScale, isTablet } from "../utils/responsive";
import NetInfo from "@react-native-community/netinfo";

import { Image } from "react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  StatusBar,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ThemeContext } from "../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

// App version - centralized for easy updates
const APP_VERSION = "2.4.0";

const LoginScreen = () => {
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const isDark = theme === "dark";
  const { showFeedback } = useFeedback();

  // Animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;
  const formOpacity = React.useRef(new Animated.Value(0)).current;

  // Check network status
  useEffect(() => {
    const checkConnectivity = async () => {
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        showFeedback({
          type: "error",
          title: "No Internet Connection",
          message: "Please check your internet connection and try again.",
          autoDismiss: false,
        });
      }
    };

    checkConnectivity();
  }, []);

  // Load remembered username
  useEffect(() => {
    const loadSavedUsername = async () => {
      try {
        const savedUsername = await AsyncStorage.getItem("cachedUsername");
        if (savedUsername) {
          setUsername(savedUsername);
        }
      } catch (error) {
        console.log("Error loading saved username:", error);
      }
    };

    loadSavedUsername();
  }, []);

  // Initialize animations and server connection
  useEffect(() => {
    // Wake up server in background
    wakeUpServer().then(() => {
      preloadData();
    });

    // Start welcome message animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start();

    // After 2 seconds, show the sign-in form (reduced from 2.5s for better UX)
    const timer = setTimeout(() => {
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
      setShowForm(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Credential validation
  const VALID_CREDENTIALS = useMemo(
    () => ({
      MANAGER: {
        username: "1",
        password: "1",
        role: "Manager",
      },
      USER: {
        username: "0",
        password: "0",
        role: "User",
      },
    }),
    []
  );

  // Cache credentials for faster subsequent logins
  const cacheCredentials = async (username, shouldRemember) => {
    try {
      if (shouldRemember) {
        await AsyncStorage.setItem("cachedUsername", username);
      } else {
        await AsyncStorage.removeItem("cachedUsername");
      }
    } catch (error) {
      console.log("Error caching credentials:", error);
    }
  };

  // Handle login
  const handleLogin = useCallback(async () => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      showFeedback({
        type: "error",
        title: "Missing Information",
        message: "Please enter both username and password",
        autoDismiss: true,
      });
      return;
    }

    setIsLoading(true);
    let userRole = null;

    // Validate credentials
    if (
      trimmedUsername === VALID_CREDENTIALS.MANAGER.username &&
      trimmedPassword === VALID_CREDENTIALS.MANAGER.password
    ) {
      userRole = VALID_CREDENTIALS.MANAGER.role;
    } else if (
      trimmedUsername === VALID_CREDENTIALS.USER.username &&
      trimmedPassword === VALID_CREDENTIALS.USER.password
    ) {
      userRole = VALID_CREDENTIALS.USER.role;
    } else {
      setIsLoading(false);
      showFeedback({
        type: "error",
        title: "Login Failed",
        message: "Please check your username and password and try again.",
        autoDismiss: true,
      });
      return;
    }

    try {
      // Use Promise.all for parallel storage operations - performance optimization
      await Promise.all([
        AsyncStorage.setItem("userRole", userRole),
        AsyncStorage.setItem("username", trimmedUsername),
        AsyncStorage.setItem("lastLogin", new Date().toISOString()),
        cacheCredentials(trimmedUsername, rememberMe),
      ]);

      // Pre-fetch some app data before navigation to improve perceived performance
      preloadData();

      // Navigate to main screen
      router.replace("/(app)/main");
    } catch (error) {
      showFeedback({
        type: "error",
        title: "Error",
        message: "Could not save login information. Please try again.",
        autoDismiss: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [username, password, VALID_CREDENTIALS, rememberMe, showFeedback]);

  // Toggle password visibility
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  // Toggle remember me
  const toggleRememberMe = useCallback(() => {
    setRememberMe((prev) => !prev);
  }, []);

  // Memoized styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: isDark ? colors.background : colors.background,
        },
        innerContainer: {
          flex: 1,
          justifyContent: "flex-start",
          paddingHorizontal: 30,
          paddingTop: 100,
        },
        logoContainer: {
          marginTop: 20,
          marginBottom: 10,
          alignItems: "center",
        },
        logo: {
          width: width * 1.2,
          height: width * 0.22,
          marginBottom: 10,
        },
        welcomeText: {
          fontSize: 28,
          fontWeight: "700",
          color: isDark ? colors.text : "#2c3e50",
          textAlign: "center",
          marginBottom: 10,
        },
        welcomeSubText: {
          fontSize: 16,
          color: isDark ? colors.textSecondary : "#7f8c8d",
          textAlign: "center",
          marginBottom: 40,
        },
        companyName: {
          fontSize: 24,
          fontWeight: "bold",
          color: isDark ? colors.primary : colors.primary,
          textAlign: "center",
          marginBottom: 20,
          letterSpacing: 1,
        },
        signInUnderline: {
          height: 2,
          width: 50,
          backgroundColor: colors.primary,
          alignSelf: "center",
          marginBottom: 30,
          borderRadius: 2,
        },
        inputContainer: {
          marginBottom: 15,
        },
        inputLabel: {
          marginLeft: 4,
          marginBottom: 6,
          fontSize: 13,
          color: isDark ? colors.textSecondary : "#555",
          fontWeight: "500",
        },
        input: {
          backgroundColor: isDark ? "rgba(50, 50, 50, 0.8)" : "#f5f6fa",
          padding: 14,
          borderRadius: 12,
          fontSize: 16,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#dcdde1",
          color: isDark ? colors.text : "#000000",
        },
        passwordContainer: {
          position: "relative",
        },
        passwordInput: {
          backgroundColor: isDark ? "rgba(50, 50, 50, 0.8)" : "#f5f6fa",
          padding: 14,
          paddingRight: 50,
          borderRadius: 12,
          fontSize: 16,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#dcdde1",
          color: isDark ? colors.text : "#000000",
        },
        eyeIcon: {
          position: "absolute",
          right: 15,
          top: 12,
          zIndex: 1,
        },
        rememberMeContainer: {
          flexDirection: "row",
          alignItems: "center",
          marginTop: 10,
          marginLeft: 4,
        },
        rememberMeText: {
          color: isDark ? colors.textSecondary : "#555",
          fontSize: 14,
          marginLeft: 8,
        },
        loginButton: {
          backgroundColor: colors.primary,
          padding: 16,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 25,
          shadowColor: isDark ? "#000" : colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.5 : 0.3,
          shadowRadius: 6,
          elevation: 6,
        },
        loginButtonText: {
          color: "#ffffff",
          fontSize: 17,
          fontWeight: "700",
        },
        themeToggle: {
          position: "absolute",
          top: 50,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.05)",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 2,
        },
        themeIcon: {
          color: isDark ? colors.text : "#000000",
        },
        versionContainer: {
          paddingBottom: 20,
          alignItems: "center",
          marginTop: "auto",
        },
        versionText: {
          color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
          fontSize: 12,
        },
      }),
    [isDark, colors, width]
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.container}>
        {/* Theme toggle */}
        <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
          <Ionicons
            name={isDark ? "sunny" : "moon"}
            size={22}
            style={styles.themeIcon}
          />
        </TouchableOpacity>

        {/* Content area */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, marginBottom: 40 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        >
          <View style={styles.innerContainer}>
            {/* Welcome message that fades out */}
            <Animated.View
              style={{
                opacity: showForm
                  ? Animated.subtract(1, formOpacity)
                  : fadeAnim,
                transform: [{ translateY: slideAnim }],
                position: showForm ? "absolute" : "relative",
                alignSelf: "center",
                width: "100%",
                pointerEvents: showForm ? "none" : "auto",
              }}
            >
              <View style={styles.logoContainer}>
                <Image
                  source={require("../../assets/images/logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.welcomeText}>Welcome to CJ Parikh</Text>
              <Text style={styles.welcomeSubText}>Seeds Solutions</Text>
            </Animated.View>

            {/* Login form that fades in */}
            <Animated.View
              style={{
                opacity: formOpacity,
                flex: 1,
                justifyContent: "flex-start",
                display: showForm ? "flex" : "none",
                paddingTop: 0,
              }}
            >
              <View style={styles.logoContainer}>
                <Image
                  source={require("../../assets/images/logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.companyName}>SIGN IN</Text>
              <View style={styles.signInUnderline} />
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  placeholderTextColor={
                    isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"
                  }
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter password"
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => setPassword(password.trim())}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={
                      isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"
                    }
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={togglePasswordVisibility}
                  >
                    <Ionicons
                      name={showPassword ? "eye" : "eye-off"}
                      size={24}
                      color={
                        isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)"
                      }
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Credentials hint */}
              <View style={{ marginTop: 20, alignItems: "center" }}>
                <Text
                  style={{
                    color: isDark ? "#aaa" : "#555",
                    fontSize: 13,
                    textAlign: "center",
                    backgroundColor: isDark ? "#222" : "#f0f0f0",
                    padding: 8,
                    borderRadius: 8,
                    marginHorizontal: 10,
                  }}
                >
                  Manager: <Text style={{ fontWeight: "bold" }}>1 / 1</Text>{" "}
                  {"\n"}
                  User: <Text style={{ fontWeight: "bold" }}>0 / 0</Text>
                </Text>
                <Text style={{ color: "#aaa", fontSize: 11, marginTop: 4 }}>
                  (Username / Password)
                </Text>
              </View>

              {/* Remember me option */}
              <TouchableOpacity
                style={styles.rememberMeContainer}
                onPress={toggleRememberMe}
              >
                <Ionicons
                  name={rememberMe ? "checkbox" : "square-outline"}
                  size={20}
                  color={
                    rememberMe
                      ? colors.primary
                      : isDark
                      ? colors.textSecondary
                      : "#555"
                  }
                />
                <Text style={styles.rememberMeText}>Remember username</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.loginButton, isLoading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={isLoading}
              >
                <Text style={styles.loginButtonText}>
                  {isLoading ? "Logging in..." : "Login"}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>

        {/* Version text fixed at bottom outside KeyboardAvoidingView */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version {APP_VERSION}</Text>
        </View>
      </View>
    </>
  );
};

export default LoginScreen;
