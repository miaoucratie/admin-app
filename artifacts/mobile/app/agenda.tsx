import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  DayEvent,
  fetchDayEvents,
  formatLongDateFr,
} from "@/services/api";

const SESSION_KEY = "miaoucratie:admin-token:v1";

// "Today" is always evaluated in Europe/Paris so the agenda matches the
// calendar's timezone regardless of the device's location.
function todayIso(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, "0");
  const nd = String(dt.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

interface Category {
  label: string;
  emoji: string;
  /** translucent background + solid text accent, harmonised with the warm palette */
  bg: string;
  fg: string;
}

// Ordered by priority: the first matching pattern wins (e.g. "PV … + Remise des
// clés" is classified as a pré-visite).
const CATEGORIES: { test: RegExp; cat: Category }[] = [
  {
    test: /\bgarde\b/i,
    cat: { label: "Garde", emoji: "🐾", bg: "rgba(168,71,42,0.12)", fg: "#A8472A" },
  },
  {
    test: /\bpv\b|pr[ée]-?visite|previsite/i,
    cat: { label: "Pré-visite", emoji: "👀", bg: "rgba(62,125,107,0.14)", fg: "#357061" },
  },
  {
    test: /cl[ée]s/i,
    cat: { label: "Clés", emoji: "🔑", bg: "rgba(176,137,42,0.16)", fg: "#9A7420" },
  },
  {
    test: /formation/i,
    cat: { label: "Formation", emoji: "🎓", bg: "rgba(123,75,110,0.14)", fg: "#7B4B6E" },
  },
  {
    test: /vacances|cong[ée]|holiday|vacation/i,
    cat: { label: "Vacances", emoji: "🏖️", bg: "rgba(58,125,150,0.14)", fg: "#2F6E86" },
  },
];

function classify(summary: string): Category | null {
  for (const { test, cat } of CATEGORIES) {
    if (test.test(summary)) return cat;
  }
  return null;
}

interface EventCardProps {
  event: DayEvent;
}

function EventCard({ event }: EventCardProps) {
  const colors = useColors();
  const category = classify(event.summary);
  const s = StyleSheet.create({
    card: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      padding: 16,
      marginBottom: 10,
      shadowColor: "#1E1812",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    timeCol: {
      width: 64,
      alignItems: "flex-start",
      justifyContent: "flex-start",
      paddingRight: 12,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      marginRight: 14,
    },
    startTime: {
      fontFamily: "DMSans_700Bold",
      fontSize: 16,
      color: colors.foreground,
    },
    endTime: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    allDayBadge: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 10,
      color: colors.primary,
      letterSpacing: 0.6,
    },
    body: { flex: 1 },
    titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    summary: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 16,
      color: colors.foreground,
      flexShrink: 1,
    },
    tag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    tagText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    location: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mid,
      marginTop: 6,
    },
    locationLink: { color: colors.primary, textDecorationLine: "underline" },
  });

  const isUrl = event.location ? /^https?:\/\//i.test(event.location) : false;

  return (
    <View style={s.card}>
      <View style={s.timeCol}>
        {event.allDay ? (
          <Text style={s.allDayBadge}>JOUR{"\n"}ENTIER</Text>
        ) : (
          <>
            <Text style={s.startTime}>{event.startTime}</Text>
            <Text style={s.endTime}>{event.endTime}</Text>
          </>
        )}
      </View>
      <View style={s.body}>
        <View style={s.titleRow}>
          <Text style={s.summary}>{event.summary}</Text>
          {category && (
            <View style={[s.tag, { backgroundColor: category.bg }]}>
              <Text style={[s.tagText, { color: category.fg }]}>
                {category.emoji} {category.label}
              </Text>
            </View>
          )}
        </View>
        {event.location ? (
          isUrl ? (
            <Text
              style={[s.location, s.locationLink]}
              numberOfLines={1}
              onPress={() => Linking.openURL(event.location as string)}
            >
              {event.location}
            </Text>
          ) : (
            <Text style={s.location}>📍 {event.location}</Text>
          )
        ) : null}
      </View>
    </View>
  );
}

