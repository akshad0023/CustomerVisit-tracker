import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { db } from './firebaseConfig';

export default function CustomerInfo() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchData = async () => {
        try {
          const ownerId = await AsyncStorage.getItem('ownerId');
          if (!ownerId) {
            console.warn('Owner ID not found in AsyncStorage.');
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
          }));
          setCustomers(data);
          setLoading(false);
        } catch (error) {
          console.error('Error fetching customer info:', error);
          setLoading(false);
        }
      };

      fetchData();

      return () => {
        isActive = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading customer information...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {modalVisible && selectedImage && (
        <Modal transparent={true} visible={modalVisible} animationType="fade">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="contain" />
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>👤 {item.name}</Text>
            <Text style={styles.phone}>📱 {item.phone}</Text>
            {typeof item.idImageUrl === 'string' && item.idImageUrl.trim() !== '' ? (
              <Pressable onPress={() => { setSelectedImage(item.idImageUrl); setModalVisible(true); }}>
                <Text style={styles.viewId}>🪪 View ID</Text>
              </Pressable>
            ) : (
              <Text style={styles.noId}>❌ No ID uploaded</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 100,
    fontSize: 18,
  },
  card: {
    padding: 15,
    backgroundColor: '#f2f2f2',
    borderRadius: 8,
    marginBottom: 10,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  phone: {
    fontSize: 16,
    marginTop: 4,
  },
  viewId: {
    color: '#1e90ff',
    marginTop: 8,
    fontWeight: '600',
  },
  noId: {
    marginTop: 8,
    color: 'gray',
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  imagePreview: {
    width: 250,
    height: 350,
    marginBottom: 20,
  },
  closeButton: {
    fontSize: 16,
    color: '#1e90ff',
    fontWeight: 'bold',
  },
});
