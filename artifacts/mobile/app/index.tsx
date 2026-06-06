import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { login } from "@/services/api";

const SESSION_KEY = "miaoucratie:admin-token:v1";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!password.trim()) {
      setError("Merci de renseigner votre mot de passe.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const token = await login(password.trim());
      await AsyncStorage.setItem(SESSION_KEY, token);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/agenda");
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  const styles = makeStyles(colors);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logo Miaoucratie"
          />
          <Text style={styles.brand}>Miaoucratie</Text>
          <Text style={styles.subtitle}>Gestion des indisponibilités</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>🔒  ACCÈS PROTÉGÉ</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>Se connecter</Text>
          <Text style={styles.cardDesc}>
            Saisissez le mot de passe administrateur pour gérer vos
            indisponibilités.
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Mot de passe admin"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError("");
            }}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            testID="password-input"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 32,
    },
    logo: {
      width: 96,
      height: 96,
      marginBottom: 14,
    },
    brand: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 40,
      lineHeight: 44,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mid,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      padding: 24,
      shadowColor: "#1E1812",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 16,
      elevation: 4,
    },
    pillRow: {
      marginBottom: 16,
    },
    pill: {
      alignSelf: "flex-start",
      backgroundColor: "rgba(168, 71, 42, 0.09)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    pillText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 11,
      color: colors.primary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    cardTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 30,
      color: colors.foreground,
      marginBottom: 6,
    },
    cardDesc: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mid,
      lineHeight: 20,
      marginBottom: 20,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: "DMSans_400Regular",
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
      marginBottom: 8,
    },
    inputError: {
      borderColor: colors.destructive,
    },
    errorText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.destructive,
      marginBottom: 12,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 16,
      color: colors.primaryForeground,
    },
  });
}
