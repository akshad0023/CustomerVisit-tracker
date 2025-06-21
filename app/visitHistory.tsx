// app/visitHistory.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput, // NEW: Import TextInput
  TextInputProps, // NEW: Import TextInputProps for typing
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../firebaseConfig';

interface Visit {
  id: string;
  name: string;
  phone: string;
  idImageUrl: string;
  lastUsed: string;
  matchAmount?: number;
}

// NEW: A reusable component for our search bar for consistency
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
  // --- NEW: State management for search functionality ---
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<Visit[]>([]); // Master list of all visits
  const [searchQuery, setSearchQuery] = useState(''); // The text in the search bar
  const [filteredVisits, setFilteredVisits] = useState<Visit[]>([]); // The list to be displayed
  const router = useRouter();

  // --- EFFECT 1: Fetch all data from Firestore once ---
  useEffect(() => {
    const fetchVisits = async () => {
      try {
        const ownerId = await AsyncStorage.getItem('ownerId');
        if (!ownerId) throw new Error('Owner not logged in');
        const q = query(
          collection(db, `owners/${ownerId}/visitHistory`),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const data: Visit[] = snapshot.docs.map(doc => {
          const v = doc.data();
          return {
            id: doc.id, name: v.name || 'Unknown', phone: v.phone || 'No Phone', idImageUrl: v.idImageUrl || '', lastUsed: v.lastUsed || '', matchAmount: typeof v.matchAmount === 'number' ? v.matchAmount : 0,
          };
        });
        setVisits(data);
        setFilteredVisits(data); // Initially, the filtered list is the full list
      } catch (error) {
        console.error('Error fetching visit history:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVisits();
  }, []);

  // --- EFFECT 2: Filter the data whenever the search query changes ---
  useEffect(() => {
    if (searchQuery === '') {
      setFilteredVisits(visits); // If search is empty, show all visits
    } else {
      const filteredData = visits.filter(visit =>
        // Case-insensitive search that checks if the name includes the search query
        visit.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredVisits(filteredData);
    }
  }, [searchQuery, visits]); // This effect re-runs if the query or the master list changes

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
      <View style={styles.infoRow}>
        <Ionicons name="cash-outline" size={20} color="#28a745" style={styles.icon} />
        <Text style={[styles.detailText, { color: '#28a745', fontWeight: '600' }]}>
          Amount Matched: ${item.matchAmount?.toFixed(2)}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading History...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Visit History</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      {/* NEW: The Search Bar component */}
      <View style={{ paddingHorizontal: 10, marginBottom: 10 }}>
        <IconTextInput
          iconName="search-outline"
          placeholder="Search by Customer Name..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing" // Adds a small 'x' to clear the search on iOS
        />
      </View>

      <FlatList
        // UPDATED: The list now displays the filtered data
        data={filteredVisits}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.loadingText}>
              {/* Smarter message: shows different text if search yields no results */}
              {searchQuery ? 'No customers match your search.' : 'No visit history found.'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
    backgroundColor: '#f0f2f5',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    marginTop: 40,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  // NEW: Styles for the search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#333',
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
    textAlign: 'center',
  },
  card: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    marginRight: 15,
    width: 24,
    textAlign: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  detailText: {
    fontSize: 16,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 12,
  },
});

export default VisitHistoryScreen;