export default function AgendaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then((t) => {
      if (t) setToken(t);
      else router.replace("/");
    });
  }, []);

  const load = useCallback(
    async (d: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDayEvents(token, d);
        setEvents(data.events);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "SESSION_EXPIRED") {
          await AsyncStorage.removeItem(SESSION_KEY);
          router.replace("/");
          return;
        }
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) load(date);
  }, [token, date]);

  async function goPrev() {
    await Haptics.selectionAsync();
    setDate((d) => shiftIso(d, -1));
  }
  async function goNext() {
    await Haptics.selectionAsync();
    setDate((d) => shiftIso(d, 1));
  }
  async function goToday() {
    await Haptics.selectionAsync();
    setDate(todayIso());
  }
  async function handleLogout() {
    await AsyncStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  const styles = makeStyles(colors);
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const botPad = Platform.OS === "web" ? insets.bottom + 34 : insets.bottom;
  const isToday = date === todayIso();

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEye}>Agenda Miaoucratie</Text>
          <Text style={styles.headerTitle}>Mon programme</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => load(date)}
            hitSlop={8}
          >
            <Text style={styles.iconBtnText}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleLogout}
            hitSlop={8}
          >
            <Text style={styles.iconBtnText}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navArrow} onPress={goPrev} hitSlop={8}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>{formatLongDateFr(date)}</Text>
          {!isToday && (
            <TouchableOpacity onPress={goToday} hitSlop={6}>
              <Text style={styles.todayLink}>Revenir à aujourd'hui</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.navArrow} onPress={goNext} hitSlop={8}>
          <Text style={styles.navArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: botPad + 110 }]}
          ListHeaderComponent={
            <Text style={styles.count}>
              {events.length === 0
                ? "Rien de prévu"
                : `${events.length} événement${events.length > 1 ? "s" : ""}`}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🐱</Text>
              <Text style={styles.emptyTitle}>Journée libre</Text>
              <Text style={styles.emptyDesc}>
                Aucune garde ni rendez-vous ce jour-là.
              </Text>
            </View>
          }
          renderItem={({ item }) => <EventCard event={item} />}
        />
      )}

      <View style={[styles.fabWrap, { bottom: botPad + 24 }]}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/manage")}
        >
          <Text style={styles.fabText}>📅</Text>
          <Text style={styles.fabLabel}>Indisponibilités</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 14,
      paddingTop: 8,
      backgroundColor: colors.background,
    },
    headerTitleWrap: { flex: 1, marginRight: 12 },
    headerEye: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: colors.primary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    headerTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 26,
      color: colors.foreground,
      marginTop: 2,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnText: {
      fontSize: 18,
      color: colors.primary,
      fontFamily: "DMSans_700Bold",
    },
    dateNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginBottom: 4,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      shadowColor: "#1E1812",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 1,
    },
    navArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.secondary,
    },
    navArrowText: {
      fontSize: 22,
      color: colors.primary,
      fontFamily: "DMSans_700Bold",
      lineHeight: 26,
    },
    dateCenter: { flex: 1, alignItems: "center" },
    dateText: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
      textTransform: "capitalize",
    },
    todayLink: {
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      color: colors.primary,
      marginTop: 3,
    },
    errorBar: {
      marginHorizontal: 16,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: colors.radius,
      backgroundColor: "rgba(192,57,43,0.08)",
    },
    errorText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.destructive,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 40,
    },
    loadingText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mid,
    },
    list: { paddingHorizontal: 16, paddingTop: 12 },
    count: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      color: colors.mutedForeground,
      marginBottom: 12,
      marginLeft: 4,
    },
    emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 24,
      color: colors.foreground,
      marginBottom: 6,
    },
    emptyDesc: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mid,
      textAlign: "center",
      lineHeight: 20,
    },
    fabWrap: { position: "absolute", right: 20, alignItems: "flex-end" },
    fab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 999,
      shadowColor: "#1E1812",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 5,
    },
    fabText: { fontSize: 16 },
    fabLabel: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      color: colors.primaryForeground,
    },
  });
}
