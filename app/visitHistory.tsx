// app/visithistory.tsx
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

// FIX: Added the optional machineNumber field
interface Visit {
  id: string;
  name: string;
  phone: string;
  idImageUrl: string;
  lastUsed: string;
  matchAmount?: number;
  machineNumber?: string;
}

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.searchContainer}>
    <Ionicons name={iconName} size={20} color="#888" style={styles.searchIcon} />
    <TextInput style={styles.searchInput} {...props} placeholderTextColor="#aaa" />
  </View>
);

const VisitHistoryScreen = () => {
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredVisits, setFilteredVisits] = useState<Visit[]>([]);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsReady(true);
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!isReady) return;

    const fetchVisits = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Owner not logged in');
        const ownerId = user.uid;

        const today = dayjs().format('YYYY-MM-DD');
        const q = query(
          collection(db, `owners/${ownerId}/visitHistory`),
          where('lastUsed', '==', today),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const data: Visit[] = snapshot.docs.map(doc => {
          const v = doc.data();
          return {
            id: doc.id,
            name: v.name || 'Unknown',
            phone: v.phone || 'No Phone',
            idImageUrl: v.idImageUrl || '',
            lastUsed: v.lastUsed || '',
            matchAmount: typeof v.matchAmount === 'number' ? v.matchAmount : 0,
            machineNumber: v.machineNumber || '', // FIX: Get the machine number
          };
        });
        setVisits(data);
        setFilteredVisits(data);
      } catch (error) {
        console.error('Error fetching visit history:', error);
        Alert.alert("Error", "Could not fetch visit history.");
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, [isReady]);

  useEffect(() => {
    if (searchQuery === '') {
      setFilteredVisits(visits);
    } else {
      const filteredData = visits.filter(visit =>
        visit.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredVisits(filteredData);
    }
  }, [searchQuery, visits]);

  // FIX: Updated renderItem to display machine number
  const renderItem = ({ item }: { item: Visit }) => (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <Ionicons name="person-circle-outline" size={24} color="#333" style={styles.icon} />
        <Text style={styles.name}>{item.name}</Text>
      </View>
      <View style={styles.infoRow}>
        <Ionicons name="call-outline" size={20} color="#555" style={styles.icon} />
        <Text style={styles.detailText}>{item.phone}</Text>
      </View>

      <View style={styles.divider} />
      
      <View style={styles.infoRow}>
        <Ionicons name="calendar-outline" size={20} color="#555" style={styles.icon} />
        <Text style={styles.detailText}>Visited on: {item.lastUsed}</Text>
      </View>

      {/* Only show the matched amount row if an amount was actually given */}
      {item.matchAmount && item.matchAmount > 0 ? (
        <View style={styles.infoRow}>
          <Ionicons name="cash-outline" size={20} color="#28a745" style={styles.icon} />
          <Text style={[styles.detailText, { color: '#28a745', fontWeight: '600' }]}>
            Amount Matched: ${item.matchAmount?.toFixed(2)}
          </Text>
        </View>
      ) : null}

      {/* Only show the machine number row if one was recorded */}
      {item.machineNumber ? (
        <View style={styles.infoRow}>
            <Ionicons name="game-controller-outline" size={20} color="#555" style={styles.icon} />
            <Text style={styles.detailText}>
              On Machine: #{item.machineNumber}
            </Text>
        </View>
      ) : null}
    </View>
  );

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Today's Visits...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        {/* Using the brand color for the header text */}
        <Text style={styles.header}>CMT<Text style={styles.headerNormal}> | Today's Visits</Text></Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 10, marginBottom: 10 }}>
        <IconTextInput
          iconName="search-outline"
          placeholder="Search by Customer Name..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredVisits}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.loadingText}>
              {searchQuery ? 'No customers match your search for today.' : 'No visits recorded for today.'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 10, backgroundColor: '#f0f2f5', },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, marginTop: 40, },
  // UPDATED: Header style for branding
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#007bff', // Your brand color
  },
  headerNormal: {
    fontWeight: '300',
    color: '#1c1c1e',
  },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, },
  searchIcon: { marginRight: 10, },
  searchInput: { flex: 1, height: 50, fontSize: 16, color: '#333', },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50, },
  loadingText: { marginTop: 10, fontSize: 18, color: 'gray', textAlign: 'center', },
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 12, marginVertical: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, },
  icon: { marginRight: 15, width: 24, textAlign: 'center', },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1c1c1e', },
  detailText: { fontSize: 16, color: '#333', },
  divider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 8, },
});

export default VisitHistoryScreen;