// app/index.tsx

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../firebaseConfig';


const uriToBlob = (uri: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function (e) {
      console.log(e);
      reject(new Error('uriToBlob failed'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
};

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => {
  return (
    <View style={styles.inputContainer}>
      <Ionicons name={iconName} size={22} color="#888" style={styles.inputIcon} />
      <TextInput style={styles.input} {...props} placeholderTextColor="#aaa" />
    </View>
  );
};

interface Customer {
  id: string;
  name: string;
  phone: string;
  idImageUrl?: string;
}


export default function Login() {
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [idImage, setIdImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [matchAmount, setMatchAmount] = useState('');
  const [customerTypeIndex, setCustomerTypeIndex] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [nameSearchResults, setNameSearchResults] = useState<Customer[]>([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      const checkOwnerLogin = async () => {
        try {
          const ownerId = await AsyncStorage.getItem('ownerId');
          const ownerPass = await AsyncStorage.getItem('ownerPassword');
          if (isActive) {
            if (!ownerId || !ownerPass) {
              router.replace('/owner');
            } else {
              setLoading(false);
            }
          }
        } catch (error) {
          console.error('Error checking owner credentials:', error);
          if (isActive) router.replace('/owner');
        }
      };
      checkOwnerLogin();
      return () => {
        isActive = false;
      };
    }, [router])
  );

  const clearCustomerInputs = () => {
    setPhone('');
    setName('');
    setIdImage(null);
    setMatchAmount('');
    setMessage('');
    setFoundCustomer(null);
  };

  const resetForm = () => {
    clearCustomerInputs();
    setCustomerTypeIndex(null);
  };

  const handleCaptureId = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Camera access is required!');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setIdImage(result.assets[0].uri);
      Alert.alert('Success', 'ID Photo Captured!');
    }
  };

  const handleLookup = async (lookupField: 'name' | 'phone') => {
    if (isSearching) return;
    const lookupValue = lookupField === 'name' ? name.trim() : phone.trim();
    if (!lookupValue) return;

    setIsSearching(true);
    setFoundCustomer(null);
    
    const ownerId = await AsyncStorage.getItem('ownerId');
    if (!ownerId) {
      Alert.alert("Error", "Owner ID not found.");
      setIsSearching(false);
      return;
    }
    
    const customersRef = collection(db, 'owners', ownerId, 'customers');

    try {
      if (lookupField === 'phone') {
        const docRef = doc(customersRef, lookupValue);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
          setFoundCustomer(customerData);
          setName(customerData.name);
          setPhone(customerData.phone);
        } else {
          Alert.alert("Not Found", "No customer found with this phone number.");
          setName('');
        }
      } else {
        const q = query(customersRef, where('name', '==', lookupValue));
        const querySnapshot = await getDocs(q);
        const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Customer[];

        if (results.length === 0) {
          Alert.alert("Not Found", "No customers found with this name.");
        } else if (results.length === 1) {
          const customerData = results[0];
          setFoundCustomer(customerData);
          setName(customerData.name);
          setPhone(customerData.phone);
        } else {
          setNameSearchResults(results);
          setSearchModalVisible(true);
        }
      }
    } catch (error) {
      console.error("Lookup error:", error);
      Alert.alert("Error", "Failed to perform customer lookup.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setFoundCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setSearchModalVisible(false);
  };

  const checkCredits = async () => {
    const isNewCustomer = customerTypeIndex === 0;
    const customerPhone = isNewCustomer ? phone.trim() : foundCustomer?.phone;
    
    if (customerTypeIndex === null) {
      Alert.alert('Selection Required', 'Please select a customer type.');
      return;
    }
    if (!customerPhone || !/^\d{10}$/.test(customerPhone)) {
      Alert.alert('Invalid Phone Number', 'Phone number must be exactly 10 digits.');
      return;
    }
    if (!matchAmount) {
      Alert.alert('Validation Error', 'Please enter the match amount.');
      return;
    }
    if (!isNewCustomer && !foundCustomer) {
      Alert.alert("Validation Error", "Please look up and confirm an existing customer.");
      return;
    }
    if (isNewCustomer && !name) {
      Alert.alert('Validation Error', 'Please enter a name for the new customer.');
      return;
    }
    if (isNewCustomer && !idImage) {
      Alert.alert('ID Required', 'Please capture an ID photo for new customers.');
      return;
    }
    
    setIsSubmitting(true);
    setMessage('Processing...');
    const today = dayjs().format('YYYY-MM-DD');
    const ownerId = await AsyncStorage.getItem('ownerId');
    if (!ownerId) {
      Alert.alert('Authentication Error', 'Owner is not logged in.');
      setIsSubmitting(false);
      return;
    }
    
    const customerName = isNewCustomer ? name.trim() : foundCustomer!.name;

    try {
      const visitHistoryRef = doc(db, `owners/${ownerId}/visitHistory`, customerPhone);
      const docSnap = await getDoc(visitHistoryRef);
      const userExists = docSnap.exists();
      const data = userExists ? docSnap.data() : null;
      if (userExists && data?.lastUsed === today) {
        setMessage(`❌ Amount match already used today for ${customerName}: $${data.matchAmount}`);
        setIsSubmitting(false);
        return;
      }
      
      let uploadedImageUrl = data?.idImageUrl || '';
      if (isNewCustomer && idImage) {
        const filename = `${customerPhone}_${Date.now()}.jpg`;
        const finalPath = `owners/${ownerId}/customer_ids/${filename}`;
        try {
          const blob = await uriToBlob(idImage);
          const storage = getStorage();
          const imageRef = ref(storage, finalPath);
          await uploadBytes(imageRef, blob);
          uploadedImageUrl = await getDownloadURL(imageRef);
        } catch (uploadError: any) {
          Alert.alert('Upload Error', 'Could not upload the ID image.');
          setIsSubmitting(false);
          return;
        }
      }

      await setDoc(visitHistoryRef, {
        lastUsed: today, name: customerName, phone: customerPhone, idImageUrl: uploadedImageUrl, matchAmount: Number(matchAmount), timestamp: Timestamp.now(),
      });

      if (isNewCustomer) {
        const customerRef = doc(db, `owners/${ownerId}/customers`, customerPhone);
        await setDoc(customerRef, {
          name: customerName, phone: customerPhone, idImageUrl: uploadedImageUrl, createdAt: Timestamp.now(),
        });
        setMessage(`✅ New customer registered. Matched: $${matchAmount}`);
      } else {
        setMessage(`✅ Visit updated for ${customerName}. Matched: $${matchAmount}`);
      }
      
      setTimeout(() => { 
        clearCustomerInputs(); 
      }, 2000);
    } catch (error: any) {
      console.log('Firestore error:', error);
      Alert.alert('Error', 'An unknown error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
        <Ionicons name="menu" size={32} color="#333" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.resetButton} onPress={resetForm}>
        <Ionicons name="refresh-circle-outline" size={32} color="#555" />
      </TouchableOpacity>
      <Modal visible={menuVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackground} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/visitHistory'); }}>
              <Ionicons name="time-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Visit History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/customerInfo'); }}>
              <Ionicons name="people-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Customer Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/employeeShift'); }}>
              <Ionicons name="person-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Employee Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/machineTracker'); }}>
              <Ionicons name="analytics-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Machine Tracker</Text>
            </TouchableOpacity>
            
            {/* NEW: I have added this button to navigate to the Profit & Loss page. */}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/profitloss'); }}>
              <Ionicons name="wallet-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Profit & Loss</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/logout'); }}>
              <Ionicons name="log-out-outline" size={22} color="#dc3545" style={styles.menuIcon} />
              <Text style={[styles.menuItemText, {color: '#dc3545'}]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={searchModalVisible} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.selectionModal}>
            <Text style={styles.modalTitle}>Multiple Customers Found</Text>
            <Text style={styles.modalSubtitle}>Please select the correct customer.</Text>
            <FlatList
              data={nameSearchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.selectionItem} onPress={() => handleSelectCustomer(item)}>
                  <Text style={styles.selectionName}>{item.name}</Text>
                  <Text style={styles.selectionPhone}>{item.phone}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.header}>Register Member</Text>
          
          <SegmentedControl
            values={['New Customer', 'Existing Customer']}
            selectedIndex={customerTypeIndex ?? undefined}
            onChange={(event) => {
              setCustomerTypeIndex(event.nativeEvent.selectedSegmentIndex);
              clearCustomerInputs();
            }}
            style={styles.segmentedControl}
            fontStyle={{ color: '#333', fontWeight: '600' }}
            activeFontStyle={{ color: '#fff' }}
            tintColor="#007bff"
          />

          {customerTypeIndex !== null && (
            <View style={styles.formContainer}>
              {customerTypeIndex === 0 && (
                <>
                  <IconTextInput iconName="person-outline" placeholder="Customer Name" value={name} onChangeText={setName} />
                  <IconTextInput 
                    iconName="call-outline" 
                    placeholder="10-Digit Phone Number" 
                    keyboardType="number-pad" 
                    value={phone} 
                    onChangeText={setPhone}
                    maxLength={10} 
                  />
                  <IconTextInput iconName="cash-outline" placeholder="Match Amount" keyboardType="numeric" value={matchAmount} onChangeText={setMatchAmount} />
                  <TouchableOpacity style={[styles.button, styles.captureButton]} onPress={handleCaptureId}>
                    <Ionicons name={idImage ? "camera" : "camera-outline"} size={20} color="#007bff" />
                    <Text style={styles.captureButtonText}>{idImage ? 'ID Captured!' : 'Capture ID Photo'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {customerTypeIndex === 1 && (
                <>
                  {foundCustomer ? (
                    <View style={styles.foundCustomerBox}>
                      <Ionicons name="checkmark-circle" size={24} color="#28a745" />
                      <View style={{flex: 1, marginLeft: 10}}>
                        <Text style={styles.foundCustomerName}>{foundCustomer.name}</Text>
                        <Text style={styles.foundCustomerPhone}>{foundCustomer.phone}</Text>
                      </View>
                      <TouchableOpacity onPress={() => {
                        setFoundCustomer(null);
                        setName('');
                        setPhone('');
                      }}>
                         <Ionicons name="close-circle" size={24} color="#888" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <IconTextInput
                        iconName="person-outline"
                        placeholder="Search by Name"
                        value={name}
                        onChangeText={setName}
                        onBlur={() => handleLookup('name')}
                      />
                      <IconTextInput
                        iconName="call-outline"
                        placeholder="Search by 10-Digit Phone"
                        keyboardType="number-pad"
                        value={phone}
                        onChangeText={setPhone}
                        onBlur={() => handleLookup('phone')}
                        maxLength={10}
                      />
                    </>
                  )}
                  <IconTextInput iconName="cash-outline" placeholder="Match Amount" keyboardType="numeric" value={matchAmount} onChangeText={setMatchAmount} />
                </>
              )}

              <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={checkCredits} disabled={isSubmitting}>
                {isSubmitting
                  ? <ActivityIndicator color="#fff" /> 
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                      <Text style={styles.submitButtonText}>Check & Save</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}

          {message !== '' && <Text style={styles.message}>{message}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 15 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  header: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#1c1c1e' },
  segmentedControl: { marginBottom: 24 },
  formContainer: { width: '100%' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 55, fontSize: 16, color: '#333' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 15, marginTop: 10 },
  captureButton: { backgroundColor: '#eaf4ff', borderWidth: 1, borderColor: '#007bff' },
  captureButtonText: { color: '#007bff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  submitButton: { backgroundColor: '#28a745' },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  message: { marginTop: 20, fontSize: 16, textAlign: 'center', paddingHorizontal: 10, fontWeight: '500' },
  menuButton: { position: 'absolute', top: 50, left: 20, zIndex: 20, padding: 5 },
  resetButton: { position: 'absolute', top: 50, right: 20, zIndex: 20, padding: 5 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContainer: { backgroundColor: '#fff', borderRadius: 10, padding: 8, position: 'absolute', top: 90, left: 15, minWidth: 220, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  menuIcon: { marginRight: 15 },
  menuItemText: { fontSize: 17, color: '#333' },
  menuDivider: { height: 1, backgroundColor: '#eee', marginVertical: 6 },
  selectionModal: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  selectionItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectionPhone: {
    fontSize: 14,
    color: '#555',
  },
  modalCloseText: {
    marginTop: 15,
    textAlign: 'center',
    color: '#007bff',
    fontWeight: '600',
    fontSize: 16,
    padding: 10,
  },
  foundCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf7ed',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#28a745',
    marginBottom: 16,
  },
  foundCustomerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#155724',
  },
  foundCustomerPhone: {
    fontSize: 14,
    color: '#155724',
  },
});