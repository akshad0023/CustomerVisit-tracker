// app/customerinfo.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
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
import ImageView from 'react-native-image-viewing';
import { auth, db } from '../firebaseConfig';

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
    <Ionicons name={iconName} size={20} color="#FFD700" style={styles.searchIcon} /> {/* Gold icon */}
    <TextInput style={styles.searchInput} {...props} placeholderTextColor="#888" /> {/* Lighter placeholder text */}
  </View>
);

export default function CustomerInfoPage() {
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  // FIX: This derived state will now only contain customers with images, making indexing easier
  const customersWithImages = filteredCustomers.filter(c => c.idImageUrl);

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
    const fetchData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error("Owner not logged in");
        const ownerId = user.uid;
        
        const customerQuery = query(
          collection(db, 'owners', ownerId, 'customers'),
          orderBy('name', 'asc')
        );
        const snapshot = await getDocs(customerQuery);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Customer[];
        setCustomers(data);
        setFilteredCustomers(data);
      } catch (error) {
        console.error('Error fetching customer info:', error);
        Alert.alert("Error", "Could not fetch customer information.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isReady]);

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

  // FIX: Simplified image opening logic
  const openImageModal = (customer: Customer) => {
    // Find the index of the clicked customer within the list of customers that HAVE images
    const imageIndex = customersWithImages.findIndex(c => c.id === customer.id);
    if (imageIndex !== -1) {
      setCurrentImageIndex(imageIndex);
      setModalVisible(true);
    }
  };

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFD700" /> {/* Gold loading indicator */}
        <Text style={styles.loadingText}>Loading customers...</Text>
      </View>
    );
  }

  const renderCustomerCard = ({ item }: { item: Customer }) => (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <Ionicons name="person-circle-outline" size={24} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
        <Text style={styles.name}>{item.name}</Text>
      </View>
      <View style={styles.infoRow}>
        <Ionicons name="call-outline" size={22} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
        <Text style={styles.phone}>{item.phone}</Text>
      </View>
      <View style={styles.divider} />
      {item.idImageUrl ? (
        // Pass the entire 'item' object to the handler
        <TouchableOpacity style={styles.viewIdButton} onPress={() => openImageModal(item)}>
          <Ionicons name="card-outline" size={20} color="#000" /> {/* Black icon on gold button */}
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
          <Ionicons name="home-outline" size={28} color="#FFD700" /> {/* Gold home icon */}
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
        // FIX: The images prop now correctly maps over the customersWithImages array
        images={customersWithImages.map(c => ({ uri: c.idImageUrl! }))}
        imageIndex={currentImageIndex}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        FooterComponent={({ imageIndex }) => (
            <View style={styles.footerContainer}>
                {/* Find the name from the same filtered list */}
                <Text style={styles.footerText}>{customersWithImages[imageIndex]?.name}</Text>
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


const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#121212', // Very dark background
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
    color: '#FFD700', // Gold for header
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A', // Darker background for search input
    borderWidth: 1,
    borderColor: '#555555', // Darker border
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
    color: '#FFFFFF', // White text input
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
    color: '#CCCCCC', // Light grey for loading text
    textAlign: 'center',
  },
  card: { 
    padding: 20, 
    backgroundColor: '#1C1C1C', // Dark background for cards
    borderRadius: 12, 
    marginVertical: 8,
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#333333', // Subtle border
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
    color: '#FFD700', // Gold for customer name
  },
  phone: { 
    fontSize: 16, 
    color: '#CCCCCC' // Light grey for phone number
  },
  divider: {
    height: 1,
    backgroundColor: '#444444', // Darker divider
    marginVertical: 8,
  },
  viewIdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700', // Gold button
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  viewIdButtonText: {
    color: '#000', // Black text on gold button
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
    backgroundColor: 'rgba(0,0,0,0.6)', // Slightly darker overlay
  },
  footerText: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  }
});