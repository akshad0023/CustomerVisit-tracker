// app/machineTracker.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
// FIX: Import React to use React.FC for typing functional components
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

// FIX 1: Define the shape of your Shift data
interface Shift {
  id: string;
  employeeName: string;
  startTime?: string;
  endTime?: string;
  machines: {
    [machineNumber: string]: {
      in: number;
      out: number;
    };
  };
  totalIn: number;
  totalOut: number;
  totalMatchedAmount: number;
  profitOrLoss: number;
}

// FIX 2: Define the props for the SummaryRow component
interface SummaryRowProps {
  label: string;
  value: string;
  valueColor?: string;
  isBold?: boolean;
}

// Use React.FC (Functional Component) to type the component and its props
const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, valueColor = '#333', isBold = false }) => (
  <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, isBold && { fontWeight: 'bold' }]}>{label}</Text>
    <Text style={[styles.summaryValue, { color: valueColor }, isBold && { fontWeight: 'bold' }]}>{value}</Text>
  </View>
);

export default function MachineTracker() {
  // FIX 3: Type the state to be an array of Shift objects
  const [shiftData, setShiftData] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchShiftData = async () => {
      try {
        const ownerId = await AsyncStorage.getItem('ownerId');
        if (!ownerId) {
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, 'owners', ownerId, 'shifts'),
          orderBy('startTime', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Shift[];
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Loading shift history...</Text>
      </View>
    );
  }

  // FIX 4: Type the 'item' passed by the FlatList renderItem prop
  const renderShiftCard = ({ item }: { item: Shift }) => {
    const profitLoss = item.profitOrLoss || 0;
    const resultColor = profitLoss >= 0 ? '#28a745' : '#dc3545';
    const profitLabel = profitLoss >= 0 ? 'Profit' : 'Loss';

    return (
      <View style={styles.card}>
        {/* --- Top Section --- */}
        <View style={styles.cardHeader}>
          <Text style={styles.employeeName}>Employee: {item.employeeName}</Text>
          <View>
            <Text style={styles.timeText}>
              Start: {item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}
            </Text>
            <Text style={styles.timeText}>
              End: {item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* --- Machine Details Table --- */}
        {item.machines && Object.keys(item.machines).length > 0 && (
          <View style={styles.machineSection}>
            <View style={styles.machineTableHeader}>
              <Text style={[styles.machineTableCell, styles.tableHeaderText]}>Machine</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>In</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Out</Text>
            </View>
            {/* FIX 5: Explicitly type the destructured values from Object.entries */}
            {Object.entries(item.machines).map(([machine, values]: [string, { in: number; out: number }]) => (
              <View key={machine} style={styles.machineTableRow}>
                <Text style={styles.machineTableCell}>{machine}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${values.in}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${values.out}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        {/* --- Summary Section --- */}
        <View style={styles.summaryContainer}>
          <SummaryRow label="Total In:" value={`$${item.totalIn || 0}`} />
          <SummaryRow label="Total Out:" value={`$${item.totalOut || 0}`} />
          <SummaryRow label="Matched Amount:" value={`$${item.totalMatchedAmount || 0}`} />
          <SummaryRow 
            label={`${profitLabel}:`} 
            value={`$${Math.abs(profitLoss)}`}
            valueColor={resultColor}
            isBold={true}
          />
        </View>
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/')}>
        <Text style={styles.homeButton}>🏠 Home</Text>
      </TouchableOpacity>
      <Text style={styles.header}>Shift History</Text>
      <FlatList
        data={shiftData}
        keyExtractor={(item) => item.id}
        renderItem={renderShiftCard}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={styles.centered}>No shift data found.</Text>}
      />
    </View>
  );
}

// Styles remain the same
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeButton: {
    textAlign: 'right',
    color: '#007bff',
    marginBottom: 10,
    fontSize: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    marginBottom: 12,
  },
  employeeName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111',
  },
  timeText: {
    fontSize: 14,
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 12,
  },
  machineSection: {
    marginVertical: 5,
  },
  machineTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  machineTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  machineTableCell: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  summaryContainer: {
    marginTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#495057',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
  },
});