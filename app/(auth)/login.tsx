import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppIcon as Ionicons } from "@/components/AppIcon";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useFeedback } from "@/context/FeedbackContext";
import { ThemeContext } from "@/context/ThemeContext";
import { wakeUpServer, preloadData } from "@/utils/apiManager";
import { omaTypography } from "@/utils/typography";

const APP_VERSION = "2.4.0";

type FieldName = "username" | "password" | null;

const LoginScreen = () => {
  const { width, height } = useWindowDimensions();
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [focusedField, setFocusedField] = useState<FieldName>(null);

  const isDark = theme === "dark";
  const isWide = width >= 768;
  const shellWidth = Math.min(Math.max(width - 24, 0), 460);

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;
  const formOpacity = React.useRef(new Animated.Value(0)).current;
  const shouldUseNativeDriver = Platform.OS !== "web";

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
  }, [showFeedback]);

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

  useEffect(() => {
    wakeUpServer().then(() => {
      preloadData();
    });

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: shouldUseNativeDriver,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 900,
        useNativeDriver: shouldUseNativeDriver,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: shouldUseNativeDriver,
      }).start();
      setShowForm(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [fadeAnim, formOpacity, slideAnim, shouldUseNativeDriver]);

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

  const cacheCredentials = async (
    nextUsername: string,
    shouldRemember: boolean
  ) => {
    try {
      if (shouldRemember) {
        await AsyncStorage.setItem("cachedUsername", nextUsername);
      } else {
        await AsyncStorage.removeItem("cachedUsername");
      }
    } catch (error) {
      console.log("Error caching credentials:", error);
    }
  };

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
    let userRole: string | null = null;

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
      await Promise.all([
        AsyncStorage.setItem("userRole", userRole),
        AsyncStorage.setItem("username", trimmedUsername),
        AsyncStorage.setItem("lastLogin", new Date().toISOString()),
        cacheCredentials(trimmedUsername, rememberMe),
      ]);

      preloadData();
      router.replace("/(app)/main");
    } catch {
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

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const toggleRememberMe = useCallback(() => {
    setRememberMe((prev) => !prev);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        ambientOrbPrimary: {
          position: "absolute",
          top: -110,
          right: -80,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: isDark
            ? "rgba(0, 102, 255, 0.24)"
            : "rgba(0, 102, 255, 0.12)",
        },
        ambientOrbSecondary: {
          position: "absolute",
          bottom: -140,
          left: -90,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: isDark
            ? "rgba(34, 197, 94, 0.14)"
            : "rgba(12, 26, 46, 0.05)",
        },
        ambientHalo: {
          position: "absolute",
          top: 120,
          left: "10%",
          width: "80%",
          height: 180,
          borderRadius: 90,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.03)"
            : "rgba(255,255,255,0.55)",
        },
        themeToggle: {
          position: "absolute",
          top: Platform.OS === "web" ? 22 : 54,
          right: isWide ? 28 : 18,
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: isDark
            ? "rgba(16, 26, 43, 0.76)"
            : "rgba(255, 255, 255, 0.8)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.92)",
          justifyContent: "center",
          alignItems: "center",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 10,
          zIndex: 5,
        },
        scrollContent: {
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: isWide ? 48 : 28,
          paddingBottom: 24,
          paddingHorizontal: 12,
          minHeight: height,
        },
        keyboardFrame: {
          width: "100%",
        },
        shell: {
          width: "100%",
          maxWidth: shellWidth,
          alignSelf: "center",
          minHeight: isWide ? 760 : 700,
          justifyContent: "center",
        },
        heroSurface: {
          backgroundColor: isDark
            ? "rgba(16, 26, 43, 0.84)"
            : "rgba(255, 255, 255, 0.88)",
          borderRadius: 32,
          paddingHorizontal: width < 390 ? 20 : 24,
          paddingVertical: width < 390 ? 22 : 26,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.94)",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 32,
          elevation: 14,
          overflow: "hidden",
        },
        heroGlowPrimary: {
          position: "absolute",
          top: -44,
          right: -28,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: isDark
            ? "rgba(0, 102, 255, 0.28)"
            : "rgba(0, 102, 255, 0.14)",
        },
        heroGlowSecondary: {
          position: "absolute",
          bottom: -70,
          left: -30,
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(12, 26, 46, 0.06)",
        },
        heroBadge: {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.72)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.94)",
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginBottom: 18,
          gap: 8,
        },
        heroBadgeText: {
          color: colors.text,
          fontSize: 11,
          fontFamily: omaTypography.semibold,
          textTransform: "uppercase",
          letterSpacing: 1.2,
        },
        logoLockup: {
          width: width < 390 ? 150 : 176,
          height: 42,
          marginBottom: 18,
        },
        heroEyebrow: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          textTransform: "uppercase",
          letterSpacing: 1.8,
          marginBottom: 10,
        },
        heroTitle: {
          color: colors.text,
          fontSize: isWide ? 36 : width < 390 ? 29 : 32,
          lineHeight: isWide ? 42 : width < 390 ? 34 : 38,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -1,
          marginBottom: 12,
          maxWidth: 320,
        },
        heroCopy: {
          color: colors.textSecondary,
          fontSize: 15,
          lineHeight: 23,
          fontFamily: omaTypography.medium,
          marginBottom: 18,
          maxWidth: 320,
        },
        heroHighlights: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        heroChip: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 18,
          backgroundColor: isDark
            ? "rgba(9, 17, 31, 0.54)"
            : "rgba(255,255,255,0.78)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(231,236,243,0.9)",
        },
        heroChipText: {
          color: colors.text,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
        },
        formSurface: {
          backgroundColor: isDark
            ? "rgba(16, 26, 43, 0.9)"
            : "rgba(255, 255, 255, 0.94)",
          borderRadius: 32,
          paddingHorizontal: width < 390 ? 20 : 24,
          paddingTop: width < 390 ? 22 : 26,
          paddingBottom: 20,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.96)",
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 1,
          shadowRadius: 32,
          elevation: 14,
          overflow: "hidden",
        },
        formGlow: {
          position: "absolute",
          top: -40,
          right: -25,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: isDark
            ? "rgba(0, 102, 255, 0.18)"
            : "rgba(0, 102, 255, 0.1)",
        },
        formHeaderRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 20,
        },
        formBadge: {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          backgroundColor: isDark
            ? "rgba(0, 102, 255, 0.14)"
            : "rgba(0, 102, 255, 0.08)",
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 999,
          gap: 6,
          marginBottom: 14,
        },
        formBadgeText: {
          color: colors.primary,
          fontSize: 11,
          fontFamily: omaTypography.semibold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        },
        formTitle: {
          color: colors.text,
          fontSize: width < 390 ? 26 : 28,
          lineHeight: width < 390 ? 30 : 34,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.8,
          marginBottom: 8,
        },
        formCopy: {
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 22,
          fontFamily: omaTypography.medium,
          maxWidth: 260,
        },
        formLogo: {
          width: 112,
          height: 28,
          marginTop: 4,
          opacity: isDark ? 0.95 : 0.9,
        },
        demoCard: {
          backgroundColor: isDark
            ? "rgba(9, 17, 31, 0.52)"
            : "rgba(247, 248, 249, 0.96)",
          borderRadius: 24,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 18,
          gap: 10,
        },
        demoCardLabel: {
          color: colors.textSecondary,
          fontSize: 11,
          fontFamily: omaTypography.semibold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        },
        demoRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        },
        demoRoleWrap: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flex: 1,
        },
        demoIconWrap: {
          width: 34,
          height: 34,
          borderRadius: 17,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.82)",
        },
        demoRoleTitle: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.semibold,
        },
        demoRoleHint: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
          marginTop: 2,
        },
        demoValueChip: {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.86)",
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 14,
        },
        demoValueText: {
          color: colors.text,
          fontSize: 13,
          fontFamily: omaTypography.semibold,
        },
        fieldGroup: {
          gap: 14,
        },
        fieldBlock: {
          gap: 8,
        },
        fieldLabel: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          paddingHorizontal: 2,
        },
        inputShell: {
          minHeight: 58,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark
            ? "rgba(9, 17, 31, 0.64)"
            : "rgba(247, 248, 249, 0.98)",
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 16,
          paddingRight: 10,
          gap: 12,
        },
        inputShellFocused: {
          borderColor: colors.primary,
          backgroundColor: isDark
            ? "rgba(0, 102, 255, 0.1)"
            : "rgba(0, 102, 255, 0.04)",
        },
        inputIconWrap: {
          width: 26,
          alignItems: "center",
        },
        input: {
          flex: 1,
          minHeight: 56,
          color: colors.text,
          fontSize: 16,
          fontFamily: omaTypography.medium,
          paddingVertical: 0,
        },
        passwordAction: {
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: "center",
          alignItems: "center",
        },
        rememberRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 6,
          marginBottom: 18,
        },
        rememberTouch: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 6,
          paddingRight: 16,
        },
        rememberIconWrap: {
          width: 24,
          height: 24,
          justifyContent: "center",
          alignItems: "center",
        },
        rememberText: {
          color: colors.text,
          fontSize: 14,
          fontFamily: omaTypography.medium,
        },
        rememberHint: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        loginButton: {
          minHeight: 58,
          borderRadius: 20,
          backgroundColor: isDark ? colors.primary : "#111111",
          justifyContent: "center",
          alignItems: "center",
          shadowColor: isDark ? colors.primary : colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.35,
          shadowRadius: 24,
          elevation: 8,
        },
        loginButtonDisabled: {
          opacity: 0.72,
        },
        loginButtonContent: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        },
        loginButtonText: {
          color: "#ffffff",
          fontSize: 16,
          fontFamily: omaTypography.semibold,
          letterSpacing: 0.2,
        },
        formFooter: {
          marginTop: 18,
          flexDirection: isWide ? "row" : "column",
          alignItems: isWide ? "center" : "flex-start",
          justifyContent: "space-between",
          gap: 8,
        },
        footerPrimary: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        footerSecondary: {
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
        },
        versionText: {
          textAlign: "center",
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.medium,
          marginTop: 16,
          opacity: 0.85,
        },
      }),
    [colors, height, isDark, isWide, shellWidth, width]
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.container}>
        <View style={styles.ambientOrbPrimary} pointerEvents="none" />
        <View style={styles.ambientOrbSecondary} pointerEvents="none" />
        <View style={styles.ambientHalo} pointerEvents="none" />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleTheme}
          style={styles.themeToggle}
        >
          <Ionicons
            color={isDark ? colors.text : colors.navActive}
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={21}
          />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 32 : 0}
            style={styles.keyboardFrame}
          >
            <View style={styles.shell}>
              <Animated.View
                pointerEvents={showForm ? "none" : "auto"}
                style={{
                  opacity: showForm ? Animated.subtract(1, formOpacity) : fadeAnim,
                  transform: [{ translateY: slideAnim }],
                  position: showForm ? "absolute" : "relative",
                  top: 0,
                  left: 0,
                  right: 0,
                }}
              >
                <View style={styles.heroSurface}>
                  <View style={styles.heroGlowPrimary} pointerEvents="none" />
                  <View style={styles.heroGlowSecondary} pointerEvents="none" />

                  <View style={styles.heroBadge}>
                    <Ionicons
                      color={colors.primary}
                      name="sparkles-outline"
                      size={14}
                    />
                    <Text style={styles.heroBadgeText}>Order Command Center</Text>
                  </View>

                  <Image
                    resizeMode="contain"
                    source={require("../../assets/images/logo.png")}
                    style={styles.logoLockup}
                  />

                  <Text style={styles.heroEyebrow}>Prototype-Driven Redesign</Text>
                  <Text style={styles.heroTitle}>
                    A calmer way to enter the OMA workspace.
                  </Text>
                  <Text style={styles.heroCopy}>
                    Sign in to review approvals, create orders, and keep dispatch
                    moving from a single premium mobile shell.
                  </Text>

                  <View style={styles.heroHighlights}>
                    <View style={styles.heroChip}>
                      <Ionicons
                        color={colors.accentGreen}
                        name="checkmark-circle-outline"
                        size={16}
                      />
                      <Text style={styles.heroChipText}>Mobile-first targets</Text>
                    </View>
                    <View style={styles.heroChip}>
                      <Ionicons
                        color={colors.accentBlue}
                        name="shield-checkmark-outline"
                        size={16}
                      />
                      <Text style={styles.heroChipText}>Secure demo access</Text>
                    </View>
                    <View style={styles.heroChip}>
                      <Ionicons
                        color={colors.accentOrange}
                        name="flash-outline"
                        size={16}
                      />
                      <Text style={styles.heroChipText}>Warm-up in progress</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <Animated.View
                style={{
                  opacity: formOpacity,
                  display: showForm ? "flex" : "none",
                }}
              >
                <View style={styles.formSurface}>
                  <View style={styles.formGlow} pointerEvents="none" />

                  <View style={styles.formHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.formBadge}>
                        <Ionicons
                          color={colors.primary}
                          name="lock-closed-outline"
                          size={13}
                        />
                        <Text style={styles.formBadgeText}>Secure Sign In</Text>
                      </View>
                      <Text style={styles.formTitle}>Welcome back</Text>
                      <Text style={styles.formCopy}>
                        Use your demo role credentials to enter the redesigned OMA
                        workspace.
                      </Text>
                    </View>

                    <Image
                      resizeMode="contain"
                      source={require("../../assets/images/logo.png")}
                      style={styles.formLogo}
                    />
                  </View>

                  <View style={styles.demoCard}>
                    <Text style={styles.demoCardLabel}>Demo Access</Text>

                    <View style={styles.demoRow}>
                      <View style={styles.demoRoleWrap}>
                        <View style={styles.demoIconWrap}>
                          <Ionicons
                            color={colors.accentBlue}
                            name="briefcase-outline"
                            size={16}
                          />
                        </View>
                        <View>
                          <Text style={styles.demoRoleTitle}>Manager</Text>
                          <Text style={styles.demoRoleHint}>
                            Approval and control workspace
                          </Text>
                        </View>
                      </View>
                      <View style={styles.demoValueChip}>
                        <Text style={styles.demoValueText}>1 / 1</Text>
                      </View>
                    </View>

                    <View style={styles.demoRow}>
                      <View style={styles.demoRoleWrap}>
                        <View style={styles.demoIconWrap}>
                          <Ionicons
                            color={colors.accentGreen}
                            name="person-outline"
                            size={16}
                          />
                        </View>
                        <View>
                          <Text style={styles.demoRoleTitle}>User</Text>
                          <Text style={styles.demoRoleHint}>
                            Order creation and daily execution
                          </Text>
                        </View>
                      </View>
                      <View style={styles.demoValueChip}>
                        <Text style={styles.demoValueText}>0 / 0</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Username</Text>
                      <View
                        style={[
                          styles.inputShell,
                          focusedField === "username" && styles.inputShellFocused,
                        ]}
                      >
                        <View style={styles.inputIconWrap}>
                          <Ionicons
                            color={
                              focusedField === "username"
                                ? colors.primary
                                : colors.textSecondary
                            }
                            name="person-outline"
                            size={18}
                          />
                        </View>
                        <TextInput
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="default"
                          onBlur={() =>
                            setFocusedField((current) =>
                              current === "username" ? null : current
                            )
                          }
                          onChangeText={setUsername}
                          onFocus={() => setFocusedField("username")}
                          placeholder="Enter username"
                          placeholderTextColor={colors.textPlaceholder}
                          returnKeyType="next"
                          style={styles.input}
                          textContentType="username"
                          value={username}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.fieldLabel}>Password</Text>
                      <View
                        style={[
                          styles.inputShell,
                          focusedField === "password" && styles.inputShellFocused,
                        ]}
                      >
                        <View style={styles.inputIconWrap}>
                          <Ionicons
                            color={
                              focusedField === "password"
                                ? colors.primary
                                : colors.textSecondary
                            }
                            name="lock-closed-outline"
                            size={18}
                          />
                        </View>
                        <TextInput
                          autoCapitalize="none"
                          autoCorrect={false}
                          onBlur={() => {
                            setFocusedField((current) =>
                              current === "password" ? null : current
                            );
                            setPassword((current) => current.trim());
                          }}
                          onChangeText={setPassword}
                          onFocus={() => setFocusedField("password")}
                          onSubmitEditing={handleLogin}
                          placeholder="Enter password"
                          placeholderTextColor={colors.textPlaceholder}
                          returnKeyType="go"
                          secureTextEntry={!showPassword}
                          style={styles.input}
                          textContentType="password"
                          value={password}
                        />
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={togglePasswordVisibility}
                          style={styles.passwordAction}
                        >
                          <Ionicons
                            color={
                              showPassword ? colors.primary : colors.textSecondary
                            }
                            name={showPassword ? "eye-outline" : "eye-off-outline"}
                            size={20}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.rememberRow}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={toggleRememberMe}
                      style={styles.rememberTouch}
                    >
                      <View style={styles.rememberIconWrap}>
                        <Ionicons
                          color={
                            rememberMe ? colors.primary : colors.textSecondary
                          }
                          name={
                            rememberMe ? "checkbox-outline" : "square-outline"
                          }
                          size={22}
                        />
                      </View>
                      <Text style={styles.rememberText}>Remember username</Text>
                    </TouchableOpacity>

                    <Text style={styles.rememberHint}>Username / Password</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={isLoading}
                    onPress={handleLogin}
                    style={[
                      styles.loginButton,
                      isLoading && styles.loginButtonDisabled,
                    ]}
                  >
                    <View style={styles.loginButtonContent}>
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Ionicons
                          color="#ffffff"
                          name="arrow-forward-outline"
                          size={18}
                        />
                      )}
                      <Text style={styles.loginButtonText}>
                        {isLoading ? "Logging in..." : "Enter OMA"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.formFooter}>
                    <Text style={styles.footerPrimary}>
                      Seeds Solutions order workspace
                    </Text>
                    <Text style={styles.footerSecondary}>
                      Optimized for phone, tablet, and web
                    </Text>
                  </View>
                </View>

                <Text style={styles.versionText}>Version {APP_VERSION}</Text>
              </Animated.View>
            </View>
          </KeyboardAvoidingView>
        </ScrollView>
      </View>
    </>
  );
};

export default LoginScreen;


