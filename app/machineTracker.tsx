// app/machineTracker.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from './firebaseConfig';

export default function MachineTracker() {
  const [shiftData, setShiftData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchShiftData = async () => {
      try {
        const ownerId = await AsyncStorage.getItem('ownerId');
        if (!ownerId) return;

        const q = query(
          collection(db, 'owners', ownerId, 'shifts'),
          orderBy('startTime', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setShiftData(data);
      } catch (error) {
        console.error('Error fetching shift data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShiftData();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading machine tracker data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/')}> 
        <Text style={{ textAlign: 'right', color: 'blue', marginBottom: 10 }}>🏠 Home</Text>
      </TouchableOpacity>
      <Text style={styles.header}>Shift History</Text>
      <FlatList
        data={shiftData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const profitLoss = item.profitOrLoss || 0;
          const resultColor = profitLoss >= 0 ? 'green' : 'red';

          return (
            <View style={styles.card}>
              <Text style={styles.title}>Employee: {item.employeeName}</Text>
              <Text>Start Time: {item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}</Text>
              <Text>End Time: {item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}</Text>
              {item.machines && Object.entries(item.machines).map(([machine, values]: [string, any]) => (
                <View key={machine} style={styles.machineDetails}>
                  <Text>Machine {machine}</Text>
                  <Text>In: ${values.in}</Text>
                  <Text>Out: ${values.out}</Text>
                </View>
              ))}
              <Text>Total In: ${item.totalIn}</Text>
              <Text>Total Out: ${item.totalOut}</Text>
              <Text>Total Matched Amount: ${item.totalMatchedAmount ?? 'N/A'}</Text>
              <Text style={{ color: resultColor }}>
                {profitLoss >= 0 ? `Profit: $${profitLoss}` : `Loss: $${Math.abs(profitLoss)}`}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  machineDetails: {
    marginTop: 6,
    marginLeft: 10,
  },
});