import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// The new, better library for image viewing
import ImageView from 'react-native-image-viewing';
import { db } from '../firebaseConfig';

// Define a type for our customer for better type safety
interface Customer {
  id: string;
  name: string;
  phone: string;
  idImageUrl?: string;
}

export default function CustomerInfo() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);

  // This creates the array of image objects that ImageView expects
  const images = customers
    .filter(customer => customer.idImageUrl) // Only include customers with an image
    .map(customer => ({ uri: customer.idImageUrl! })); // Create the { uri: '...' } object

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const fetchData = async () => {
        setLoading(true);
        try {
          const ownerId = await AsyncStorage.getItem('ownerId');
          if (!ownerId) {
            console.warn('Owner ID not found.');
            setLoading(false);
            return;
          }
          const customerQuery = query(
            collection(db, 'owners', ownerId, 'customers'),
            orderBy('name', 'asc')
          );
          const snapshot = await getDocs(customerQuery);
          if (!isActive) return;

          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Customer[];
          setCustomers(data);
        } catch (error) {
          console.error('Error fetching customer info:', error);
        } finally {
          if (isActive) setLoading(false);
        }
      };

      fetchData();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const openImageModal = (customerImageUrl: string) => {
    // Find the index of the clicked image in our `images` array
    const imageIndex = images.findIndex(img => img.uri === customerImageUrl);
    if (imageIndex !== -1) {
      setCurrentImageIndex(imageIndex);
      setModalVisible(true);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading customers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageView
        images={images}
        imageIndex={currentImageIndex}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        FooterComponent={({ imageIndex }) => (
            <View style={styles.footerContainer}>
                <Text style={styles.footerText}>{customers.find(c => c.idImageUrl === images[imageIndex].uri)?.name}</Text>
            </View>
        )}
      />

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>👤 {item.name}</Text>
            <Text style={styles.phone}>📱 {item.phone}</Text>
            {item.idImageUrl ? (
              <Pressable onPress={() => openImageModal(item.idImageUrl!)}>
                <Text style={styles.viewId}>🪪 View ID</Text>
              </Pressable>
            ) : (
              <Text style={styles.noId}>❌ No ID uploaded</Text>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.loadingText}>No customers found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 18, color: 'gray' },
  card: { padding: 15, backgroundColor: '#fff', borderRadius: 8, marginVertical: 5, marginHorizontal: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41 },
  name: { fontSize: 18, fontWeight: 'bold' },
  phone: { fontSize: 16, marginTop: 4, color: '#333' },
  viewId: { color: '#1e90ff', marginTop: 10, fontWeight: '600', fontSize: 16 },
  noId: { marginTop: 10, color: 'gray', fontStyle: 'italic', fontSize: 16 },
  footerContainer: {
    height: 80,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  }
});