import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { useOwner } from '../context/ownerContext';
import { db } from '../firebaseConfig';

type Visit = {
  id: string;
  name: string;
  phone: string;
  date: string;
  idImage?: string;
};

export default function OwnerTab() {
  const { ownerId } = useOwner();
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);

  useEffect(() => {
    const fetchVisitHistory = async () => {
      if (!ownerId) return;
      try {
        const historyRef = collection(db, `owners/${ownerId}/visitHistory`);
        const snapshot = await getDocs(historyRef);
        const data: Visit[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<Visit, 'id'>),
        }));
        setVisitHistory(data);
      } catch (error) {
        console.error('Error fetching visit history:', error);
      }
    };

    fetchVisitHistory();
  }, [ownerId]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Customer Visit History</Text>
      <FlatList
        data={visitHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text>Phone: {item.phone}</Text>
            <Text>Date: {item.date}</Text>
            {item.idImage && (
              <Image source={{ uri: item.idImage }} style={styles.image} />
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    flex: 1,
  },
  heading: {
    fontSize: 22,
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
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  image: {
    marginTop: 8,
    width: 120,
    height: 120,
    borderRadius: 6,
  },
});