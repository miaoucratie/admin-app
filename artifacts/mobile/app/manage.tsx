import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  Period,
  PeriodPayload,
  createPeriod,
  deletePeriod,
  fetchPeriods,
  formatDateFr,
  updatePeriod,
} from "@/services/api";

const SESSION_KEY = "miaoucratie:admin-token:v1";

function parseIso(val: string): Date | null {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
  const [y, m, d] = val.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

const MONTH_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

interface CalendarPickerProps {
  value: string;
  onChange: (iso: string) => void;
  minDate?: string;
  onClose: () => void;
}

function CalendarPicker({ value, onChange, minDate, onClose }: CalendarPickerProps) {
  const colors = useColors();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = parseIso(value);
  const min = parseIso(minDate ?? "") ?? today;
  const [viewing, setViewing] = useState<Date>(
    selected ?? min ?? today
  );

  const year = viewing.getFullYear();
  const month = viewing.getMonth();
  const firstDay = new Date(year, month, 1);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const s = StyleSheet.create({
    wrap: { padding: 16 },
    nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    navBtn: { padding: 8 },
    navBtnText: { fontSize: 18, color: colors.primary, fontFamily: "DMSans_600SemiBold" },
    navTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: colors.foreground },
    weekRow: { flexDirection: "row", marginBottom: 4 },
    weekDay: { flex: 1, alignItems: "center" },
    weekDayText: { fontFamily: "DMSans_500Medium", fontSize: 12, color: colors.mutedForeground },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    cellText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.foreground },
    cellSelected: { backgroundColor: colors.primary, borderRadius: 999 },
    cellSelectedText: { color: colors.primaryForeground, fontFamily: "DMSans_600SemiBold" },
    cellDisabled: { opacity: 0.3 },
    cellToday: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999 },
    doneBtn: {
      marginTop: 12, backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingVertical: 12, alignItems: "center",
    },
    doneBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: colors.primaryForeground },
  });

  function prevMonth() {
    setViewing(v => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewing(v => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  }

  return (
    <View style={s.wrap}>
      <View style={s.nav}>
        <TouchableOpacity style={s.navBtn} onPress={prevMonth}>
          <Text style={s.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>{MONTH_FR[month]} {year}</Text>
        <TouchableOpacity style={s.navBtn} onPress={nextMonth}>
          <Text style={s.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={s.weekRow}>
        {["Lu","Ma","Me","Je","Ve","Sa","Di"].map(d => (
          <View key={d} style={s.weekDay}><Text style={s.weekDayText}>{d}</Text></View>
        ))}
      </View>
      <View style={s.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`pad-${i}`} style={s.cell} />;
          const iso = toIso(date);
          const isSelected = value === iso;
          const isDisabled = date < min;
          const isToday = toIso(date) === toIso(today);
          return (
            <TouchableOpacity
              key={iso}
              style={s.cell}
              disabled={isDisabled}
              onPress={() => onChange(iso)}
            >
              <View style={[isSelected && s.cellSelected, !isSelected && isToday && s.cellToday, s.cell]}>
                <Text style={[
                  s.cellText,
                  isSelected && s.cellSelectedText,
                  isDisabled && s.cellDisabled,
                ]}>{date.getDate()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={s.doneBtn} onPress={onClose}>
        <Text style={s.doneBtnText}>Confirmer</Text>
      </TouchableOpacity>
    </View>
  );
}

interface PeriodFormProps {
  token: string;
  editing: Period | null;
  onDone: () => void;
  onCancel: () => void;
}

function PeriodForm({ token, editing, onDone, onCancel }: PeriodFormProps) {
  const colors = useColors();
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");
  const [comment, setComment] = useState(editing?.comment ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<"start" | "end" | null>(null);

  async function handleSave() {
    if (!startDate) { setError("La date de début est requise."); return; }
    if (!endDate) { setError("La date de fin est requise."); return; }
    if (startDate > endDate) { setError("La date de fin doit être après la date de début."); return; }
    setError("");
    setLoading(true);
    const payload: PeriodPayload = { startDate, endDate, comment: comment.trim() || undefined };
    try {
      if (editing) {
        await updatePeriod(token, editing.id, payload);
      } else {
        await createPeriod(token, payload);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  }

  const s = makeFormStyles(colors);

  return (
    <View>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>
          {editing ? "Modifier" : "Ajouter une indisponibilité"}
        </Text>
        <TouchableOpacity onPress={onCancel} hitSlop={12}>
          <Text style={s.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.label}>Date de début</Text>
      <TouchableOpacity
        style={[s.dateBtn, !startDate && s.dateBtnEmpty]}
        onPress={() => setPicker("start")}
      >
        <Text style={[s.dateBtnText, !startDate && s.dateBtnEmptyText]}>
          {startDate ? formatDateFr(startDate) : "Sélectionner une date"}
        </Text>
        <Text style={s.calIcon}>📅</Text>
      </TouchableOpacity>

      <Text style={[s.label, { marginTop: 12 }]}>Date de fin</Text>
      <TouchableOpacity
        style={[s.dateBtn, !endDate && s.dateBtnEmpty]}
        onPress={() => setPicker("end")}
      >
        <Text style={[s.dateBtnText, !endDate && s.dateBtnEmptyText]}>
          {endDate ? formatDateFr(endDate) : "Sélectionner une date"}
        </Text>
        <Text style={s.calIcon}>📅</Text>
      </TouchableOpacity>

      <Text style={[s.label, { marginTop: 12 }]}>Commentaire (facultatif)</Text>
      <TextInput
        style={s.input}
        placeholder="Ex : vacances, complet…"
        placeholderTextColor={colors.mutedForeground}
        value={comment}
        onChangeText={setComment}
        maxLength={160}
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={colors.primaryForeground} size="small" />
          : <Text style={s.saveBtnText}>{editing ? "Mettre à jour" : "Enregistrer"}</Text>
        }
      </Pressable>

      <Modal
        visible={picker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={s.overlay} onPress={() => setPicker(null)}>
          <Pressable style={s.calSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.calTitle}>
              {picker === "start" ? "Date de début" : "Date de fin"}
            </Text>
            <CalendarPicker
              value={picker === "start" ? startDate : endDate}
              minDate={picker === "end" ? startDate || undefined : undefined}
              onChange={(iso) => {
                if (picker === "start") {
                  setStartDate(iso);
                  if (endDate && iso > endDate) setEndDate("");
                } else {
                  setEndDate(iso);
                }
              }}
              onClose={() => setPicker(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeFormStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    formTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 24, color: colors.foreground },
    cancelText: { fontFamily: "DMSans_500Medium", fontSize: 15, color: colors.primary },
    label: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.mid, marginBottom: 6 },
    dateBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      borderWidth: 1.5, borderColor: colors.primary, borderRadius: colors.radius,
      paddingHorizontal: 14, paddingVertical: 14, backgroundColor: colors.background,
    },
    dateBtnEmpty: { borderColor: colors.border },
    dateBtnText: { fontFamily: "DMSans_500Medium", fontSize: 15, color: colors.foreground },
    dateBtnEmptyText: { color: colors.mutedForeground, fontFamily: "DMSans_400Regular" },
    calIcon: { fontSize: 16 },
    input: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: colors.radius,
      paddingHorizontal: 14, paddingVertical: 14,
      fontFamily: "DMSans_400Regular", fontSize: 15, color: colors.foreground,
      backgroundColor: colors.background,
    },
    errorText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.destructive, marginTop: 10 },
    saveBtn: {
      backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingVertical: 16, alignItems: "center", marginTop: 16,
    },
    saveBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: colors.primaryForeground },
    overlay: { flex: 1, backgroundColor: "rgba(30,24,18,0.5)", justifyContent: "flex-end" },
    calSheet: {
      backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 4, paddingBottom: 32,
    },
    calTitle: {
      fontFamily: "DMSans_600SemiBold", fontSize: 16, color: colors.foreground,
      textAlign: "center", paddingVertical: 16,
    },
  });
}

interface PeriodCardProps {
  period: Period;
  onEdit: () => void;
  onDelete: () => void;
}

function PeriodCard({ period, onEdit, onDelete }: PeriodCardProps) {
  const colors = useColors();
  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: colors.radius + 2,
      padding: 16, marginBottom: 10,
      shadowColor: "#1E1812", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    dates: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: colors.foreground, marginBottom: 4 },
    arrow: { color: colors.primary },
    comment: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mid, marginBottom: 12 },
    actions: { flexDirection: "row", gap: 8 },
    editBtn: {
      flex: 1, borderWidth: 1.5, borderColor: colors.border,
      borderRadius: colors.radius, paddingVertical: 10, alignItems: "center",
    },
    editBtnText: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.foreground },
    deleteBtn: {
      flex: 1, backgroundColor: "rgba(192,57,43,0.08)",
      borderRadius: colors.radius, paddingVertical: 10, alignItems: "center",
    },
    deleteBtnText: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.destructive },
  });

  return (
    <View style={s.card}>
      <Text style={s.dates}>
        {formatDateFr(period.startDate)}{" "}
        <Text style={s.arrow}>→</Text>{" "}
        {formatDateFr(period.endDate)}
      </Text>
      <Text style={s.comment}>
        {period.comment?.trim() || "Aucun commentaire"}
      </Text>
      <View style={s.actions}>
        <TouchableOpacity style={s.editBtn} onPress={onEdit}>
          <Text style={s.editBtnText}>Modifier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteBtn} onPress={onDelete}>
          <Text style={s.deleteBtnText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ManageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then(t => {
      if (t) { setToken(t); }
      else { router.replace("/"); }
    });
  }, []);

  useEffect(() => {
    if (token) load();
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadingPeriods(true);
    setFeedback(null);
    try {
      const data = await fetchPeriods(token);
      setPeriods(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        handleSessionExpired();
      } else {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Erreur de chargement." });
      }
    } finally {
      setLoadingPeriods(false);
    }
  }, [token]);

  async function handleSessionExpired() {
    await AsyncStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  async function handleLogout() {
    await AsyncStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  async function handleDelete(period: Period) {
    Alert.alert(
      "Supprimer",
      `Supprimer l'indisponibilité du ${formatDateFr(period.startDate)} au ${formatDateFr(period.endDate)} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePeriod(token!, period.id);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setFeedback({ type: "success", msg: "Indisponibilité supprimée." });
              load();
            } catch (err: unknown) {
              if (err instanceof Error && err.message === "SESSION_EXPIRED") {
                handleSessionExpired();
              } else {
                setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Erreur lors de la suppression." });
              }
            }
          },
        },
      ]
    );
  }

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(period: Period) {
    setEditing(period);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  function onFormDone() {
    closeForm();
    setFeedback({ type: "success", msg: editing ? "Indisponibilité mise à jour." : "Indisponibilité ajoutée." });
    load();
  }

  const styles = makeStyles(colors);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const botPad = Platform.OS === "web" ? insets.bottom + 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEye}>Calendrier public</Text>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Indisponibilités
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace("/agenda")} hitSlop={8}>
            <Text style={styles.iconBtnText}>🗓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => load()} hitSlop={8}>
            <Text style={styles.iconBtnText}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout} hitSlop={8}>
            <Text style={styles.iconBtnText}>⏻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {feedback && (
        <View style={[styles.feedbackBar, feedback.type === "error" && styles.feedbackBarError]}>
          <Text style={[styles.feedbackText, feedback.type === "error" && styles.feedbackTextError]}>
            {feedback.msg}
          </Text>
          <TouchableOpacity onPress={() => setFeedback(null)} hitSlop={8}>
            <Text style={[styles.feedbackClose, feedback.type === "error" && styles.feedbackTextError]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {loadingPeriods && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      )}

      <FlatList
        data={periods}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 100 }]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.count}>
              {periods.length === 0
                ? "Aucune période enregistrée"
                : `${periods.length} période${periods.length > 1 ? "s" : ""} enregistrée${periods.length > 1 ? "s" : ""}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !loadingPeriods ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>Aucune indisponibilité</Text>
              <Text style={styles.emptyDesc}>
                Appuyez sur le bouton ci-dessous pour en ajouter une.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <PeriodCard
            period={item}
            onEdit={() => openEdit(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        scrollEnabled={periods.length > 0}
      />

      <View style={[styles.fabWrap, { bottom: botPad + 24 }]}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          onPress={openAdd}
        >
          <Text style={styles.fabText}>+</Text>
          <Text style={styles.fabLabel}>Ajouter</Text>
        </Pressable>
      </View>

      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <Pressable style={styles.overlay} onPress={closeForm}>
          <Pressable style={[styles.sheet, { paddingBottom: botPad + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {token && (
                <PeriodForm
                  token={token}
                  editing={editing}
                  onDone={onFormDone}
                  onCancel={closeForm}
                />
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8,
      backgroundColor: colors.background,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitleWrap: { flex: 1, marginRight: 12 },
    headerEye: { fontFamily: "DMSans_500Medium", fontSize: 11, color: colors.primary, letterSpacing: 0.8, textTransform: "uppercase" },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 26, color: colors.foreground, marginTop: 2 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    iconBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center",
    },
    iconBtnText: { fontSize: 18, color: colors.primary, fontFamily: "DMSans_700Bold" },
    logoutBtn: {
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: colors.radius, borderWidth: 1.5, borderColor: colors.border,
    },
    logoutText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.mid },
    feedbackBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: "rgba(45,125,70,0.1)", borderRadius: colors.radius,
      borderLeftWidth: 3, borderLeftColor: colors.success,
    },
    feedbackBarError: {
      backgroundColor: "rgba(192,57,43,0.08)", borderLeftColor: colors.destructive,
    },
    feedbackText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.success, flex: 1 },
    feedbackTextError: { color: colors.destructive },
    feedbackClose: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.success, marginLeft: 8 },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 12 },
    loadingText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground },
    list: { paddingHorizontal: 16, paddingTop: 12 },
    listHeader: { marginBottom: 8 },
    count: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.mutedForeground },
    emptyState: { alignItems: "center", paddingVertical: 48 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: colors.foreground, marginBottom: 6 },
    emptyDesc: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mid, textAlign: "center", paddingHorizontal: 32 },
    fabWrap: { position: "absolute", right: 20, alignItems: "center" },
    fab: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 20,
      borderRadius: 999,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
    },
    fabText: { fontFamily: "DMSans_700Bold", fontSize: 22, color: colors.primaryForeground, lineHeight: 24 },
    fabLabel: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: colors.primaryForeground },
    overlay: { flex: 1, backgroundColor: "rgba(30,24,18,0.5)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, maxHeight: "92%",
    },
    sheetHandle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: colors.border, alignSelf: "center", marginBottom: 20,
    },
  });
}
