import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
// FIX: Added useEffect to the React import
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import { db } from '../firebaseConfig';


interface Customer {
  id: string;
  name: string;
  phone: string;
  idImageUrl?: string;
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

export default function CustomerInfo() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  const images = customers
    .filter(customer => customer.idImageUrl)
    .map(customer => ({ uri: customer.idImageUrl! }));

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
          setFilteredCustomers(data);
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

  useEffect(() => {
    if (searchQuery === '') {
      setFilteredCustomers(customers);
    } else {
      const filteredData = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCustomers(filteredData);
    }
  }, [searchQuery, customers]);


  const openImageModal = (customerImageUrl: string) => {
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

  const renderCustomerCard = ({ item }: { item: Customer }) => (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <Ionicons name="person-circle-outline" size={24} color="#333" style={styles.icon} />
        <Text style={styles.name}>{item.name}</Text>
      </View>
      <View style={styles.infoRow}>
        <Ionicons name="call-outline" size={22} color="#555" style={styles.icon} />
        <Text style={styles.phone}>{item.phone}</Text>
      </View>
      <View style={styles.divider} />
      {item.idImageUrl ? (
        <TouchableOpacity style={styles.viewIdButton} onPress={() => openImageModal(item.idImageUrl!)}>
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={styles.viewIdButtonText}>View ID</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.infoRow}>
          <Ionicons name="close-circle-outline" size={22} color="#888" style={styles.icon} />
          <Text style={styles.noId}>No ID on file</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Customer List</Text>
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

      <ImageView
        images={images}
        imageIndex={currentImageIndex}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        FooterComponent={({ imageIndex }) => (
            <View style={styles.footerContainer}>
                <Text style={styles.footerText}>{customers.find(c => c.idImageUrl === images[imageIndex]?.uri)?.name}</Text>
            </View>
        )}
      />

      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomerCard}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
            <View style={styles.centered}>
                <Text style={styles.loadingText}>
                    {searchQuery ? 'No customers match your search.' : 'No customers found.'}
                </Text>
            </View>
        }
      />
    </View>
  );
}

// ... styles remain the same
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
    paddingBottom: 15,
    marginTop: 40,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
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
    marginBottom: 12,
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
  phone: { 
    fontSize: 16, 
    color: '#333' 
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: 8,
  },
  viewIdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  viewIdButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  noId: { 
    color: '#888', 
    fontStyle: 'italic',
    fontSize: 16,
  },
  footerContainer: {
    height: 80,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  footerText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  }
});