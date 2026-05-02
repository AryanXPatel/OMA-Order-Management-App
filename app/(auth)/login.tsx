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
type DemoRole = "manager" | "user";

const LoginScreen = () => {
  const { width, height } = useWindowDimensions();
  const { colors } = useContext(ThemeContext);
  const { showFeedback } = useFeedback();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [focusedField, setFocusedField] = useState<FieldName>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isWide = width >= 768;
  const shellWidth = Math.min(Math.max(width - 24, 0), 430);

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
    void wakeUpServer().then(() => {
      preloadData();
    });
  }, []);

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

  const isFormReady = username.trim().length > 0 && password.trim().length > 0;

  const selectedDemoRole: DemoRole | null = useMemo(() => {
    if (
      username.trim() === VALID_CREDENTIALS.MANAGER.username &&
      password.trim() === VALID_CREDENTIALS.MANAGER.password
    ) {
      return "manager";
    }

    if (
      username.trim() === VALID_CREDENTIALS.USER.username &&
      password.trim() === VALID_CREDENTIALS.USER.password
    ) {
      return "user";
    }

    return null;
  }, [VALID_CREDENTIALS, password, username]);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setFormError(null);
  }, []);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    setFormError(null);
  }, []);

  const fillDemoCredentials = useCallback(
    (role: DemoRole) => {
      const credentials =
        role === "manager" ? VALID_CREDENTIALS.MANAGER : VALID_CREDENTIALS.USER;

      setUsername(credentials.username);
      setPassword(credentials.password);
      setFormError(null);
    },
    [VALID_CREDENTIALS]
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
      setFormError("Enter both username and password.");
      return;
    }

    setFormError(null);
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
      setFormError("Credentials do not match a demo role.");
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
          backgroundColor: colors.appChrome,
        },
        scrollContent: {
          flexGrow: 1,
          justifyContent: "center",
          paddingBottom: 18,
          paddingHorizontal: isWide ? 28 : 16,
          paddingTop: Platform.OS === "web" ? 18 : 34,
          minHeight: height,
        },
        keyboardFrame: {
          width: "100%",
        },
        shell: {
          alignSelf: "center",
          justifyContent: "center",
          maxWidth: shellWidth,
          width: "100%",
        },
        brandRow: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingHorizontal: 2,
        },
        brandLogo: {
          height: 34,
          width: 132,
        },
        statusPill: {
          alignItems: "center",
          backgroundColor: "rgba(234,179,8,0.12)",
          borderRadius: 999,
          flexDirection: "row",
          gap: 8,
          minHeight: 32,
          paddingHorizontal: 10,
        },
        statusDot: {
          backgroundColor: colors.accentGreen,
          borderRadius: 4,
          height: 8,
          width: 8,
        },
        statusText: {
          color: colors.accentGold,
          fontFamily: omaTypography.bold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        },
        formSurface: {
          backgroundColor: colors.appChromeElevated,
          borderColor: colors.border,
          borderRadius: 28,
          borderWidth: 1,
          overflow: "hidden",
          padding: width < 390 ? 16 : 18,
        },
        formHeaderRow: {
          alignItems: "flex-start",
          flexDirection: "row",
          gap: 14,
          justifyContent: "space-between",
          marginBottom: 16,
        },
        formBadge: {
          alignItems: "center",
          alignSelf: "flex-start",
          backgroundColor: "rgba(234,179,8,0.12)",
          borderRadius: 999,
          flexDirection: "row",
          gap: 6,
          marginBottom: 14,
          paddingHorizontal: 10,
          paddingVertical: 7,
        },
        formBadgeText: {
          color: colors.accentGold,
          fontFamily: omaTypography.bold,
          fontSize: 10,
          letterSpacing: 1.1,
          textTransform: "uppercase",
        },
        formTitle: {
          color: colors.text,
          fontFamily: omaTypography.bold,
          fontSize: width < 390 ? 28 : 30,
          letterSpacing: -0.8,
          lineHeight: width < 390 ? 32 : 35,
          marginBottom: 8,
        },
        formCopy: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 14,
          letterSpacing: -0.25,
          lineHeight: 20,
          maxWidth: 280,
        },
        demoCard: {
          backgroundColor: "rgba(255,255,255,0.05)",
          borderColor: colors.border,
          borderRadius: 22,
          borderWidth: 1,
          marginBottom: 18,
          overflow: "hidden",
        },
        demoCardLabel: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.bold,
          fontSize: 10,
          letterSpacing: 1.1,
          paddingHorizontal: 14,
          paddingTop: 14,
          textTransform: "uppercase",
        },
        demoRow: {
          alignItems: "center",
          borderTopColor: "rgba(255,255,255,0.07)",
          borderTopWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 60,
          paddingHorizontal: 14,
          paddingVertical: 10,
        },
        demoRowSelected: {
          backgroundColor: "rgba(234,179,8,0.08)",
          borderTopColor: "rgba(234,179,8,0.16)",
        },
        demoRoleWrap: {
          alignItems: "center",
          flex: 1,
          flexDirection: "row",
          gap: 12,
          minWidth: 0,
        },
        demoIconWrap: {
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.07)",
          borderRadius: 18,
          height: 36,
          justifyContent: "center",
          width: 36,
        },
        demoRoleTitle: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 15,
          letterSpacing: -0.25,
        },
        demoRoleHint: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 13,
          letterSpacing: -0.2,
          lineHeight: 18,
          marginTop: 2,
        },
        demoValueChip: {
          backgroundColor: "rgba(255,255,255,0.06)",
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 7,
        },
        demoValueText: {
          color: colors.text,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
        },
        fieldGroup: {
          gap: 12,
        },
        fieldBlock: {
          gap: 6,
        },
        fieldLabel: {
          color: "rgba(255,255,255,0.78)",
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          letterSpacing: -0.2,
          paddingHorizontal: 2,
        },
        inputShell: {
          alignItems: "center",
          backgroundColor: colors.appChromeMuted,
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: 18,
          borderWidth: 1,
          flexDirection: "row",
          gap: 12,
          minHeight: 54,
          paddingLeft: 15,
          paddingRight: 8,
        },
        inputShellFocused: {
          backgroundColor: "rgba(234,179,8,0.08)",
          borderColor: colors.accentGold,
        },
        inputIconWrap: {
          alignItems: "center",
          width: 26,
        },
        input: {
          color: colors.text,
          flex: 1,
          fontFamily: omaTypography.medium,
          fontSize: 16,
          minHeight: 52,
          paddingVertical: 0,
        },
        fieldHelp: {
          color: "rgba(255,255,255,0.44)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
          letterSpacing: -0.15,
          lineHeight: 16,
          paddingHorizontal: 2,
        },
        passwordAction: {
          alignItems: "center",
          borderRadius: 20,
          height: 40,
          justifyContent: "center",
          width: 40,
        },
        formError: {
          alignItems: "center",
          backgroundColor: "rgba(248,113,113,0.12)",
          borderRadius: 16,
          flexDirection: "row",
          gap: 10,
          marginTop: 14,
          paddingHorizontal: 12,
          paddingVertical: 11,
        },
        formErrorText: {
          color: colors.accentRed,
          flex: 1,
          fontFamily: omaTypography.semibold,
          fontSize: 13,
          letterSpacing: -0.2,
          lineHeight: 18,
        },
        rememberRow: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 14,
          paddingTop: 10,
        },
        rememberTouch: {
          alignItems: "center",
          flexDirection: "row",
          gap: 10,
          minHeight: 44,
          paddingRight: 16,
        },
        rememberIconWrap: {
          alignItems: "center",
          height: 24,
          justifyContent: "center",
          width: 24,
        },
        rememberText: {
          color: colors.text,
          fontFamily: omaTypography.medium,
          fontSize: 14,
        },
        rememberHint: {
          color: "rgba(255,255,255,0.42)",
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        loginButton: {
          alignItems: "center",
          backgroundColor: "#ffffff",
          borderRadius: 20,
          justifyContent: "center",
          minHeight: 54,
        },
        loginButtonDisabled: {
          opacity: 0.42,
        },
        loginButtonContent: {
          alignItems: "center",
          flexDirection: "row",
          gap: 10,
          justifyContent: "center",
        },
        loginButtonText: {
          color: "#111111",
          fontFamily: omaTypography.semibold,
          fontSize: 16,
          letterSpacing: -0.2,
        },
        formFooter: {
          alignItems: isWide ? "center" : "flex-start",
          flexDirection: isWide ? "row" : "column",
          gap: 8,
          justifyContent: "space-between",
          marginTop: 14,
        },
        footerPrimary: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
        footerSecondary: {
          color: colors.textSecondary,
          fontFamily: omaTypography.medium,
          fontSize: 12,
        },
      }),
    [colors, height, isWide, shellWidth, width]
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
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
              <View style={styles.brandRow}>
                <Image
                  resizeMode="contain"
                  source={require("../../assets/images/logo.png")}
                  style={styles.brandLogo}
                />
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Demo ready</Text>
                </View>
              </View>

              <View style={styles.formSurface}>
                <View style={styles.formHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.formBadge}>
                      <Ionicons
                        color={colors.accentGold}
                        name="lock-closed-outline"
                        size={13}
                      />
                      <Text style={styles.formBadgeText}>Secure sign in</Text>
                    </View>
                    <Text style={styles.formTitle}>Welcome to OMA</Text>
                    <Text style={styles.formCopy}>
                      Enter the order workspace for approvals, dispatch, clients,
                      and live order creation.
                    </Text>
                  </View>

                </View>

                <View style={styles.demoCard}>
                  <Text style={styles.demoCardLabel}>Quick demo access</Text>

                  <TouchableOpacity
                    accessibilityLabel="Fill manager demo credentials"
                    accessibilityRole="button"
                    activeOpacity={0.86}
                    onPress={() => fillDemoCredentials("manager")}
                    style={[
                      styles.demoRow,
                      selectedDemoRole === "manager" && styles.demoRowSelected,
                    ]}
                  >
                    <View style={styles.demoRoleWrap}>
                      <View style={styles.demoIconWrap}>
                        <Ionicons
                          color={colors.accentGold}
                          name="briefcase-outline"
                          size={16}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.demoRoleTitle}>Manager</Text>
                        <Text numberOfLines={1} style={styles.demoRoleHint}>
                          Approvals, analytics, and order control
                        </Text>
                      </View>
                    </View>
                    <View style={styles.demoValueChip}>
                      <Text style={styles.demoValueText}>1 / 1</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityLabel="Fill user demo credentials"
                    accessibilityRole="button"
                    activeOpacity={0.86}
                    onPress={() => fillDemoCredentials("user")}
                    style={[
                      styles.demoRow,
                      selectedDemoRole === "user" && styles.demoRowSelected,
                    ]}
                  >
                    <View style={styles.demoRoleWrap}>
                      <View style={styles.demoIconWrap}>
                        <Ionicons
                          color={colors.accentGreen}
                          name="person-outline"
                          size={16}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.demoRoleTitle}>User</Text>
                        <Text numberOfLines={1} style={styles.demoRoleHint}>
                          New orders and daily execution
                        </Text>
                      </View>
                    </View>
                    <View style={styles.demoValueChip}>
                      <Text style={styles.demoValueText}>0 / 0</Text>
                    </View>
                  </TouchableOpacity>
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
                              ? colors.accentGold
                              : colors.textSecondary
                          }
                          name="person-outline"
                          size={18}
                        />
                      </View>
                      <TextInput
                        accessibilityHint="Use 1 for manager or 0 for user."
                        accessibilityLabel="Username"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="default"
                        onBlur={() =>
                          setFocusedField((current) =>
                            current === "username" ? null : current
                          )
                        }
                        onChangeText={handleUsernameChange}
                        onFocus={() => setFocusedField("username")}
                        placeholder="0 or 1"
                        placeholderTextColor={colors.textPlaceholder}
                        returnKeyType="next"
                        style={styles.input}
                        textContentType="username"
                        value={username}
                      />
                    </View>
                    <Text style={styles.fieldHelp}>
                      Manager uses 1. User uses 0.
                    </Text>
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
                              ? colors.accentGold
                              : colors.textSecondary
                          }
                          name="lock-closed-outline"
                          size={18}
                        />
                      </View>
                      <TextInput
                        accessibilityHint="Use the matching password for the selected demo role."
                        accessibilityLabel="Password"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onBlur={() => {
                          setFocusedField((current) =>
                            current === "password" ? null : current
                          );
                          setPassword((current) => current.trim());
                        }}
                        onChangeText={handlePasswordChange}
                        onFocus={() => setFocusedField("password")}
                        onSubmitEditing={handleLogin}
                        placeholder="0 or 1"
                        placeholderTextColor={colors.textPlaceholder}
                        returnKeyType="go"
                        secureTextEntry={!showPassword}
                        style={styles.input}
                        textContentType="password"
                        value={password}
                      />
                      <TouchableOpacity
                        accessibilityLabel={
                          showPassword ? "Hide password" : "Show password"
                        }
                        accessibilityRole="button"
                        activeOpacity={0.7}
                        hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                        onPress={togglePasswordVisibility}
                        style={styles.passwordAction}
                      >
                        <Ionicons
                          color={
                            showPassword ? colors.accentGold : colors.textSecondary
                          }
                          name={showPassword ? "eye-outline" : "eye-off-outline"}
                          size={20}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.fieldHelp}>
                      Password matches the role: 1 for manager, 0 for user.
                    </Text>
                  </View>
                </View>

                {formError ? (
                  <View accessibilityRole="alert" style={styles.formError}>
                    <Ionicons
                      color={colors.accentRed}
                      name="alert-circle-outline"
                      size={18}
                    />
                    <Text style={styles.formErrorText}>{formError}</Text>
                  </View>
                ) : null}

                <View style={styles.rememberRow}>
                  <TouchableOpacity
                    accessibilityLabel="Remember username"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    activeOpacity={0.75}
                    onPress={toggleRememberMe}
                    style={styles.rememberTouch}
                  >
                    <View style={styles.rememberIconWrap}>
                      <Ionicons
                        color={rememberMe ? colors.accentGold : colors.textSecondary}
                        name={rememberMe ? "checkbox-outline" : "square-outline"}
                        size={22}
                      />
                    </View>
                    <Text style={styles.rememberText}>Remember username</Text>
                  </TouchableOpacity>

                  <Text style={styles.rememberHint}>Demo credentials</Text>
                </View>

                <TouchableOpacity
                  accessibilityLabel="Enter OMA"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: isLoading,
                    disabled: !isFormReady || isLoading,
                  }}
                  activeOpacity={0.88}
                  disabled={!isFormReady || isLoading}
                  onPress={handleLogin}
                  style={[
                    styles.loginButton,
                    (!isFormReady || isLoading) && styles.loginButtonDisabled,
                  ]}
                >
                  <View style={styles.loginButtonContent}>
                    {isLoading ? (
                      <ActivityIndicator color="#111111" size="small" />
                    ) : (
                      <Ionicons
                        color="#111111"
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
                  <Text style={styles.footerSecondary}>Version {APP_VERSION}</Text>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </ScrollView>
      </View>
    </>
  );
};

export default LoginScreen;


