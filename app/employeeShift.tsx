// app/employeeShift.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from './firebaseConfig';

export default function EmployeeShift() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState('');
  const [machineData, setMachineData] = useState<{ [key: string]: { in: string; out: string } }>({});
  const [isShiftStarted, setIsShiftStarted] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);

  const machineNumbers = ['M1', 'M2', 'M3', 'M4', 'M5']; // Add more if needed

  const handleStartShift = () => {
    if (!employeeName.trim()) {
      Alert.alert('Please enter employee name');
      return;
    }
    const newShiftId = `${employeeName}_${Date.now()}`;
    setShiftId(newShiftId);
    setStartTime(new Date());
    setIsShiftStarted(true);
    Alert.alert('Shift Started');
  };

  const handleEndShift = async () => {
    try {
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

      await setDoc(doc(db, `owners/${ownerId}/shifts`, shiftId), {
        employeeName,
        startTime: startTime?.toISOString(),
        endTime: endTime.toISOString(),
        machines,
        totalIn,
        totalOut,
        profitOrLoss,
        carryForward,
        timestamp: Timestamp.now(),
      });

      Alert.alert('Shift saved successfully!');
      setIsShiftStarted(false);
      setEmployeeName('');
      setMachineData({});
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleMachineInput = (machine: string, type: 'in' | 'out', value: string) => {
    setMachineData((prev) => ({
      ...prev,
      [machine]: {
        ...prev[machine],
        [type]: value,
      },
    }));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
      ) : (
        <>
          <Text style={styles.subHeader}>Enter Machine Amounts</Text>
          {machineNumbers.map((machine) => (
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

          <TouchableOpacity style={[styles.button, { backgroundColor: 'green' }]} onPress={handleEndShift}>
            <Text style={styles.buttonText}>End Shift & Save</Text>
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