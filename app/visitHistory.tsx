import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { db } from './firebaseConfig';

interface Visit {
  id: string;
  name: string;
  phone: string;
  idImageUrl: string;
  lastUsed: string;
  matchAmount?: number;
}

const VisitHistoryScreen = () => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

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
          console.log('Visit data:', v);
          return {
            id: doc.id,
            name: v.name || '',
            phone: v.phone || '',
            idImageUrl: v.idImageUrl || '',
            lastUsed: v.lastUsed || '',
            matchAmount: typeof v.matchAmount === 'number' ? v.matchAmount : 0,
          };
        });

        setVisits(data);
      } catch (error) {
        console.error('Error fetching visit history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVisits();
  }, []);

  const renderItem = ({ item }: { item: Visit }) => {
    console.log('Rendering visit:', item); // ✅ Debug log
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.name}</Text>
        <Text>Phone: {item.phone}</Text>
        <Text>Date: {item.lastUsed}</Text>
        <Text>Amount Matched: ${item.matchAmount}</Text>
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#000" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Visit History</Text>
      <FlatList
        data={visits}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  image: {
    width: '100%',
    height: 200,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    resizeMode: 'cover',
    backgroundColor: '#eee',
  },
});

export default VisitHistoryScreen;