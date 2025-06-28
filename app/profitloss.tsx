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

const SummaryRow: React.FC<{ label: string; value: string; valueColor?: string; isBold?: boolean }> = ({ label, value, valueColor = '#FFFFFF', isBold = false }) => ( // Changed default valueColor to #FFFFFF (white)
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
      marks[report.date] = { marked: true, dotColor: report.netProfit >= 0 ? '#4CAF50' : '#FF6347' }; // Updated green/red
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
          <h1>Profit & Loss Report - ${dayjs(selectedMonth).format('MMMMYYYY')}</h1>
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
          <h1>Daily Profit & Loss Report - ${dayjs(report.date).format('MMMM D,YYYY')}</h1>
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
        notes: `Expense: ${expenseNotes.trim()} on ${dayjs(expenseDate).format('MMMM D,YYYY')}`
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
      `Are you sure you want to delete the $${expenseToDelete.amount.toFixed(2)} expense for ${dayjs(expenseToDelete.date).format('MMMM D,YYYY')}? This cannot be undone.`,
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
                notes: `Deleted expense: $${expenseToDelete.amount.toFixed(2)} for ${expenseToDelete.notes} on ${dayjs(expenseToDelete.date).format('MMMM D,YYYY')}`
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
      <Text style={styles.cardDate}>{dayjs(item.date).format('dddd, MMMM D,YYYY')}</Text>
      <View style={styles.divider} />
      <SummaryRow label="Shift Profit / Loss:" value={`$${item.shiftProfitLoss.toFixed(2)}`} valueColor={item.shiftProfitLoss >= 0 ? '#4CAF50' : '#FF6347'} />
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
      <SummaryRow label="Day's Net Total:" value={`$${item.netProfit.toFixed(2)}`} valueColor={item.netProfit >= 0 ? '#4CAF50' : '#FF6347'} isBold={true} />

      <TouchableOpacity style={styles.cardActionButton} onPress={() => openExpenseModal(item.date)}>
        <Ionicons name="add-circle-outline" size={20} color="#FFD700"/>
        <Text style={styles.cardActionButtonText}>Add New Expense</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cardActionButton} onPress={() => openDayExpensesListModal(item.date)}>
        <Ionicons name="pencil-outline" size={20} color="#FFD700"/>
        <Text style={styles.cardActionButtonText}>View/Edit Expenses</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cardActionButton} onPress={() => handlePrintDay(item)}>
        <Ionicons name="print-outline" size={20} color="#FFD700"/> {/* Changed icon color to gold */}
        <Text style={styles.cardActionButtonText}>Print This Day</Text> {/* Changed text style to gold */}
      </TouchableOpacity>
    </View>
  );

  if (!isReady || authLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#FFD700" /></View>;
  }

  if (!isAuthorized) {
    return (
      <ScrollView contentContainerStyle={styles.authContainer}>
        {hasReportingPass ? (
          <View style={styles.authCard}>
            <Ionicons name="lock-closed-outline" size={40} color="#FFD700" style={{ alignSelf: 'center' }}/>
            <Text style={styles.authHeader}>Report Access</Text>
            <Text style={styles.authSubtitle}>Enter your reporting password to view this page.</Text>
            <TextInput style={styles.authInput} placeholder="Reporting Password" placeholderTextColor="#888" secureTextEntry value={passwordInput} onChangeText={setPasswordInput} onSubmitEditing={handleUnlock} />
            <TouchableOpacity style={styles.authButton} onPress={handleUnlock} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#000"/> : <Text style={styles.authButtonText}>Unlock</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotButton}>
                <Text style={styles.forgotButtonText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.authCard}>
            <Ionicons name="shield-outline" size={40} color="#FFD700" style={{ alignSelf: 'center' }}/>
            <Text style={styles.authHeader}>Set Up Reporting Password</Text>
            <Text style={styles.authSubtitle}>Must contain letters, numbers, and special characters (@$!%*?&).</Text>
            <TextInput style={styles.authInput} placeholder="Create Password (min 4 chars)" placeholderTextColor="#888" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
            <TextInput style={styles.authInput} placeholder="Confirm Password" placeholderTextColor="#888" secureTextEntry value={confirmNewPassword} onChangeText={setConfirmNewPassword} onSubmitEditing={handleCreatePassword} />
            <TouchableOpacity style={styles.authButton} onPress={handleCreatePassword} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#000"/> : <Text style={styles.authButtonText}>Create and Continue</Text>}
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
          <Ionicons name="home-outline" size={28} color="#FFD700" />
        </TouchableOpacity>
      </View>
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
          <Ionicons name="chevron-back-outline" size={28} color="#FFD700" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCalendarVisible(true)}>
          <Text style={styles.monthText}>{dayjs(selectedMonth).format('MMMM YYYY')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
          <Ionicons name="chevron-forward-outline" size={28} color="#FFD700" />
        </TouchableOpacity>
      </View>
      <View style={styles.summarySection}>
        <View style={styles.summaryCardCompact}>
          <Text style={styles.summaryTitleCompact}>Net Profit ({dayjs(selectedMonth).format('MMMM')})</Text>
          <Text style={[styles.summaryTotalCompact, {color: monthlyTotals.netProfit >= 0 ? '#4CAF50' : '#FF6347'}]}>
            ${monthlyTotals.netProfit.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryCardCompact}>
          <Text style={styles.summaryTitleCompact}>Bank Balance</Text>
          <Text style={[styles.summaryTotalCompact, {color: bankBalance >= 0 ? '#FFD700' : '#FF6347'}]}>
            ${bankBalance.toFixed(2)}
          </Text>
          {bankBalance <= 0 && (
            <Text style={styles.addAmountWarning}>Please add funds to your bank balance!</Text>
          )}
        </View>
      </View>

      {/* Button Group for Bank Actions (Set Bank Balance & View History) */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity onPress={() => setBankModalVisible(true)} style={styles.mainActionButton}>
          <Ionicons name="wallet-outline" size={18} color="#000" />
          <Text style={styles.mainActionButtonText}>Adjust Balance</Text> {/* Shortened text */}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpenBankHistory} style={styles.mainActionButton}>
          <Ionicons name="receipt-outline" size={18} color="#000" />
          <Text style={styles.mainActionButtonText}>View Bank History</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity onPress={handleExportToCSV} style={styles.mainActionButton}>
          <Ionicons name="share-outline" size={18} color="#000" />
          <Text style={styles.mainActionButtonText}>Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePrint} style={styles.mainActionButton}>
          <Ionicons name="print-outline" size={18} color="#000" />
          <Text style={styles.mainActionButtonText}>Print Month</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#FFD700" style={styles.loadingIndicator} />
      ) : reports.length === 0 ? (
        <Text style={styles.noDataText}>No data available for {dayjs(selectedMonth).format('MMMM YYYY')}.</Text>
      ) : (
        <FlatList
          ref={flatListRef}
          data={reports}
          keyExtractor={(item) => item.date}
          renderItem={renderReportCard}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Calendar Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCalendarVisible}
        onRequestClose={() => setCalendarVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCalendarVisible(false)}>
          <View style={styles.calendarModalContent}>
            <Calendar
              onDayPress={handleDayPress}
              markedDates={markedDates}
              current={selectedMonth.toISOString()}
              theme={{
                backgroundColor: '#1C1C1C', // Dark background for calendar
                calendarBackground: '#1C1C1C',
                textSectionTitleColor: '#FFD700', // Gold for day titles (Mon, Tue)
                selectedDayBackgroundColor: '#FFD700', // Gold for selected day
                selectedDayTextColor: '#000000', // Black text on selected day
                todayTextColor: '#FFD700', // Gold for today
                dayTextColor: '#FFFFFF', // White for other days
                textDisabledColor: '#444444',
                dotColor: '#FFD700',
                selectedDotColor: '#000000',
                arrowColor: '#FFD700', // Gold for month navigation arrows
                monthTextColor: '#FFD700', // Gold for month name
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '500',
              }}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCalendarVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Expense Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isExpenseModalVisible}
        onRequestClose={() => setExpenseModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setExpenseModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingExpenseId ? "Edit Expense" : "Add New Expense"}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="Notes (optional)"
              placeholderTextColor="#888"
              multiline
              value={expenseNotes}
              onChangeText={setExpenseNotes}
            />
            <Text style={styles.modalDateText}>For Date: {dayjs(expenseDate).format('MMMM D,YYYY')}</Text>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={editingExpenseId ? handleEditExpense : handleSaveExpense}
              disabled={isSubmittingExpense}
            >
              {isSubmittingExpense ? <ActivityIndicator color="#000"/> : <Text style={styles.modalPrimaryButtonText}>{editingExpenseId ? "Update Expense" : "Save Expense"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setExpenseModalVisible(false)}>
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Daily Expenses List Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDailyExpensesListModalVisible}
        onRequestClose={() => setDailyExpensesListModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDailyExpensesListModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Expenses for {dayjs(selectedDayForExpenses).format('MMMM D,YYYY')}</Text>
            {currentDayExpenses.length === 0 ? (
              <Text style={styles.noDataText}>No expenses for this day.</Text>
            ) : (
              <FlatList
                data={currentDayExpenses}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.expenseListItem}>
                    <Text style={styles.expenseListItemText}>${item.amount.toFixed(2)} - {item.notes}</Text>
                    <View style={styles.expenseListItemActions}>
                      <TouchableOpacity onPress={() => openExpenseModal(item.date, item)}>
                        <Ionicons name="create-outline" size={24} color="#FFD700" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteExpense(item)}>
                        <Ionicons name="trash-outline" size={24} color="#FF6347" style={{ marginLeft: 10 }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setDailyExpensesListModalVisible(false)}>
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Bank Balance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isBankModalVisible}
        onRequestClose={() => setBankModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBankModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adjust Bank Balance</Text> {/* Shortened title */}
            <TextInput
              style={styles.modalInput}
              placeholder="Amount to add/subtract (e.g., 100 or -50)"
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={bankInput}
              onChangeText={setBankInput}
            />
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleSetBankBalance}>
              <Text style={styles.modalPrimaryButtonText}>Update Balance</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setBankModalVisible(false)}>
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Bank History Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isBankHistoryModalVisible}
        onRequestClose={() => setBankHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBankHistoryModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bank Balance History</Text>
            {loadingBankHistory ? (
              <ActivityIndicator size="large" color="#FFD700" />
            ) : bankHistory.length === 0 ? (
              <Text style={styles.noDataText}>No bank history available.</Text>
            ) : (
              <FlatList
                data={bankHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.historyListItem}>
                    <Text style={styles.historyListItemDate}>{dayjs(item.timestamp.toDate()).format('MM/DD/YYYY h:mm A')}</Text>
                    <Text style={styles.historyListItemText}>
                        Type: <Text style={{ color: item.type === 'add' ? '#4CAF50' : item.type === 'expense' ? '#FF6347' : '#FFFFFF' }}>{item.type}</Text>
                    </Text>
                    <Text style={styles.historyListItemText}>
                        Change: <Text style={{ color: item.amount >= 0 ? '#4CAF50' : '#FF6347' }}>${item.amount.toFixed(2)}</Text>
                    </Text>
                    <Text style={styles.historyListItemText}>
                        New Balance: <Text style={{ color: item.newBalance >= 0 ? '#FFD700' : '#FF6347' }}>${item.newBalance.toFixed(2)}</Text>
                    </Text>
                    {item.notes && <Text style={styles.historyListItemNotes}>Notes: {item.notes}</Text>}
                  </View>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setBankHistoryModalVisible(false)}>
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // Very dark background
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 30,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for header
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#1C1C1C', // Slightly lighter dark for the selector
    borderRadius: 10,
    paddingVertical: 10,
  },
  monthButton: {
    padding: 10,
  },
  monthText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for month text
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryCardCompact: {
    flex: 1,
    backgroundColor: '#1C1C1C', // Dark background for summary cards
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#333333', // Subtle border
  },
  summaryTitleCompact: {
    fontSize: 14,
    color: '#CCCCCC', // Light grey for titles
    marginBottom: 5,
    fontWeight: '600',
  },
  summaryTotalCompact: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  addAmountWarning: {
    fontSize: 12,
    color: '#FF6347', // Red for warning
    marginTop: 5,
    textAlign: 'center',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  // Main action buttons (Export, Print, Bank)
  mainActionButton: {
    backgroundColor: '#FFD700', // Gold button
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
    flex: 1,
  },
  mainActionButtonText: {
    color: '#000000', // Black text on gold button
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  loadingIndicator: {
    marginTop: 50,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1C1C1C', // Dark background for report cards
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#333333',
  },
  cardDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for card date
    marginBottom: 10,
  },
  divider: {
    borderBottomColor: '#444444', // Darker divider
    borderBottomWidth: 1,
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 16,
    color: '#CCCCCC', // Light grey for labels
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF', // Set default value color to white
  },
  notesSection: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#FFD700', // Gold accent for notes
  },
  notesTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 5,
  },
  noteText: {
    fontSize: 14,
    color: '#AAAAAA', // Slightly lighter grey for notes
  },
  // Action buttons specific to the report card
  cardActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333', // Dark button background
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10, // Adjusted margin to prevent clash with previous margin
    borderWidth: 1,
    borderColor: '#FFD700', // Gold border
  },
  cardActionButtonText: {
    color: '#FFD700', // Gold text
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  noDataText: {
    color: '#CCCCCC',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker overlay
  },
  modalContent: {
    backgroundColor: '#1C1C1C', // Dark background for modal content
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#FFD700', // Gold border for modals
  },
  calendarModalContent: {
    backgroundColor: '#1C1C1C',
    borderRadius: 15,
    padding: 10,
    width: '95%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#FFD700', // Gold title
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#333333', // Dark input background
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    color: '#FFFFFF', // White text input
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#555555',
  },
  modalDateText: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 15,
  },
  // Primary button for modals (e.g., Save, Update)
  modalPrimaryButton: {
    backgroundColor: '#FFD700', // Gold button
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalPrimaryButtonText: {
    color: '#000000', // Black text
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Secondary button for modals (e.g., Cancel, Close)
  modalSecondaryButton: {
    backgroundColor: '#333333', // Dark cancel button
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  modalSecondaryButtonText: {
    color: '#FFD700', // Gold text
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: { // Specific close button for calendar modal
    backgroundColor: '#333333',
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  modalCloseButtonText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  expenseListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A2A', // Slightly lighter dark for list items
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: '#444444',
  },
  expenseListItemText: {
    fontSize: 16,
    color: '#FFFFFF', // White text
    flexShrink: 1,
    paddingRight: 10,
  },
  expenseListItemActions: {
    flexDirection: 'row',
  },
  historyListItem: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: '#444444',
  },
  historyListItemDate: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 5,
  },
  historyListItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  historyListItemNotes: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#CCCCCC',
    marginTop: 5,
  },
  // Auth Specific Styles
  authContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  authCard: {
    backgroundColor: '#1C1C1C',
    borderRadius: 15,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  authHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  authSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  authInput: {
    width: '100%',
    backgroundColor: '#333333',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#555555',
  },
  authButton: { // This is the primary button for the auth screen
    backgroundColor: '#FFD700',
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  authButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  forgotButton: {
    marginTop: 10,
  },
  forgotButtonText: {
    color: '#FFD700',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});