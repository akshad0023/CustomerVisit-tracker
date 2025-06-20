// app/employeeShift.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

export default function EmployeeShift() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState('');
  const [machineData, setMachineData] = useState<{ [key: string]: { in: string; out: string } }>({});
  const [isShiftStarted, setIsShiftStarted] = useState(false);
  const [isShiftEnding, setIsShiftEnding] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [newMachine, setNewMachine] = useState('');

  useEffect(() => {
    const restoreShiftState = async () => {
      const savedShift = await AsyncStorage.getItem('ongoingShift');
      if (savedShift) {
        const parsed = JSON.parse(savedShift);
        setEmployeeName(parsed.employeeName);
        setShiftId(parsed.shiftId);
        setStartTime(new Date(parsed.startTime));
        setIsShiftStarted(true);
        setIsShiftEnding(parsed.isShiftEnding || false);
        setMachineData(parsed.machineData || {});
      }
    };
    restoreShiftState();
  }, []);

  // Removed static machineNumbers

  const addMachine = () => {
    if (!newMachine.trim()) return;
    setMachineData((prev) => ({
      ...prev,
      [newMachine.trim()]: { in: '', out: '' },
    }));
    setNewMachine('');
  };

  const handleStartShift = async () => {
    if (!employeeName.trim()) {
      Alert.alert('Please enter employee name');
      return;
    }
    const newShiftId = `${employeeName}_${Date.now()}`;
    setShiftId(newShiftId);
    setStartTime(new Date());
    setIsShiftStarted(true);
    await AsyncStorage.setItem('ongoingShift', JSON.stringify({
      employeeName,
      shiftId: newShiftId,
      startTime: new Date(),
      isShiftEnding: false,
      machineData: {}
    }));
    Alert.alert('Shift Started');
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
    try {
      const hasMachineInput = Object.values(machineData).some(
        ({ in: i, out: o }) => parseFloat(i) > 0 || parseFloat(o) > 0
      );
      if (!hasMachineInput) {
        Alert.alert('Please enter amounts for at least one machine');
        return;
      }

      const ownerId = await AsyncStorage.getItem('ownerId');
      if (!ownerId) throw new Error('Owner ID not found');

      const endTime = new Date();
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
        const visitTime = data.timestamp?.toDate?.();
        const match = typeof data.matchedAmount === 'number' ? data.matchedAmount : 0;
        if (
          visitTime &&
          startTime &&
          visitTime >= startTime &&
          visitTime <= endTime
        ) {
          totalMatchedAmount += match;
        }
      });

      await setDoc(doc(db, `owners/${ownerId}/shifts`, shiftId), {
        employeeName,
        startTime: startTime?.toISOString(),
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

      Alert.alert('Shift saved successfully!');
      setIsShiftStarted(false);
      setIsShiftEnding(false);
      setEmployeeName('');
      setMachineData({});
      setShiftId('');
      setStartTime(null);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleMachineInput = (machine: string, type: 'in' | 'out', value: string) => {
    setMachineData((prev) => {
      const updated = {
        ...prev,
        [machine]: {
          ...prev[machine],
          [type]: value,
        },
      };
      AsyncStorage.mergeItem('ongoingShift', JSON.stringify({ machineData: updated }));
      return updated;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => router.push('/')}>
        <Text style={{ textAlign: 'right', color: 'blue', marginBottom: 10 }}>🏠 Home</Text>
      </TouchableOpacity>
      <Text style={styles.header}>Employee Shift Tracker</Text>

      {!isShiftStarted ? (
        <>
          <TextInput
            placeholder="Enter Employee Name"
            style={styles.input}
            value={employeeName}
            onChangeText={setEmployeeName}
          />
          <TouchableOpacity style={styles.button} onPress={handleStartShift}>
            <Text style={styles.buttonText}>Start Shift</Text>
          </TouchableOpacity>
        </>
      ) : !isShiftEnding ? (
        <>
          <Text>Shift started for: {employeeName}</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: 'orange' }]} onPress={handleEndShift}>
            <Text style={styles.buttonText}>End Shift</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.subHeader}>Enter Machine Amounts</Text>
          <View style={styles.addMachineRow}>
            <TextInput
              placeholder="Enter Machine #"
              value={newMachine}
              onChangeText={setNewMachine}
              style={styles.machineInput}
            />
            <TouchableOpacity onPress={addMachine} style={[styles.button, { marginLeft: 10, paddingVertical: 8 }]}>
              <Text style={styles.buttonText}>Add</Text>
            </TouchableOpacity>
          </View>
          {Object.keys(machineData).map((machine) => (
            <View key={machine} style={styles.machineRow}>
              <Text style={styles.machineLabel}>{machine}</Text>
              <TextInput
                placeholder="In"
                keyboardType="numeric"
                style={styles.machineInput}
                value={machineData[machine]?.in || ''}
                onChangeText={(text) => handleMachineInput(machine, 'in', text)}
              />
              <TextInput
                placeholder="Out"
                keyboardType="numeric"
                style={styles.machineInput}
                value={machineData[machine]?.out || ''}
                onChangeText={(text) => handleMachineInput(machine, 'out', text)}
              />
            </View>
          ))}

          <Text>Total In: ${Object.values(machineData).reduce((sum, val) => sum + (parseFloat(val.in) || 0), 0)}</Text>
          <Text>Total Out: ${Object.values(machineData).reduce((sum, val) => sum + (parseFloat(val.out) || 0), 0)}</Text>
          <Text style={{ color: Object.values(machineData).reduce((outSum, val) => outSum + (parseFloat(val.out) || 0), 0) - Object.values(machineData).reduce((inSum, val) => inSum + (parseFloat(val.in) || 0), 0) >= 0 ? 'green' : 'red' }}>
            {
              Object.values(machineData).reduce((outSum, val) => outSum + (parseFloat(val.out) || 0), 0) - Object.values(machineData).reduce((inSum, val) => inSum + (parseFloat(val.in) || 0), 0) >= 0
                ? `Profit: $${Object.values(machineData).reduce((outSum, val) => outSum + (parseFloat(val.out) || 0), 0) - Object.values(machineData).reduce((inSum, val) => inSum + (parseFloat(val.in) || 0), 0)}`
                : `Loss: $${Object.values(machineData).reduce((inSum, val) => inSum + (parseFloat(val.in) || 0), 0) - Object.values(machineData).reduce((outSum, val) => outSum + (parseFloat(val.out) || 0), 0)}`
            }
          </Text>

          <TouchableOpacity style={[styles.button, { backgroundColor: 'green' }]} onPress={handleSaveShift}>
            <Text style={styles.buttonText}>Save Shift</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  subHeader: { fontSize: 18, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 16,
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  addMachineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  machineLabel: { width: 50, fontSize: 16 },
  machineInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    marginLeft: 10,
    padding: 8,
    borderRadius: 6,
  },
  button: {
    backgroundColor: '#1e90ff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 16 },
});