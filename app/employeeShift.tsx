// app/employeeShift.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
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
import { db } from '../firebaseConfig';

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
  // startTime will be stored as a string from AsyncStorage, so we manage it as such
  const [startTime, setStartTime] = useState<string | null>(null); 
  const [newMachine, setNewMachine] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const restoreShiftState = async () => {
      const savedShift = await AsyncStorage.getItem('ongoingShift');
      if (savedShift) {
        const parsed = JSON.parse(savedShift);
        setEmployeeName(parsed.employeeName);
        setShiftId(parsed.shiftId);
        setStartTime(parsed.startTime); // Keep as string from JSON
        setIsShiftStarted(true);
        setIsShiftEnding(parsed.isShiftEnding || false);
        setMachineData(parsed.machineData || {});
      }
    };
    restoreShiftState();
  }, []);

  const addMachine = () => {
    if (!newMachine.trim()) return;
    const machineKey = newMachine.trim();
    if (machineData[machineKey]) {
      Alert.alert('Duplicate Machine', `Machine ${machineKey} has already been added.`);
      return;
    }
    setMachineData((prev) => ({
      ...prev,
      [machineKey]: { in: '', out: '' },
    }));
    setNewMachine('');
  };

  const handleStartShift = async () => {
    if (!employeeName.trim()) {
      Alert.alert('Please enter employee name');
      return;
    }
    const newShiftId = `${employeeName.trim().replace(/\s+/g, '_')}_${Date.now()}`;
    const newStartTime = new Date();
    setShiftId(newShiftId);
    setStartTime(newStartTime.toISOString()); // Store as ISO string
    setIsShiftStarted(true);
    await AsyncStorage.setItem('ongoingShift', JSON.stringify({
      employeeName,
      shiftId: newShiftId,
      startTime: newStartTime.toISOString(),
      isShiftEnding: false,
      machineData: {}
    }));
    Alert.alert('Shift Started', `Shift for ${employeeName} has begun.`);
  };

  const handleEndShift = async () => {
    setIsShiftEnding(true);
    const current = await AsyncStorage.getItem('ongoingShift');
    if (current) {
      const parsed = JSON.parse(current);
      parsed.isShiftEnding = true;
      await AsyncStorage.setItem('ongoingShift', JSON.stringify(parsed));
    }
  };

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
      const ownerId = await AsyncStorage.getItem('ownerId');
      if (!ownerId) throw new Error('Owner ID not found');

      const endTime = new Date();
      // FIX 1: Convert the startTime string from state into a valid Date object for comparison.
      const shiftStartDate = startTime ? new Date(startTime) : null;

      let totalIn = 0;
      let totalOut = 0;
      const machines: any = {};
      Object.entries(machineData).forEach(([machine, { in: inAmt, out: outAmt }]) => {
        const inNum = parseFloat(inAmt) || 0;
        const outNum = parseFloat(outAmt) || 0;
        machines[machine] = { in: inNum, out: outNum };
        totalIn += inNum;
        totalOut += outNum;
      });
      const profitOrLoss = totalOut - totalIn;
      const carryForward = totalOut;
      const visitSnapshot = await getDocs(collection(db, `owners/${ownerId}/visitHistory`));
      let totalMatchedAmount = 0;
      
      visitSnapshot.forEach(doc => {
        const data = doc.data();
        
        // FIX 2: Robustly get the visit time.
        // If data.timestamp has a .toDate() method, it's a Firestore Timestamp. Use it.
        // Otherwise, assume it's an ISO string (from older saves) and create a Date object.
        const visitTime = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);

        const match = typeof data.matchAmount === 'number' ? data.matchAmount : 0;
        
        // FIX 3: Ensure both dates are valid before comparing.
        if (visitTime && shiftStartDate && visitTime >= shiftStartDate && visitTime <= endTime) {
          totalMatchedAmount += match;
        }
      });
      
      await setDoc(doc(db, `owners/${ownerId}/shifts`, shiftId), {
        employeeName, 
        startTime: startTime, // Save the original startTime string
        endTime: endTime.toISOString(), 
        machines, 
        totalIn, 
        totalOut, 
        profitOrLoss, 
        carryForward, 
        totalMatchedAmount, 
        timestamp: Timestamp.now(),
      });
      
      await AsyncStorage.removeItem('ongoingShift');
      Alert.alert('Shift Saved!', 'The shift data has been successfully recorded.');
      setIsShiftStarted(false);
      setIsShiftEnding(false);
      setEmployeeName('');
      setMachineData({});
      setShiftId('');
      setStartTime(null);
    } catch (error: any) {
      Alert.alert('Error Saving Shift', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMachineInput = (machine: string, type: 'in' | 'out', value: string) => {
    setMachineData((prev) => {
      const updated = { ...prev, [machine]: { ...prev[machine], [type]: value } };
      AsyncStorage.mergeItem('ongoingShift', JSON.stringify({ machineData: updated }));
      return updated;
    });
  };

  const liveTotalIn = Object.values(machineData).reduce((sum, val) => sum + (parseFloat(val.in) || 0), 0);
  const liveTotalOut = Object.values(machineData).reduce((sum, val) => sum + (parseFloat(val.out) || 0), 0);
  const liveProfit = liveTotalOut - liveTotalIn;
  const liveProfitColor = liveProfit >= 0 ? '#28a745' : '#dc3545';
  const liveProfitLabel = liveProfit >= 0 ? 'Profit' : 'Loss';

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
            <IconTextInput
              iconName="person-circle-outline"
              placeholder="Enter Employee Name"
              value={employeeName}
              onChangeText={setEmployeeName}
            />
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
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Finalize Shift for {employeeName}</Text>
            <Text style={styles.subHeader}>Enter Machine Data</Text>
            
            <View style={styles.addMachineRow}>
              <IconTextInput
                iconName="add-circle-outline"
                placeholder="Machine #"
                value={newMachine}
                onChangeText={setNewMachine}
                onSubmitEditing={addMachine}
                keyboardType="number-pad"
              />
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
                </View>
                {Object.keys(machineData).sort((a,b) => parseInt(a) - parseInt(b)).map((machine) => (
                  <View key={machine} style={styles.machineRow}>
                    <Text style={[styles.machineCell, styles.machineLabel]}>{machine}</Text>
                    <TextInput placeholder="0" keyboardType="numeric" style={[styles.machineCell, styles.machineInput]} value={machineData[machine]?.in || ''} onChangeText={(text) => handleMachineInput(machine, 'in', text)} />
                    <TextInput placeholder="0" keyboardType="numeric" style={[styles.machineCell, styles.machineInput]} value={machineData[machine]?.out || ''} onChangeText={(text) => handleMachineInput(machine, 'out', text)} />
                  </View>
                ))}
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.summaryContainer}>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total In:</Text>
                    <Text style={styles.summaryValue}>${liveTotalIn.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Out:</Text>
                    <Text style={styles.summaryValue}>${liveTotalOut.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, {fontWeight: 'bold'}]}>{liveProfitLabel}:</Text>
                    <Text style={[styles.summaryValue, {color: liveProfitColor, fontWeight: 'bold'}]}>${Math.abs(liveProfit).toFixed(2)}</Text>
                </View>
            </View>
            
            <TouchableOpacity style={[styles.button, styles.successButton]} onPress={handleSaveShift} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#fff"/> :
                <>
                  <Ionicons name="save-outline" size={24} color="#fff" />
                  <Text style={styles.buttonText}>Save Shift</Text>
                </>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#f0f2f5',
    flexGrow: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginTop: 40,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: '#333',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  warningButton: {
    backgroundColor: '#ffc107',
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  activeShiftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  activeShiftText: {
    fontSize: 16,
    color: '#856404',
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 15,
  },
  addMachineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  addButton: {
    marginLeft: 10,
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    height: 55,
    justifyContent: 'center',
    borderRadius: 12,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  machineTable: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  machineTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  machineHeadertext: {
    fontWeight: 'bold',
    color: '#495057',
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  machineCell: {
    padding: 12,
    fontSize: 16,
    flex: 1,
  },
  machineLabel: {
    fontWeight: '500',
    color: '#333',
  },
  machineInput: {
    backgroundColor: '#fff',
    textAlign: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#e9ecef',
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 15,
  },
  summaryContainer: {
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6c757d',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#343a40',
  },
});