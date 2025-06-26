import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { db } from '../firebaseConfig';

interface ShiftData {
  id: string;
  employeeName: string;
  clockIn: string;
  clockOut: string;
  totalIn: number;
  totalOut: number;
  profitOrLoss: number;
  machines?: { number: number; in: number; out: number }[];
}

export default function ShiftHistory() {
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchShifts = async () => {
      setLoading(true);
      const ownerId = await AsyncStorage.getItem('ownerId');
      if (!ownerId) {
        console.warn("Owner ID not found.");
        setLoading(false);
        return;
      }

      const shiftsRef = collection(db, 'owners', ownerId, 'shifts');
      const shiftQuery = query(shiftsRef, orderBy('clockIn', 'desc'));
      const snapshot = await getDocs(shiftQuery);

      const data: ShiftData[] = snapshot.docs.map(doc => {
        const d = doc.data();
        const profitOrLoss = d.totalOut - d.totalIn;
        return {
          id: doc.id,
          employeeName: d.employeeName || 'N/A',
          clockIn: dayjs(d.clockIn).format('YYYY-MM-DD HH:mm'),
          clockOut: d.clockOut ? dayjs(d.clockOut).format('YYYY-MM-DD HH:mm') : 'In Progress',
          totalIn: d.totalIn || 0,
          totalOut: d.totalOut || 0,
          profitOrLoss,
          machines: d.machines || [],
        };
      });

      setShifts(data);
      setLoading(false);
    };

    fetchShifts();
  }, []);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Employee Shift History</Text>
      <FlatList
        data={shifts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>👤 {item.employeeName}</Text>
            <Text>🕒 Clock In: {item.clockIn}</Text>
            <Text>🕒 Clock Out: {item.clockOut}</Text>
            <Text>🎰 In: ${item.totalIn.toFixed(2)}</Text>
            <Text>💸 Out: ${item.totalOut.toFixed(2)}</Text>
            {item.machines && item.machines.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontWeight: 'bold' }}>🎰 Machine Breakdown:</Text>
                {item.machines.map((m, idx) => (
                  <Text key={idx}>Machine #{m.number}: In ${m.in}, Out ${m.out}</Text>
                ))}
              </View>
            )}
            <Text style={item.profitOrLoss >= 0 ? styles.profit : styles.loss}>
              {item.profitOrLoss >= 0 ? 'Profit' : 'Loss'}: ${Math.abs(item.profitOrLoss).toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    marginBottom: 15,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  profit: {
    color: 'green',
    fontWeight: 'bold',
    marginTop: 6,
  },
  loss: {
    color: 'red',
    fontWeight: 'bold',
    marginTop: 6,
  },
});