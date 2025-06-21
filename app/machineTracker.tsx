// app/machineTracker.tsx

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

interface Shift {
  id: string;
  employeeName: string;
  startTime?: string;
  endTime?: string;
  machines: { [machineNumber: string]: { in: number; out: number; }; };
  totalIn: number;
  totalOut: number;
  totalMatchedAmount: number;
  profitOrLoss: number;
}

interface SummaryRowProps {
  label: string;
  value: string;
  valueColor?: string;
  isBold?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap; // Added icon prop
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, valueColor = '#333', isBold = false, iconName }) => (
  <View style={styles.summaryRow}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {iconName && <Ionicons name={iconName} size={20} color={valueColor} style={{ marginRight: 10, width: 22 }} />}
      <Text style={[styles.summaryLabel, isBold && { fontWeight: 'bold' }]}>{label}</Text>
    </View>
    <Text style={[styles.summaryValue, { color: valueColor }, isBold && { fontWeight: 'bold' }]}>{value}</Text>
  </View>
);

export default function MachineTracker() {
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
        const q = query(collection(db, 'owners', ownerId, 'shifts'), orderBy('startTime', 'desc'));
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
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Shift History...</Text>
      </View>
    );
  }

  const renderShiftCard = ({ item }: { item: Shift }) => {
    const profitLoss = item.profitOrLoss || 0;
    const resultColor = profitLoss >= 0 ? '#28a745' : '#dc3545';
    const profitLabel = profitLoss >= 0 ? 'Profit' : 'Loss';
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.employeeName}>{item.employeeName}</Text>
          <View>
            <Text style={styles.timeText}>Start: {item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}</Text>
            <Text style={styles.timeText}>End: {item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        {item.machines && Object.keys(item.machines).length > 0 && (
          <View style={styles.machineSection}>
            <View style={styles.machineTableHeader}>
              <Text style={[styles.machineTableCell, styles.tableHeaderText]}>Machine</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>In ($)</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Out ($)</Text>
            </View>
            {Object.keys(item.machines).sort((a,b) => parseInt(a) - parseInt(b)).map((machine) => (
              <View key={machine} style={styles.machineTableRow}>
                <Text style={styles.machineTableCell}>{machine}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${item.machines[machine].in.toFixed(2)}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${item.machines[machine].out.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.summaryContainer}>
          <SummaryRow label="Total In:" value={`$${(item.totalIn || 0).toFixed(2)}`} iconName="arrow-down-circle-outline" valueColor="#dc3545" />
          <SummaryRow label="Total Out:" value={`$${(item.totalOut || 0).toFixed(2)}`} iconName="arrow-up-circle-outline" valueColor="#28a745" />
          {/* UPDATED: This now has an icon and uses toFixed for consistency */}
          <SummaryRow label="Matched Amount:" value={`$${(item.totalMatchedAmount || 0).toFixed(2)}`} iconName="gift-outline" valueColor="#6f42c1" />
          <View style={styles.divider} />
          <SummaryRow label={`${profitLabel}:`} value={`$${Math.abs(profitLoss).toFixed(2)}`} valueColor={resultColor} isBold={true} iconName={profitLoss >= 0 ? "trending-up-outline" : "trending-down-outline"} />
        </View>
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Shift History</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={shiftData}
        keyExtractor={(item) => item.id}
        renderItem={renderShiftCard}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.loadingText}>No shift history found.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
    paddingTop: 10,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    marginTop: 40,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    color: 'gray',
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
    alignItems: 'center',
    paddingVertical: 6,
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