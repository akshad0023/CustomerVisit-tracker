import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, Timestamp, where } from 'firebase/firestore'; // Added orderBy
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { auth, db } from '../firebaseConfig';

interface DailyReport {
  date: string;
  shiftProfitLoss: number;
  totalMatchedAmount: number;
  totalExpenses: number;
  expenseNotes: string[];
  netProfit: number;
}

interface ExpenseItem {
    id: string;
    amount: number;
    notes: string;
    date: string;
    timestamp?: Timestamp;
}

// New interface for Bank History Item
interface BankHistoryItem {
  id: string;
  amount: number; // This will now store the *change* in balance, or the new total balance, depending on how you want to log it
  newBalance: number; // Added to store the resulting total balance
  timestamp: Timestamp;
  type: 'set' | 'add' | 'expense' | 'deleteExpense'; // Added to distinguish transaction types
  notes?: string; // Optional notes for the transaction
}

const SummaryRow: React.FC<{ label: string; value: string; valueColor?: string; isBold?: boolean }> = ({ label, value, valueColor = '#343a40', isBold = false }) => (
  <View style={styles.row}>
    <Text style={[styles.label, isBold && { fontWeight: 'bold' }]}>{label}</Text>
    <Text style={[styles.value, { color: valueColor }, isBold && { fontWeight: 'bold' }]}>{value}</Text>
  </View>
);

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{4,}$/;

