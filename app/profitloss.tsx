// app/profitLoss.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
// NEW: Import useRef, useMemo for calendar logic
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
// NEW: Import the Calendar component
import { Calendar, DateData } from 'react-native-calendars';
import { db } from '../firebaseConfig';

interface DailyReport {
  date: string;
  shiftProfitLoss: number;
  totalMatchedAmount: number;
  totalExpenses: number;
  expenseNotes: string[];
  netProfit: number;
}

const SummaryRow: React.FC<{ label: string; value: string; valueColor?: string; isBold?: boolean }> = ({ label, value, valueColor = '#343a40', isBold = false }) => (
  <View style={styles.row}>
    <Text style={[styles.label, isBold && { fontWeight: 'bold' }]}>{label}</Text>
    <Text style={[styles.value, { color: valueColor }, isBold && { fontWeight: 'bold' }]}>{value}</Text>
  </View>
);

export default function ProfitLossScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // --- State for Security Gate ---
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // --- State for Calendar Modal and List Scrolling ---
  const [isCalendarVisible, setCalendarVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // --- State for Add Expense Modal ---
  const [isExpenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const fetchAndProcessData = useCallback(async (month: Date) => {
    setLoading(true);
    try {
        const ownerId = await AsyncStorage.getItem('ownerId');
        if (!ownerId) throw new Error("Owner ID not found");
        const startOfMonth = dayjs(month).startOf('month').toDate();
        const endOfMonth = dayjs(month).endOf('month').toDate();
        const dailyData = new Map<string, Omit<DailyReport, 'netProfit'>>();
        const shiftsQuery = query(collection(db, `owners/${ownerId}/shifts`), where('timestamp', '>=', startOfMonth), where('timestamp', '<=', endOfMonth));
        const shiftsSnapshot = await getDocs(shiftsQuery);
        shiftsSnapshot.forEach(doc => {
            const shift = doc.data();
            const dateStr = dayjs(shift.endTime).format('YYYY-MM-DD');
            const day = dailyData.get(dateStr) || { date: dateStr, shiftProfitLoss: 0, totalMatchedAmount: 0, totalExpenses: 0, expenseNotes: [] as string[] };
            day.shiftProfitLoss += (shift.totalIn || 0) - (shift.totalOut || 0);
            day.totalMatchedAmount += shift.totalMatchedAmount || 0;
            dailyData.set(dateStr, day);
        });
        const expensesQuery = query(collection(db, `owners/${ownerId}/dailyExpenses`), where('date', '>=', dayjs(startOfMonth).format('YYYY-MM-DD')), where('date', '<=', dayjs(endOfMonth).format('YYYY-MM-DD')));
        const expensesSnapshot = await getDocs(expensesQuery);
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            const dateStr = expense.date;
            const day = dailyData.get(dateStr) || { date: dateStr, shiftProfitLoss: 0, totalMatchedAmount: 0, totalExpenses: 0, expenseNotes: [] as string[] };
            day.totalExpenses += expense.amount || 0;
            if (expense.notes) {
                day.expenseNotes.push(expense.notes);
            }
            dailyData.set(dateStr, day);
        });
        const finalReports: DailyReport[] = Array.from(dailyData.values()).map(day => ({ ...day, netProfit: day.shiftProfitLoss - day.totalMatchedAmount - day.totalExpenses, })).sort((a, b) => b.date.localeCompare(a.date));
        setReports(finalReports);
    } catch (error) {
        console.error("Error fetching report data:", error);
        Alert.alert("Error", "Could not fetch report data.");
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      fetchAndProcessData(selectedMonth);
    }
  }, [selectedMonth, isAuthorized, fetchAndProcessData]);
  
  const handleUnlock = async () => {
    setAuthLoading(true);
    try {
      const storedPassword = await AsyncStorage.getItem('ownerPassword');
      if (passwordInput === storedPassword) {
        setIsAuthorized(true);
      } else {
        Alert.alert("Access Denied", "The password you entered is incorrect.");
      }
    } catch (e) {
      Alert.alert("Error", "Could not verify credentials.");
    } finally {
      setAuthLoading(false);
      setPasswordInput('');
    }
  };

  const handleDayPress = (day: DateData) => {
    const dateString = day.dateString;
    const index = reports.findIndex(report => report.date === dateString);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ animated: true, index });
    }
    setCalendarVisible(false);
  };

  const markedDates = useMemo(() => {
    const marks: { [key: string]: { marked: boolean; dotColor: string } } = {};
    reports.forEach(report => {
      marks[report.date] = { marked: true, dotColor: report.netProfit >= 0 ? '#28a745' : '#dc3545' };
    });
    return marks;
  }, [reports]);

  const monthlyTotals = useMemo(() => reports.reduce((acc, report) => {
    acc.netProfit += report.netProfit;
    return acc;
  }, { netProfit: 0 }), [reports]);

  const changeMonth = (amount: number) => {
    setSelectedMonth(prev => dayjs(prev).add(amount, 'month').toDate());
  };
  
  const openExpenseModal = (date: string) => {
    setExpenseDate(date);
    setExpenseAmount('');
    setExpenseNotes('');
    setExpenseModalVisible(true);
  };
  
  const handleSaveExpense = async () => {
    //... same as before
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive number.");
      return;
    }
    setIsSubmittingExpense(true);
    try {
      const ownerId = await AsyncStorage.getItem('ownerId');
      if (!ownerId) throw new Error("Owner ID not found");
      const newExpenseRef = doc(collection(db, `owners/${ownerId}/dailyExpenses`));
      await setDoc(newExpenseRef, { amount, notes: expenseNotes.trim(), date: expenseDate, timestamp: Timestamp.now() });
      setExpenseModalVisible(false);
      fetchAndProcessData(selectedMonth);
    } catch (error) {
      Alert.alert("Error", "Could not save expense.");
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const renderReportCard = ({ item }: { item: DailyReport }) => (
    <View style={styles.card}>
      <Text style={styles.cardDate}>{dayjs(item.date).format('dddd, MMMM D, YYYY')}</Text>
      <View style={styles.divider} />
      <SummaryRow label="Shift Profit / Loss:" value={`$${item.shiftProfitLoss.toFixed(2)}`} valueColor={item.shiftProfitLoss >= 0 ? '#28a745' : '#dc3545'} />
      <SummaryRow label="(-) Matched Amount:" value={`$${item.totalMatchedAmount.toFixed(2)}`} />
      <SummaryRow label="(-) Expenses:" value={`$${item.totalExpenses.toFixed(2)}`} />
      <View style={styles.divider} />
      <SummaryRow label="Day's Net Total:" value={`$${item.netProfit.toFixed(2)}`} valueColor={item.netProfit >= 0 ? '#28a745' : '#dc3545'} isBold={true} />
      {item.expenseNotes.length > 0 && (
        <View style={styles.notesSection}>
          <Text style={styles.notesTitle}>Expense Notes:</Text>
          {item.expenseNotes.map((note, index) => <Text key={index} style={styles.noteText}>• {note}</Text>)}
        </View>
      )}
      <TouchableOpacity style={styles.expenseButton} onPress={() => openExpenseModal(item.date)}>
        <Ionicons name="add-circle-outline" size={20} color="#007bff"/>
        <Text style={styles.expenseButtonText}>Add Expense for this Day</Text>
      </TouchableOpacity>
    </View>
  );

  if (!isAuthorized) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authCard}>
          <Ionicons name="lock-closed-outline" size={40} color="#007bff" style={{ alignSelf: 'center' }}/>
          <Text style={styles.authHeader}>Authorization Required</Text>
          <Text style={styles.authSubtitle}>Enter the admin password to view this report.</Text>
          <TextInput
            style={styles.authInput}
            placeholder="Password"
            secureTextEntry
            value={passwordInput}
            onChangeText={setPasswordInput}
            onSubmitEditing={handleUnlock}
          />
          <TouchableOpacity style={styles.authButton} onPress={handleUnlock} disabled={authLoading}>
            {authLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.authButtonText}>Unlock</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Profit & Loss</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
          <Ionicons name="chevron-back-outline" size={28} color="#007bff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCalendarVisible(true)}>
          <Text style={styles.monthText}>{dayjs(selectedMonth).format('MMMM YYYY')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
          <Ionicons name="chevron-forward-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Summary for {dayjs(selectedMonth).format('MMMM')}</Text>
        <Text style={[styles.summaryTotal, {color: monthlyTotals.netProfit >= 0 ? '#28a745' : '#dc3545'}]}>
          ${monthlyTotals.netProfit.toFixed(2)}
        </Text>
        <Text style={styles.summarySubtext}>Net Profit</Text>
      </View>
      
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Calculating Report...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={reports}
          renderItem={renderReportCard}
          keyExtractor={(item) => item.date}
          ListEmptyComponent={<Text style={styles.centeredText}>No data found for this month.</Text>}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        />
      )}

      <Modal visible={isCalendarVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackground} onPress={() => setCalendarVisible(false)}>
          <Pressable style={styles.calendarModalContent}>
            <Calendar
              current={dayjs(selectedMonth).format('YYYY-MM-DD')}
              onDayPress={handleDayPress}
              monthFormat={'MMMM yyyy'}
              markedDates={markedDates}
              theme={{
                selectedDayBackgroundColor: '#007bff',
                todayTextColor: '#007bff',
                arrowColor: '#007bff',
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={isExpenseModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackground} onPress={() => setExpenseModalVisible(false)}>
          <Pressable style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Expense</Text>
            <Text style={styles.modalDate}>{dayjs(expenseDate).format('MMMM D, YYYY')}</Text>
            <TextInput style={styles.modalInput} placeholder="Amount ($)" keyboardType="numeric" value={expenseAmount} onChangeText={setExpenseAmount} />
            <TextInput style={[styles.modalInput, { height: 80 }]} placeholder="Notes (e.g., Food, Supplies)" multiline value={expenseNotes} onChangeText={setExpenseNotes} />
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveExpense} disabled={isSubmittingExpense}>
              {isSubmittingExpense ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Save Expense</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', padding: 20 },
  authCard: { width: '100%', maxWidth: 350, padding: 25, backgroundColor: '#fff', borderRadius: 16, elevation: 5 },
  authHeader: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#333' },
  authSubtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 25 },
  authInput: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  authButton: { backgroundColor: '#007bff', padding: 15, borderRadius: 8, alignItems: 'center' },
  authButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingTop: 10 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, marginTop: 40 },
  header: { fontSize: 26, fontWeight: 'bold', color: '#1c1c1e' },
  monthSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, marginHorizontal: 10, backgroundColor: '#fff', borderRadius: 12, elevation: 2, marginBottom: 15 },
  monthButton: { padding: 5 },
  monthText: { fontSize: 20, fontWeight: '600', color: '#333' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginHorizontal: 10, marginBottom: 15, alignItems: 'center', elevation: 2 },
  summaryTitle: { fontSize: 16, color: '#6c757d', marginBottom: 5 },
  summaryTotal: { fontSize: 36, fontWeight: 'bold' },
  summarySubtext: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginHorizontal: 10, marginVertical: 8, elevation: 2 },
  cardDate: { fontSize: 18, fontWeight: 'bold', color: '#007bff', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 16, color: '#6c757d' },
  value: { fontSize: 16, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 8 },
  notesSection: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#e9ecef', paddingTop: 10 },
  notesTitle: { fontSize: 14, fontWeight: '600', color: '#495057', marginBottom: 5 },
  noteText: { fontSize: 14, color: '#6c757d' },
  expenseButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 15, paddingVertical: 10, backgroundColor: '#eaf4ff', borderRadius: 8, borderWidth: 1, borderColor: '#007bff' },
  expenseButtonText: { color: '#007bff', marginLeft: 8, fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: 'gray' },
  loadingText: { fontSize: 16, marginTop: 10, color: 'gray' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  calendarModalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  modalDate: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  modalSaveButton: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});