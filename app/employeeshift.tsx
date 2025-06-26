// app/employeeShift.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.inputContainer}>
    <Ionicons name={iconName} size={22} color="#888" style={styles.inputIcon} />
    <TextInput style={styles.input} {...props} placeholderTextColor="#aaa" />
  </View>
);

export default function EmployeeShift() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState('');
  const [machineData, setMachineData] = useState<{ [key: string]: { in: string; out: string } }>({});
  const [isShiftStarted, setIsShiftStarted] = useState(false);
  const [isShiftEnding, setIsShiftEnding] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [newMachine, setNewMachine] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [shiftNotes, setShiftNotes] = useState('');

  // Function to get the unique storage key for the current user's ongoing shift
  const getStorageKey = () => {
    const user = auth.currentUser;
    return user ? `ongoingShift_${user.uid}` : null;
  };

  // Effect to listen for authentication state changes and set readiness
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsReady(true);
      } else {
        // Redirect to owner login if no user is authenticated
        router.replace('/owner');
      }
    });
    return () => unsubscribe(); // Cleanup subscription
  }, [router]);

  // Effect to restore ongoing shift state from AsyncStorage on component mount
  useEffect(() => {
    if (!isReady) return; // Only run if auth is ready

    const restoreShiftState = async () => {
      const storageKey = getStorageKey();
      if (!storageKey) return; // No storage key if user is not identified

      const savedShift = await AsyncStorage.getItem(storageKey);
      if (savedShift) {
        const parsed = JSON.parse(savedShift);
        setEmployeeName(parsed.employeeName);
        setShiftId(parsed.shiftId);
        setStartTime(parsed.startTime);
        setIsShiftStarted(true);
        setIsShiftEnding(parsed.isShiftEnding || false);
        setMachineData(parsed.machineData || {});
        setShiftNotes(parsed.shiftNotes || '');
      }
    };
    restoreShiftState();
  }, [isReady]); // Rerun when auth readiness changes

  // Function to add a new machine input field
  const addMachine = () => {
    if (!newMachine.trim()) return; // Prevent adding empty machine numbers
    const machineKey = newMachine.trim();
    if (machineData[machineKey]) {
      Alert.alert('Duplicate Machine', `Machine ${machineKey} has already been added.`);
      return;
    }
    setMachineData((prev) => ({
      ...prev,
      [machineKey]: { in: '', out: '' }, // Initialize with empty strings
    }));
    setNewMachine(''); // Clear the input field
  };

  // Function to handle deleting a machine from the list
  const handleDeleteMachine = (machineToDelete: string) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to remove Machine ${machineToDelete}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const storageKey = getStorageKey();
            if (!storageKey) return;
            setMachineData((prev) => {
              const updatedData = { ...prev };
              delete updatedData[machineToDelete]; // Remove the machine
              // Merge updated machine data back into AsyncStorage
              AsyncStorage.mergeItem(storageKey, JSON.stringify({ machineData: updatedData }));
              return updatedData;
            });
          },
        },
      ]
    );
  };

  // Function to start a new shift
  const handleStartShift = async () => {
    if (!employeeName.trim()) {
      Alert.alert('Please enter employee name');
      return;
    }
    const storageKey = getStorageKey();
    if (!storageKey) {
        Alert.alert("Error", "Could not start shift. User not identified.");
        return;
    }

    const newShiftId = `${employeeName.trim().replace(/\s+/g, '_')}_${Date.now()}`;
    const newStartTime = new Date();
    setShiftId(newShiftId);
    setStartTime(newStartTime.toISOString());
    setIsShiftStarted(true);
    // Save initial shift state to AsyncStorage
    await AsyncStorage.setItem(storageKey, JSON.stringify({
      employeeName,
      shiftId: newShiftId,
      startTime: newStartTime.toISOString(),
      isShiftEnding: false, // Mark shift as not ending yet
      machineData: {}, // Start with empty machine data
      shiftNotes: '' // Start with empty notes
    }));
    Alert.alert('Shift Started', `Shift for ${employeeName} has begun.`);
  };

  // Function to transition to the "ending shift" state (inputting machine data)
  const handleEndShift = async () => {
    setIsShiftEnding(true); // Set state to show the machine data input fields
    const storageKey = getStorageKey();
    if (!storageKey) return;
    const current = await AsyncStorage.getItem(storageKey);
    if (current) {
      const parsed = JSON.parse(current);
      parsed.isShiftEnding = true; // Update AsyncStorage
      await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
    }
  };

  // Function to handle changes in shift notes and save to AsyncStorage
  const handleNotesInput = (text: string) => {
    setShiftNotes(text);
    const storageKey = getStorageKey();
    if (!storageKey) return;
    AsyncStorage.mergeItem(storageKey, JSON.stringify({ shiftNotes: text }));
  };

  // Function to handle changes in machine 'in' or 'out' amounts and save to AsyncStorage
  const handleMachineInput = (machine: string, type: 'in' | 'out', value: string) => {
    const storageKey = getStorageKey();
    if (!storageKey) return;
    setMachineData((prev) => {
      const updated = { ...prev, [machine]: { ...prev[machine], [type]: value } };
      AsyncStorage.mergeItem(storageKey, JSON.stringify({ machineData: updated }));
      return updated;
    });
  };

  // Function to discard the current ongoing shift
  const handleDiscardShift = () => {
    Alert.alert(
      "Discard Shift",
      "Are you sure you want to discard this entire shift? All entered data will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            const storageKey = getStorageKey();
            if (storageKey) {
              await AsyncStorage.removeItem(storageKey); // Clear data from AsyncStorage
            }
            // Reset all state variables
            setIsShiftStarted(false);
            setIsShiftEnding(false);
            setEmployeeName('');
            setMachineData({});
            setShiftId('');
            setStartTime(null);
            setShiftNotes('');
          }
        }
      ]
    );
  };

  // Function to save the completed shift to Firestore and update bank balance
  const handleSaveShift = async () => {
    setIsSubmitting(true);
    try {
      const hasMachineInput = Object.values(machineData).some(
        ({ in: i, out: o }) => (i && parseFloat(i) > 0) || (o && parseFloat(o) > 0)
      );
      if (!hasMachineInput) {
        Alert.alert('Missing Data', 'Please enter amounts for at least one machine.');
        setIsSubmitting(false);
        return;
      }
      const user = auth.currentUser;
      if (!user) { throw new Error('Owner not logged in. Please restart the app.'); }
      const ownerId = user.uid;
      const endTime = new Date();
      const shiftStartDate = startTime ? new Date(startTime) : null;

      let totalIn = 0, totalOut = 0;
      const machines: { [key: string]: { in: number, out: number } } = {};
      Object.entries(machineData).forEach(([machine, { in: inAmt, out: outAmt }]) => {
        const inNum = parseFloat(inAmt) || 0;
        const outNum = parseFloat(outAmt) || 0;
        machines[machine] = { in: inNum, out: outNum };
        totalIn += inNum;
        totalOut += outNum;
      });

      // Calculate profitOrLoss based on totalIn and totalOut for display/storage in Firestore
      const profitOrLoss = totalIn - totalOut;
      const carryForward = totalOut; // Your specific business logic variable

      let totalMatchedAmount = 0;
      // Query visit history within the shift time frame to calculate totalMatchedAmount
      const visitSnapshot = await getDocs(collection(db, `owners/${ownerId}/visitHistory`));
      visitSnapshot.forEach(doc => {
        const data = doc.data();
        const visitTime = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
        if (visitTime && shiftStartDate && visitTime >= shiftStartDate && visitTime <= endTime) {
          totalMatchedAmount += data.matchAmount || 0;
        }
      });

      // --- START NEW BANK BALANCE UPDATE LOGIC ---
      // Calculate the actual net impact of THIS shift on the bank balance
      // This is (Total In - Total Out) - Matched Amount
      const shiftNetImpactOnBank = profitOrLoss - totalMatchedAmount; // profitOrLoss is already (totalIn - totalOut)

      const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
      let currentBankBalance = parseFloat(currentBankBalanceStr || '0');

      // Update the bank balance by adding (or subtracting if negative) the shift's net impact
      currentBankBalance += shiftNetImpactOnBank;
      await AsyncStorage.setItem('bankBalance', currentBankBalance.toString()); // Persist the updated balance

      // No explicit state update for bankBalance here, as ProfitLossScreen will re-read it.
      // --- END NEW BANK BALANCE UPDATE LOGIC ---

      // Save the complete shift data to Firestore
      await setDoc(doc(db, `owners/${ownerId}/shifts`, shiftId), {
        employeeName,
        startTime,
        endTime: endTime.toISOString(),
        machines,
        totalIn,
        totalOut,
        profitOrLoss, // This value is (totalIn - totalOut)
        carryForward,
        totalMatchedAmount,
        notes: shiftNotes.trim(),
        timestamp: Timestamp.now(), // Firestore timestamp for server-side accuracy
      });

      // Clear ongoing shift data from AsyncStorage after successful save
      const storageKey = getStorageKey();
      if (storageKey) await AsyncStorage.removeItem(storageKey);

      Alert.alert('Shift Saved!', 'The shift data has been successfully recorded and bank balance updated.');
      // Reset all state variables to prepare for a new shift
      setIsShiftStarted(false);
      setIsShiftEnding(false);
      setEmployeeName('');
      setMachineData({});
      setShiftId('');
      setStartTime(null);
      setShiftNotes('');
    } catch (error: any) {
      Alert.alert('Error Saving Shift', error.message);
    } finally {
      setIsSubmitting(false); // Disable loading indicator
    }
  };

  // Render loading indicator if not ready
  if (!isReady) {
    return (
        <View style={styles.centered}>
            <ActivityIndicator size="large" color="#007bff" />
        </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Shift Control</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {!isShiftStarted ? (
          <>
            <Text style={styles.cardTitle}>Start New Shift</Text>
            <IconTextInput iconName="person-circle-outline" placeholder="Enter Employee Name" value={employeeName} onChangeText={setEmployeeName} />
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleStartShift}>
              <Ionicons name="play-circle-outline" size={24} color="#fff" />
              <Text style={styles.buttonText}>Start Shift</Text>
            </TouchableOpacity>
          </>
        ) : !isShiftEnding ? (
          <>
            <Text style={styles.cardTitle}>Shift Active</Text>
            <View style={styles.activeShiftInfo}>
              <Ionicons name="time-outline" size={40} color="#ffc107" />
              <View style={{marginLeft: 15}}>
                <Text style={styles.activeShiftText}>Employee: <Text style={{fontWeight: 'bold'}}>{employeeName}</Text></Text>
                <Text style={styles.activeShiftText}>Started at: {startTime ? new Date(startTime).toLocaleTimeString() : ''}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={handleEndShift}>
              <Ionicons name="stop-circle-outline" size={24} color="#fff" />
              <Text style={styles.buttonText}>End & Finalize Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleDiscardShift}>
              <Ionicons name="trash-bin-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Discard Shift</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Finalize Shift for {employeeName}</Text>
            <Text style={styles.subHeader}>Enter Machine Data</Text>
            <View style={styles.addMachineRow}>
              <IconTextInput iconName="add-circle-outline" placeholder="Machine #" value={newMachine} onChangeText={setNewMachine} onSubmitEditing={addMachine} keyboardType="number-pad" />
              <TouchableOpacity onPress={addMachine} style={styles.addButton}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            {Object.keys(machineData).length > 0 && (
              <View style={styles.machineTable}>
                <View style={styles.machineTableHeader}>
                  <Text style={[styles.machineCell, styles.machineHeadertext]}>Machine</Text>
                  <Text style={[styles.machineCell, styles.machineHeadertext, {textAlign: 'center'}]}>In ($)</Text>
                  <Text style={[styles.machineCell, styles.machineHeadertext, {textAlign: 'center'}]}>Out ($)</Text>
                  <View style={styles.deleteButtonHeader} />
                </View>
                {Object.keys(machineData).sort((a,b) => parseInt(a) - parseInt(b)).map((machine) => (
                  <View key={machine} style={styles.machineRow}>
                    <Text style={[styles.machineCell, styles.machineLabel]}>{machine}</Text>
                    <TextInput placeholder="0" keyboardType="numeric" style={[styles.machineCell, styles.machineInput]} value={machineData[machine]?.in || ''} onChangeText={(text) => handleMachineInput(machine, 'in', text)} />
                    <TextInput placeholder="0" keyboardType="numeric" style={[styles.machineCell, styles.machineInput]} value={machineData[machine]?.out || ''} onChangeText={(text) => handleMachineInput(machine, 'out', text)} />
                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteMachine(machine)}>
                      <Ionicons name="trash-outline" size={22} color="#dc3545" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.notesContainer}>
              <Text style={styles.subHeader}>Shift Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g., Machine 5 was reset at 3 PM..."
                multiline
                value={shiftNotes}
                onChangeText={handleNotesInput}
              />
            </View>

            <TouchableOpacity style={[styles.button, styles.successButton]} onPress={handleSaveShift} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#fff"/> :
                <>
                  <Ionicons name="save-outline" size={24} color="#fff" />
                  <Text style={styles.buttonText}>Save Shift</Text>
                </>
              }
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleDiscardShift}>
              <Ionicons name="close-circle-outline" size={22} color="#fff" />
              <Text style={styles.buttonText}>Cancel & Discard</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 10, backgroundColor: '#f0f2f5', flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, marginTop: 40 },
  header: { fontSize: 26, fontWeight: 'bold', color: '#1c1c1e' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginVertical: 10, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 },
  cardTitle: { fontSize: 22, fontWeight: '600', color: '#333', textAlign: 'center', marginBottom: 24 },
  inputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 55, fontSize: 16, color: '#333' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 15, marginTop: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  primaryButton: { backgroundColor: '#007bff' },
  warningButton: { backgroundColor: '#ffc107' },
  successButton: { backgroundColor: '#28a745' },
  dangerButton: { backgroundColor: '#dc3545', },
  activeShiftInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3cd', padding: 20, borderRadius: 12, marginBottom: 20 },
  activeShiftText: { fontSize: 16, color: '#856404' },
  subHeader: { fontSize: 18, fontWeight: '600', color: '#495057', marginBottom: 15 },
  addMachineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  addButton: { marginLeft: 10, backgroundColor: '#007bff', paddingHorizontal: 20, height: 55, justifyContent: 'center', borderRadius: 12 },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  machineTable: { borderWidth: 1, borderColor: '#e9ecef', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  machineTableHeader: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  machineHeadertext: { fontWeight: 'bold', color: '#495057', padding: 12, flex: 1, },
  machineRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  machineCell: { padding: 12, fontSize: 16, flex: 1 },
  machineLabel: { fontWeight: '500', color: '#333' },
  machineInput: { backgroundColor: '#fff', textAlign: 'center', borderLeftWidth: 1, borderLeftColor: '#e9ecef' },
  deleteButton: { padding: 12, borderLeftWidth: 1, borderLeftColor: '#e9ecef', },
  deleteButtonHeader: { padding: 12, width: 46, },
  notesContainer: { marginVertical: 20, },
  notesInput: { backgroundColor: '#f8f8f8', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top', height: 100, },
});