export default function ProfitLossScreen() {
  const router = useRouter();

  const [isReady, setIsReady] = useState(false);
  const [hasReportingPass, setHasReportingPass] = useState<boolean | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [bankBalance, setBankBalance] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isCalendarVisible, setCalendarVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const [isExpenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseOldAmount, setEditingExpenseOldAmount] = useState<number>(0);

  const [isDailyExpensesListModalVisible, setDailyExpensesListModalVisible] = useState(false);
  const [currentDayExpenses, setCurrentDayExpenses] = useState<ExpenseItem[]>([]);
  const [selectedDayForExpenses, setSelectedDayForExpenses] = useState('');

  const [isBankModalVisible, setBankModalVisible] = useState(false);
  const [bankInput, setBankInput] = useState('');

  // New state for Bank History Modal
  const [isBankHistoryModalVisible, setBankHistoryModalVisible] = useState(false);
  const [bankHistory, setBankHistory] = useState<BankHistoryItem[]>([]);
  const [loadingBankHistory, setLoadingBankHistory] = useState(false);


  // --- Set Bank Balance (Modified) ---
  const handleSetBankBalance = async () => {
    const amountToAdd = parseFloat(bankInput); // Changed variable name to reflect addition
    if (isNaN(amountToAdd)) {
      Alert.alert("Invalid Input", "Enter a valid number.");
      return;
    }
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");
      const ownerId = user.uid;

      // Get current balance from AsyncStorage
      const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
      const currentBankBalance = parseFloat(currentBankBalanceStr || '0');

      // Calculate the new balance (add to existing)
      const newBalance = currentBankBalance + amountToAdd;

      // Save to AsyncStorage (current balance)
      await AsyncStorage.setItem('bankBalance', newBalance.toString());
      setBankBalance(newBalance);

      // Record in Firestore history
      const historyRef = doc(collection(db, `owners/${ownerId}/bankBalanceHistory`));
      await setDoc(historyRef, {
        id: historyRef.id,
        amount: amountToAdd, // Amount added/subtracted
        newBalance: newBalance, // The resulting balance
        timestamp: Timestamp.now(),
        type: 'add', // Indicate it's an addition
        notes: `Added ${amountToAdd.toFixed(2)} to bank balance.` // Specific note for addition
      });

      setBankModalVisible(false);
      setBankInput('');
      Alert.alert("Success", `Bank balance updated to $${newBalance.toFixed(2)} and recorded in history.`);
    } catch (error) {
      console.error("Error setting bank balance:", error);
      Alert.alert("Error", "Could not set bank balance.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsReady(true);
        const storedPassword = await AsyncStorage.getItem('reportingPassword');
        setHasReportingPass(!!storedPassword);
        setAuthLoading(false);
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (isAuthorized) {
      fetchAndProcessData(selectedMonth);
    }
  }, [selectedMonth, isAuthorized]);

  useEffect(() => {
    const loadBankBalance = async () => {
      const stored = await AsyncStorage.getItem('bankBalance');
      if (stored) {
        setBankBalance(parseFloat(stored));
      }
    };
    loadBankBalance();
  }, []);

  // --- NEW: Fetch Bank History ---
  const fetchBankHistory = useCallback(async () => {
    setLoadingBankHistory(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");
      const ownerId = user.uid;

      const q = query(
        collection(db, `owners/${ownerId}/bankBalanceHistory`),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const history: BankHistoryItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        amount: doc.data().amount,
        newBalance: doc.data().newBalance, // Retrieve newBalance
        timestamp: doc.data().timestamp,
        type: doc.data().type || 'unknown', // Default to 'unknown' if not present
        notes: doc.data().notes || ''
      }));
      setBankHistory(history);
    } catch (error) {
      console.error("Error fetching bank history:", error);
      Alert.alert("Error", "Could not fetch bank history.");
    } finally {
      setLoadingBankHistory(false);
    }
  }, []);

  const handleOpenBankHistory = () => {
    fetchBankHistory(); // Fetch data when opening the modal
    setBankHistoryModalVisible(true);
  };

  const fetchAndProcessData = useCallback(async (month: Date) => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");
      const ownerId = user.uid;
      const startOfMonth = dayjs(month).startOf('month').toDate();
      const endOfMonth = dayjs(month).endOf('month').toDate();

      const dailyData = new Map<string, Omit<DailyReport, 'netProfit'>>();

      const shiftsQuery = query(
        collection(db, `owners/${ownerId}/shifts`),
        where('timestamp', '>=', startOfMonth),
        where('timestamp', '<=', endOfMonth)
      );
      const shiftsSnapshot = await getDocs(shiftsQuery);

      shiftsSnapshot.forEach(doc => {
        const shift = doc.data();
        const dateStr = dayjs(shift.endTime.toDate ? shift.endTime.toDate() : shift.endTime).format('YYYY-MM-DD');
        const prev = dailyData.get(dateStr);

        const day = {
          date: dateStr,
          shiftProfitLoss: (prev?.shiftProfitLoss || 0) + ((shift.totalIn || 0) - (shift.totalOut || 0)),
          totalMatchedAmount: (prev?.totalMatchedAmount || 0) + (shift.totalMatchedAmount || 0),
          totalExpenses: prev?.totalExpenses || 0,
          expenseNotes: [...(prev?.expenseNotes || [])],
        };
        dailyData.set(dateStr, day);
      });

      const expensesQuery = query(
        collection(db, `owners/${ownerId}/dailyExpenses`),
        where('date', '>=', dayjs(startOfMonth).format('YYYY-MM-DD')),
        where('date', '<=', dayjs(endOfMonth).format('YYYY-MM-DD'))
      );
      const expensesSnapshot = await getDocs(expensesQuery);

      expensesSnapshot.forEach(doc => {
        const expense = doc.data();
        const dateStr = expense.date;
        const prev = dailyData.get(dateStr);

        const day = {
          date: dateStr,
          shiftProfitLoss: prev?.shiftProfitLoss || 0,
          totalMatchedAmount: prev?.totalMatchedAmount || 0,
          totalExpenses: (prev?.totalExpenses || 0) + (expense.amount || 0),
          expenseNotes: [...(prev?.expenseNotes || [])],
        };
        if (expense.notes) {
          day.expenseNotes.push(`$${(expense.amount || 0).toFixed(2)}: ${expense.notes}`);
        }
        dailyData.set(dateStr, day);
      });

      const finalReports: DailyReport[] = Array.from(dailyData.values())
        .map(day => {
          const shiftPL = day.shiftProfitLoss;
          const matched = day.totalMatchedAmount;
          const expenses = day.totalExpenses;
          const net = shiftPL - matched - expenses;
          return { ...day, netProfit: net };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      setReports(finalReports);

    } catch (error) {
      console.error("Error fetching report data:", error);
      Alert.alert("Error", "Could not fetch report data.");
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  const handleCreatePassword = async () => {
    if (!passwordRegex.test(newPassword)) {
      Alert.alert('Weak Password', 'Password must be at least 4 characters and contain a letter, a number, and a special character.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Passwords Do Not Match', 'Please re-enter your password to confirm.');
      return;
    }
    setAuthLoading(true);
    try {
      await AsyncStorage.setItem('reportingPassword', newPassword.trim());
      setHasReportingPass(true);
      setIsAuthorized(true);
    } catch (e) {
      Alert.alert("Error", "Could not save the password.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!passwordInput) {
      Alert.alert("Input Required", "Please enter your reporting password.");
      return;
    }
    setAuthLoading(true);
    try {
      const storedPassword = await AsyncStorage.getItem('reportingPassword');
      if (passwordInput === storedPassword) {
        setIsAuthorized(true);
      } else {
        Alert.alert("Access Denied", "The reporting password you entered is incorrect.");
      }
    } catch (e) {
      Alert.alert("Error", "Could not verify credentials.");
    } finally {
      setAuthLoading(false);
      setPasswordInput('');
    }
  };

  const handleForgotPassword = () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert("Error", "Cannot perform this action. No logged-in user found.");
      return;
    }
    Alert.prompt("Admin Verification Required", `To reset your reporting password, please enter the login password for ${user.email}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Verify & Reset",
          onPress: async (loginPassword) => {
            if (!loginPassword) {
              Alert.alert("Error", "Your login password is required to proceed.");
              return;
            }
            setAuthLoading(true);
            try {
              const credential = EmailAuthProvider.credential(user.email!, loginPassword);
              await reauthenticateWithCredential(user, credential);
              await AsyncStorage.removeItem('reportingPassword');
              setHasReportingPass(false);
              Alert.alert("Verification Successful!", "Your reporting password has been reset. You can now create a new one.");
            } catch (error) {
              Alert.alert("Verification Failed", "The login password you entered was incorrect. Please try again.");
            } finally {
              setAuthLoading(false);
            }
          },
        },
      ],
      'secure-text'
    );
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

  const handleExportToCSV = async () => {
    if (!reports.length) {
      Alert.alert("No Data", "There is no data to export for this month.");
      return;
    }
    const header = "Date,Shift Profit/Loss,Matched Amount,Expenses,Net Profit\n";
    const csvRows = reports.map(r =>
      `${r.date},${r.shiftProfitLoss.toFixed(2)},${r.totalMatchedAmount.toFixed(2)},${r.totalExpenses.toFixed(2)},${r.netProfit.toFixed(2)}`
    );
    const csvString = header + csvRows.join("\n");

    const fileUri = FileSystem.cacheDirectory + `ProfitLoss-${dayjs(selectedMonth).format('MM-YYYY')}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    } else {
      Alert.alert("Sharing Not Available", "Sharing is not available on this device.");
    }
  };

  const handlePrint = async () => {
    if (!reports.length) {
      Alert.alert("No Data", "There is no data to print.");
      return;
    }
    const htmlContent = `
      <html>
        <body>
          <h1>Profit & Loss Report - ${dayjs(selectedMonth).format('MMMM YYYY')}</h1>
          <table border="1" style="width:100%;border-collapse:collapse;">
            <tr>
              <th>Date</th>
              <th>Shift P/L</th>
              <th>Matched</th>
              <th>Expenses</th>
              <th>Net</th>
            </tr>
            ${reports.map(r => `
              <tr>
                <td>${r.date}</td>
                <td>${r.shiftProfitLoss.toFixed(2)}</td>
                <td>${r.totalMatchedAmount.toFixed(2)}</td>
                <td>${r.totalExpenses.toFixed(2)}</td>
                <td>${r.netProfit.toFixed(2)}</td>
              </tr>`).join("")}
          </table>
        </body>
      </html>
    `;
    await Print.printAsync({ html: htmlContent });
  };

  const handlePrintDay = async (report: DailyReport) => {
    const htmlContent = `
      <html>
        <body>
          <h1>Daily Profit & Loss Report - ${dayjs(report.date).format('MMMM D, YYYY')}</h1>
          <table border="1" style="width:100%;border-collapse:collapse;">
            <tr><th>Shift Profit/Loss</th><td>${report.shiftProfitLoss.toFixed(2)}</td></tr>
            <tr><th>Matched Amount</th><td>${report.totalMatchedAmount.toFixed(2)}</td></tr>
            <tr><th>Expenses</th><td>${report.totalExpenses.toFixed(2)}</td></tr>
            <tr><th>Net Profit</th><td>${report.netProfit.toFixed(2)}</td></tr>
          </table>
          ${report.expenseNotes.length > 0 ? `<h3>Expense Notes:</h3><ul>${report.expenseNotes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
        </body>
      </html>
    `;
    await Print.printAsync({ html: htmlContent });
  };

  const openExpenseModal = (date: string, expenseToEdit?: ExpenseItem) => {
    if (expenseToEdit) {
      setEditingExpenseId(expenseToEdit.id);
      setEditingExpenseOldAmount(expenseToEdit.amount);
      setExpenseAmount(expenseToEdit.amount.toFixed(2));
      setExpenseNotes(expenseToEdit.notes);
      setExpenseDate(expenseToEdit.date);
    } else {
      setEditingExpenseId(null);
      setEditingExpenseOldAmount(0);
      setExpenseAmount('');
      setExpenseNotes('');
      setExpenseDate(date);
    }
    setExpenseModalVisible(true);
  };

  const handleSaveExpense = async () => {
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive number.");
      return;
    }
    setIsSubmittingExpense(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");
      const ownerId = user.uid;

      const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
      const currentBankBalance = parseFloat(currentBankBalanceStr || '0');
      const updatedBalance = currentBankBalance - amount;
      await AsyncStorage.setItem('bankBalance', updatedBalance.toString());
      setBankBalance(updatedBalance);

      const newExpenseRef = doc(collection(db, `owners/${ownerId}/dailyExpenses`));
      const expenseId = newExpenseRef.id;
      await setDoc(newExpenseRef, {
        id: expenseId,
        amount,
        notes: expenseNotes.trim(),
        date: expenseDate,
        timestamp: Timestamp.now()
      });

      // Record in Firestore bank balance history for expense
      const historyRef = doc(collection(db, `owners/${ownerId}/bankBalanceHistory`));
      await setDoc(historyRef, {
        id: historyRef.id,
        amount: -amount, // Negative for expense
        newBalance: updatedBalance,
        timestamp: Timestamp.now(),
        type: 'expense',
        notes: `Expense: ${expenseNotes.trim()} on ${dayjs(expenseDate).format('MMMM D, YYYY')}`
      });

      setExpenseModalVisible(false);
      Alert.alert("Success", "Expense added and bank balance updated.");
      fetchAndProcessData(selectedMonth);
    } catch (error) {
      console.error("Error saving expense:", error);
      Alert.alert("Error", "Could not save expense.");
    } finally {
      setIsSubmittingExpense(false);
      setEditingExpenseId(null);
      setEditingExpenseOldAmount(0);
      setExpenseAmount('');
      setExpenseNotes('');
    }
  };

  const handleEditExpense = async () => {
    const newAmount = parseFloat(expenseAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive number.");
      return;
    }
    if (!editingExpenseId || !expenseDate) {
        Alert.alert("Error", "No expense selected for editing.");
        return;
    }

    setIsSubmittingExpense(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");
      const ownerId = user.uid;

      const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
      let currentBankBalance = parseFloat(currentBankBalanceStr || '0');

      // Adjust bank balance: add back old amount, then subtract new amount
      currentBankBalance += editingExpenseOldAmount;
      currentBankBalance -= newAmount;

      await AsyncStorage.setItem('bankBalance', currentBankBalance.toString());
      setBankBalance(currentBankBalance);

      const expenseRef = doc(db, `owners/${ownerId}/dailyExpenses`, editingExpenseId);
      await setDoc(expenseRef, {
        amount: newAmount,
        notes: expenseNotes.trim(),
        date: expenseDate,
      }, { merge: true });

      // Record in Firestore bank balance history for edited expense
      const historyRef = doc(collection(db, `owners/${ownerId}/bankBalanceHistory`));
      await setDoc(historyRef, {
        id: historyRef.id,
        amount: newAmount - editingExpenseOldAmount, // Net change in expense
        newBalance: currentBankBalance,
        timestamp: Timestamp.now(),
        type: 'expenseEdit', // A new type for editing
        notes: `Edited expense from $${editingExpenseOldAmount.toFixed(2)} to $${newAmount.toFixed(2)}: ${expenseNotes.trim()}`
      });

      setExpenseModalVisible(false);
      Alert.alert("Success", "Expense updated and bank balance adjusted.");
      fetchAndProcessData(selectedMonth);
      setDailyExpensesListModalVisible(false);

    } catch (error) {
      console.error("Error editing expense:", error);
      Alert.alert("Error", "Could not update expense.");
    } finally {
      setIsSubmittingExpense(false);
      setEditingExpenseId(null);
      setEditingExpenseOldAmount(0);
      setExpenseAmount('');
      setExpenseNotes('');
    }
  };

  const openDayExpensesListModal = async (date: string) => {
    setSelectedDayForExpenses(date);
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "User not logged in.");
      return;
    }
    try {
      setLoading(true);
      const expensesQuery = query(
        collection(db, `owners/${user.uid}/dailyExpenses`),
        where('date', '==', date)
      );
      const expensesSnapshot = await getDocs(expensesQuery);
      const expenses: ExpenseItem[] = [];
      expensesSnapshot.forEach(doc => {
        const data = doc.data();
        expenses.push({
          id: doc.id,
          amount: data.amount,
          notes: data.notes,
          date: data.date
        });
      });
      setCurrentDayExpenses(expenses.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      setDailyExpensesListModalVisible(true);
    } catch (error) {
      console.error("Error fetching daily expenses:", error);
      Alert.alert("Error", "Could not fetch daily expenses.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseToDelete: ExpenseItem) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete the $${expenseToDelete.amount.toFixed(2)} expense for ${dayjs(expenseToDelete.date).format('MMMM D, YYYY')}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (!user) throw new Error("User not logged in");
              const ownerId = user.uid;

              const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
              let currentBankBalance = parseFloat(currentBankBalanceStr || '0');
              currentBankBalance += expenseToDelete.amount; // Add back the deleted expense amount
              await AsyncStorage.setItem('bankBalance', currentBankBalance.toString());
              setBankBalance(currentBankBalance);

              await deleteDoc(doc(db, `owners/${ownerId}/dailyExpenses`, expenseToDelete.id));

              // Record in Firestore bank balance history for deleted expense
              const historyRef = doc(collection(db, `owners/${ownerId}/bankBalanceHistory`));
              await setDoc(historyRef, {
                id: historyRef.id,
                amount: expenseToDelete.amount, // Positive as it's added back
                newBalance: currentBankBalance,
                timestamp: Timestamp.now(),
                type: 'deleteExpense',
                notes: `Deleted expense: $${expenseToDelete.amount.toFixed(2)} for ${expenseToDelete.notes} on ${dayjs(expenseToDelete.date).format('MMMM D, YYYY')}`
              });


              Alert.alert("Success", "Expense deleted and bank balance adjusted.");
              setDailyExpensesListModalVisible(false);
              fetchAndProcessData(selectedMonth);

            } catch (error) {
              console.error("Error deleting expense:", error);
              Alert.alert("Error", "Could not delete expense.");
            }
          },
        },
      ]
    );
  };


  const renderReportCard = ({ item }: { item: DailyReport }) => (
    <View style={styles.card}>
      <Text style={styles.cardDate}>{dayjs(item.date).format('dddd, MMMM D, YYYY')}</Text>
      <View style={styles.divider} />
      <SummaryRow label="Shift Profit / Loss:" value={`$${item.shiftProfitLoss.toFixed(2)}`} valueColor={item.shiftProfitLoss >= 0 ? '#28a745' : '#dc3545'} />
      <SummaryRow label="(-) Matched Amount:" value={`$${item.totalMatchedAmount.toFixed(2)}`} />
      <SummaryRow label="(-) Expenses:" value={`$${item.totalExpenses.toFixed(2)}`} />
      {item.expenseNotes.length > 0 && (
        <View style={styles.notesSection}>
          <Text style={styles.notesTitle}>Expense Notes:</Text>
          {item.expenseNotes.map((note, index) => (
            <Text key={index} style={styles.noteText}>• {note}</Text>
          ))}
        </View>
      )}
      <View style={styles.divider} />
      <SummaryRow label="Day's Net Total:" value={`$${item.netProfit.toFixed(2)}`} valueColor={item.netProfit >= 0 ? '#28a745' : '#dc3545'} isBold={true} />

      <TouchableOpacity style={styles.expenseButton} onPress={() => openExpenseModal(item.date)}>
        <Ionicons name="add-circle-outline" size={20} color="#007bff"/>
        <Text style={styles.expenseButtonText}>Add New Expense</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.expenseButton, { marginTop: 10, backgroundColor: '#e6e6ff', borderColor: '#6a5acd' }]} onPress={() => openDayExpensesListModal(item.date)}>
        <Ionicons name="pencil-outline" size={20} color="#6a5acd"/>
        <Text style={[styles.expenseButtonText, { color: '#6a5acd' }]}>View/Edit Expenses</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.expenseButton, { marginTop: 10 }]} onPress={() => handlePrintDay(item)}>
        <Ionicons name="print-outline" size={20} color="#6c757d"/>
        <Text style={[styles.expenseButtonText, { color: '#6c757d' }]}>Print This Day</Text>
      </TouchableOpacity>
    </View>
  );

  if (!isReady || authLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  if (!isAuthorized) {
    return (
      <ScrollView contentContainerStyle={styles.authContainer}>
        {hasReportingPass ? (
          <View style={styles.authCard}>
            <Ionicons name="lock-closed-outline" size={40} color="#007bff" style={{ alignSelf: 'center' }}/>
            <Text style={styles.authHeader}>Report Access</Text>
            <Text style={styles.authSubtitle}>Enter your reporting password to view this page.</Text>
            <TextInput style={styles.authInput} placeholder="Reporting Password" secureTextEntry value={passwordInput} onChangeText={setPasswordInput} onSubmitEditing={handleUnlock} />
            <TouchableOpacity style={styles.authButton} onPress={handleUnlock} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.authButtonText}>Unlock</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotButton}>
                <Text style={styles.forgotButtonText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.authCard}>
            <Ionicons name="shield-outline" size={40} color="#28a745" style={{ alignSelf: 'center' }}/>
            <Text style={styles.authHeader}>Set Up Reporting Password</Text>
            <Text style={styles.authSubtitle}>Must contain letters, numbers, and special characters (@$!%*?&).</Text>
            <TextInput style={styles.authInput} placeholder="Create Password (min 4 chars)" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
            <TextInput style={styles.authInput} placeholder="Confirm Password" secureTextEntry value={confirmNewPassword} onChangeText={setConfirmNewPassword} onSubmitEditing={handleCreatePassword} />
            <TouchableOpacity style={styles.authButton} onPress={handleCreatePassword} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#fff"/> : <Text style={styles.authButtonText}>Create and Continue</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
      <View style={styles.summarySection}>
        <View style={styles.summaryCardCompact}>
          <Text style={styles.summaryTitleCompact}>Net Profit ({dayjs(selectedMonth).format('MMMM')})</Text>
          <Text style={[styles.summaryTotalCompact, {color: monthlyTotals.netProfit >= 0 ? '#28a745' : '#dc3545'}]}>
            ${monthlyTotals.netProfit.toFixed(2)}
          </Text>
        </View>
        <View style={[styles.summaryCardCompact, { backgroundColor: '#e9f5ff' }]}>
          <Text style={styles.summaryTitleCompact}>Bank Balance</Text>
          <Text style={[styles.summaryTotalCompact, {color: bankBalance >= 0 ? '#007bff' : '#dc3545'}]}>
            ${bankBalance.toFixed(2)}
          </Text>
          {bankBalance <= 0 && (
            <Text style={styles.addAmountWarning}>Please add funds to your bank balance!</Text>
          )}
        </View>
      </View>

      {/* Button Group for Bank Actions (Set Bank Balance & View History) */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity onPress={() => setBankModalVisible(true)} style={[styles.actionButton, styles.secondaryButton]}>
          <Ionicons name="wallet-outline" size={18} color="#000" />
          <Text style={styles.actionButtonTextBlack}>Add/Adjust Bank Balance</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpenBankHistory} style={[styles.actionButton, styles.secondaryButton]}>
          <Ionicons name="receipt-outline" size={18} color="#000" />
          <Text style={styles.actionButtonTextBlack}>View Bank History</Text>
        </TouchableOpacity>
      </View>

      {/* Button Group for Export/Print */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity onPress={handleExportToCSV} style={[styles.actionButton, styles.primaryButton]}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>Export to CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePrint} style={[styles.actionButton, styles.infoButton]}>
          <Ionicons name="print-outline" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>Print Report</Text>
        </TouchableOpacity>
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
              monthFormat={'MMMM YYYY'}
              markedDates={markedDates}
              theme={{ selectedDayBackgroundColor: '#007bff', todayTextColor: '#007bff', arrowColor: '#007bff' }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add/Edit Expense Modal */}
      <Modal visible={isExpenseModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackground} onPress={() => setExpenseModalVisible(false)}>
          <Pressable style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingExpenseId ? "Edit Expense" : "Add Expense"}</Text>
            <Text style={styles.modalDate}>For: {dayjs(expenseDate).format('MMMM D, YYYY')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount ($)"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="Notes (e.g., Food, Supplies)"
              multiline
              value={expenseNotes}
              onChangeText={setExpenseNotes}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setExpenseModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={editingExpenseId ? handleEditExpense : handleSaveExpense}
                disabled={isSubmittingExpense}
              >
                {isSubmittingExpense ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{editingExpenseId ? "Update Expense" : "Save Expense"}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily Expenses List Modal */}
      <Modal visible={isDailyExpensesListModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackground} onPress={() => setDailyExpensesListModalVisible(false)}>
          <Pressable style={styles.modalContent}>
            <Text style={styles.modalTitle}>Expenses for {dayjs(selectedDayForExpenses).format('MMMM D, YYYY')}</Text>
            {loading ? (
              <ActivityIndicator size="small" color="#007bff" style={{ marginVertical: 20 }} />
            ) : currentDayExpenses.length === 0 ? (
              <Text style={styles.centeredText}>No expenses for this day.</Text>
            ) : (
              <FlatList
                data={currentDayExpenses}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.expenseListItem}>
                    <View>
                      <Text style={styles.expenseListItemAmount}>${item.amount.toFixed(2)}</Text>
                      <Text style={styles.expenseListItemNotes}>{item.notes}</Text>
                    </View>
                    <View style={styles.expenseListItemActions}>
                      <TouchableOpacity onPress={() => openExpenseModal(item.date, item)}>
                        <Ionicons name="create-outline" size={24} color="#007bff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteExpense(item)} style={{ marginLeft: 15 }}>
                        <Ionicons name="trash-outline" size={24} color="#dc3545" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setDailyExpensesListModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Set Bank Balance Modal */}
      <Modal visible={isBankModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackground} onPress={() => setBankModalVisible(false)}>
          <Pressable style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add to Bank Balance</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount to add ($)"
              keyboardType="numeric"
              value={bankInput}
              onChangeText={setBankInput}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setBankModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSetBankBalance}>
                <Text style={styles.saveButtonText}>Add to Balance</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bank History Modal */}
      <Modal visible={isBankHistoryModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackground} onPress={() => setBankHistoryModalVisible(false)}>
          <Pressable style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bank Balance History</Text>
            {loadingBankHistory ? (
              <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 20 }} />
            ) : bankHistory.length === 0 ? (
              <Text style={styles.centeredText}>No bank balance history available.</Text>
            ) : (
              <FlatList
                data={bankHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <Text style={styles.historyItemDate}>{dayjs(item.timestamp.toDate()).format('MMMM D, YYYY h:mm A')}</Text>
                    <Text style={styles.historyItemType}>Type: {item.type}</Text>
                    <Text style={[styles.historyItemAmount, { color: item.amount >= 0 ? '#28a745' : '#dc3545' }]}>
                      Amount Change: ${item.amount.toFixed(2)}
                    </Text>
                    <Text style={styles.historyItemNewBalance}>New Balance: ${item.newBalance.toFixed(2)}</Text>
                    {item.notes && <Text style={styles.historyItemNotes}>Notes: {item.notes}</Text>}
                  </View>
                )}
              />
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setBankHistoryModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 50,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  authContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#e9ecef',
  },
  authCard: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  authHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#343a40',
  },
  authSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#6c757d',
  },
  authInput: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 5,
    marginBottom: 15,
    fontSize: 16,
  },
  authButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  authButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  forgotButton: {
    marginTop: 15,
    alignSelf: 'center',
  },
  forgotButtonText: {
    color: '#007bff',
    fontSize: 14,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#343a40',
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f1f3f5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  monthButton: {
    padding: 5,
  },
  monthText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#495057',
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  summaryCardCompact: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    width: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryTitleCompact: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 5,
    textAlign: 'center',
  },
  summaryTotalCompact: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addAmountWarning: {
    fontSize: 12,
    color: '#dc3545',
    marginTop: 5,
    textAlign: 'center',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 25,
    marginHorizontal: 5,
    minWidth: 150,
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  secondaryButton: {
    backgroundColor: '#e9ecef',
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  infoButton: {
    backgroundColor: '#17a2b8',
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButtonTextBlack: {
    color: '#343a40',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginVertical: 8,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardDate: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#343a40',
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 15,
    color: '#495057',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  notesSection: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#495057',
  },
  noteText: {
    fontSize: 13,
    color: '#6c757d',
    marginBottom: 3,
  },
  expenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaf6ff',
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#007bff',
    marginTop: 15,
  },
  expenseButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007bff',
  },
  centeredText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#6c757d',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  calendarModalContent: {
    width: '95%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#343a40',
  },
  modalDate: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 5,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 5,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  closeButtonText: {
    color: '#343a40',
    fontSize: 16,
    fontWeight: 'bold',
  },
  expenseListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  expenseListItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dc3545',
  },
  expenseListItemNotes: {
    fontSize: 14,
    color: '#495057',
  },
  expenseListItemActions: {
    flexDirection: 'row',
  },
  historyItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    marginBottom: 5,
  },
  historyItemDate: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 2,
  },
  historyItemType: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  historyItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyItemNewBalance: {
    fontSize: 15,
    color: '#343a40',
    marginTop: 2,
  },
  historyItemNotes: {
    fontSize: 13,
    color: '#495057',
    fontStyle: 'italic',
    marginTop: 5,
  },
});