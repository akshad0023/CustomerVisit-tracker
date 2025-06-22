// app/index.tsx

import { Ionicons } from '@expo/vector-icons';
// FIX: Import AsyncStorage to check for an active shift
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, sendEmailVerification, updateEmail } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
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
import { auth, db } from '../firebaseConfig';


const uriToBlob = (uri: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () { resolve(xhr.response); };
    xhr.onerror = function (e) { reject(new Error('uriToBlob failed')); };
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
  const [formMode, setFormMode] = useState<'new' | 'existing' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [idImage, setIdImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [matchAmount, setMatchAmount] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [nameSearchResults, setNameSearchResults] = useState<Customer[]>([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setLoading(false);
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe();
  }, [router]);

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
    setFormMode(null);
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
      Alert.alert('Success', 'Photo Captured!');
    }
  };

  const handleLookup = async (lookupField: 'name' | 'phone') => {
    if (isSearching) return;
    const lookupValue = lookupField === 'name' ? name.trim() : phone.trim();
    if (!lookupValue) return;
    setIsSearching(true);
    setFoundCustomer(null);
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "Not logged in.");
      setIsSearching(false);
      return;
    }
    const ref = collection(db, 'owners', user.uid, 'customers');
    try {
      if (lookupField === 'phone') {
        if (!/^\d{10}$/.test(lookupValue)) {
          Alert.alert('Invalid Phone', 'Phone number must be 10 digits.');
          setIsSearching(false);
          return;
        }
        const dRef = doc(ref, lookupValue);
        const dSnap = await getDoc(dRef);
        if (dSnap.exists()) {
          const cData = { id: dSnap.id, ...dSnap.data() } as Customer;
          setFoundCustomer(cData);
          setName(cData.name);
          setPhone(cData.phone);
        } else {
          Alert.alert("Not Found", "No customer with this phone number.");
          setName('');
        }
      } else {
        const q = query(ref, where('name', '==', lookupValue));
        const qSnap = await getDocs(q);
        const res = qSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[];
        if (res.length === 0) {
          Alert.alert("Not Found", "No customers with this name.");
        } else if (res.length === 1) {
          const cData = res[0];
          setFoundCustomer(cData);
          setName(cData.name);
          setPhone(cData.phone);
        } else {
          setNameSearchResults(res);
          setSearchModalVisible(true);
        }
      }
    } catch (e) {
      Alert.alert("Error", "Customer lookup failed.");
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
    const isNew = formMode === 'new';
    const cPhone = isNew ? phone.trim() : foundCustomer?.phone;

    const user = auth.currentUser;
    if (!user) { Alert.alert('Auth Error', 'Not logged in.'); return; }
    const ongoingShiftKey = `ongoingShift_${user.uid}`;
    const ongoingShift = await AsyncStorage.getItem(ongoingShiftKey);
    if (!ongoingShift) {
      Alert.alert('No Active Shift', 'Please start an employee shift before registering or checking in a customer.');
      return;
    }

    if (formMode === null) { Alert.alert('Selection Required', 'Please select a customer type.'); return; }
    if (!cPhone || !/^\d{10}$/.test(cPhone)) { Alert.alert('Invalid Phone Number', 'Phone number must be exactly 10 digits.'); return; }

    if (!isNew) {
      if (!foundCustomer) { Alert.alert("Validation Error", "Please look up and confirm an existing customer."); return; }
      if (!matchAmount) { Alert.alert('Validation Error', 'Match amount is required for existing customers.'); return; }
    }

    if (isNew && !name) { Alert.alert('Validation Error', 'Please enter a name for the new customer.'); return; }
    
    setIsSubmitting(true);
    setMessage('Processing...');
    const ownerId = user.uid;
    const today = dayjs().format('YYYY-MM-DD');
    const cName = isNew ? name.trim() : foundCustomer!.name;
    try {
      const vRef = doc(db, `owners/${ownerId}/visitHistory`, cPhone);
      const dSnap = await getDoc(vRef);
      const exists = dSnap.exists();
      const data = exists ? dSnap.data() : null;
      if (exists && data?.lastUsed === today) {
        setMessage(`❌ Match already used today for ${cName}: $${data.matchAmount}`);
        setIsSubmitting(false);
        return;
      }
      
      let url = data?.idImageUrl || '';
      if (isNew && idImage) {
        const fName = `${cPhone}_${Date.now()}.jpg`;
        const fPath = `owners/${ownerId}/customer_ids/${fName}`;
        try {
          const blob = await uriToBlob(idImage);
          const store = getStorage();
          const iRef = ref(store, fPath);
          await uploadBytes(iRef, blob);
          url = await getDownloadURL(iRef);
        } catch (e) { Alert.alert('Upload Error', 'Could not upload ID.'); setIsSubmitting(false); return; }
      }
      
      const matchAmtNumber = Number(matchAmount) || 0;
      await setDoc(vRef, { lastUsed: today, name: cName, phone: cPhone, idImageUrl: url, matchAmount: matchAmtNumber, timestamp: Timestamp.now() });
      
      if (isNew) {
        const cRef = doc(db, `owners/${ownerId}/customers`, cPhone);
        await setDoc(cRef, { name: cName, phone: cPhone, idImageUrl: url, createdAt: Timestamp.now() });
        setMessage(`✅ New customer registered. Matched: $${matchAmtNumber}`);
      } else {
        setMessage(`✅ Visit updated for ${cName}. Matched: $${matchAmtNumber}`);
      }
      
      setTimeout(() => { clearCustomerInputs(); }, 2000);
    } catch (e) {
      Alert.alert('Error', 'An unknown error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleLogout = () => {
    Alert.alert( "Confirm Logout", "Are you sure you want to log out?", [ { text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: async () => { await auth.signOut(); } } ] );
  };

  const handleChangeEmail = () => {
    const user = auth.currentUser;
    if (!user) return;
    Alert.prompt( "Change Email Address", "Enter your new email address. You will be logged out and asked to verify the new address.", [ { text: "Cancel", style: "cancel" }, { text: "Confirm & Change", onPress: async (newEmail) => { if (newEmail && newEmail.includes('@')) { try { await updateEmail(user, newEmail.trim()); await sendEmailVerification(user); Alert.alert( "Success!", `Verification link sent to ${newEmail}. You will be logged out.` ); auth.signOut(); } catch (e) { Alert.alert("Error", "Could not change email."); } } else { Alert.alert("Invalid Email", "Please enter a valid new email address."); } } } ], 'plain-text', '', 'email-address' );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

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
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/visithistory'); }}>
              <Ionicons name="time-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Visit History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/customerinfo'); }}>
              <Ionicons name="people-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Customer Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/employeeshift'); }}>
              <Ionicons name="person-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Employee Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/machinetracker'); }}>
              <Ionicons name="analytics-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Machine Tracker</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/profitloss'); }}>
              <Ionicons name="wallet-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Profit & Loss</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleChangeEmail}>
              <Ionicons name="mail-outline" size={22} color="#444" style={styles.menuIcon} />
              <Text style={styles.menuItemText}>Change Login Email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#dc3545" style={styles.menuIcon} />
              <Text style={[styles.menuItemText, { color: '#dc3545' }]}>Logout</Text>
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
          {formMode === null ? (
            <>
              <Text style={styles.header}>Register Member</Text>
              <Text style={styles.subtitle}>How would you like to proceed?</Text>
              <TouchableOpacity style={styles.choiceCard} onPress={() => setFormMode('new')}>
                <Ionicons name="person-add-outline" size={32} color="#007bff" />
                <Text style={styles.choiceTitle}>New Customer</Text>
                <Text style={styles.choiceDescription}>Register a brand new customer.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.choiceCard} onPress={() => setFormMode('existing')}>
                <Ionicons name="people-outline" size={32} color="#007bff" />
                <Text style={styles.choiceTitle}>Existing Customer</Text>
                <Text style={styles.choiceDescription}>Look up and record a visit.</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.formContainer}>
              <View style={styles.formHeader}>
                <TouchableOpacity onPress={() => setFormMode(null)} style={styles.backButton}>
                  <Ionicons name="arrow-back" size={24} color="#555" />
                </TouchableOpacity>
                <Text style={styles.header}>{formMode === 'new' ? 'Register New' : 'Find Existing'}</Text>
                <View style={{ width: 24 }} />
              </View>

              {formMode === 'new' && (
                <>
                  <IconTextInput iconName="person-outline" placeholder="Customer Name (Required)" value={name} onChangeText={setName} />
                  <IconTextInput iconName="call-outline" placeholder="10-Digit Phone (Required)" keyboardType="number-pad" value={phone} onChangeText={setPhone} maxLength={10} />
                  <IconTextInput iconName="cash-outline" placeholder="Match Amount (Optional)" keyboardType="numeric" value={matchAmount} onChangeText={setMatchAmount} />
                  <TouchableOpacity style={[styles.button, styles.captureButton]} onPress={handleCaptureId}>
                    <Ionicons name={idImage ? "camera" : "camera-outline"} size={20} color="#007bff" />
                    <Text style={styles.captureButtonText}>{idImage ? 'Photo Captured!' : 'Capture Photo (Optional)'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {formMode === 'existing' && (
                <>
                  {foundCustomer ? (
                    <View style={styles.foundCustomerBox}>
                      <Ionicons name="checkmark-circle" size={24} color="#28a745" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.foundCustomerName}>{foundCustomer.name}</Text>
                        <Text style={styles.foundCustomerPhone}>{foundCustomer.phone}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setFoundCustomer(null); setName(''); setPhone(''); }}>
                        <Ionicons name="close-circle" size={24} color="#888" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <IconTextInput iconName="person-outline" placeholder="Search by Name" value={name} onChangeText={setName} onBlur={() => handleLookup('name')} />
                      <Text style={styles.orText}>- OR -</Text>
                      <IconTextInput iconName="call-outline" placeholder="Search by 10-Digit Phone" keyboardType="number-pad" value={phone} onChangeText={setPhone} onBlur={() => handleLookup('phone')} maxLength={10} />
                    </>
                  )}
                  <IconTextInput iconName="cash-outline" placeholder="Match Amount (Required)" keyboardType="numeric" value={matchAmount} onChangeText={setMatchAmount} />
                </>
              )}
              <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={checkCredits} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={22} color="#fff" /><Text style={styles.submitButtonText}>Check & Save Visit</Text></>}
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5' },
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 15 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  header: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#1c1c1e' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24, },
  choiceCard: { backgroundColor: '#f8f9fa', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e9ecef', alignItems: 'center', marginBottom: 15, },
  choiceTitle: { fontSize: 18, fontWeight: '600', color: '#343a40', marginTop: 10, },
  choiceDescription: { fontSize: 14, color: '#6c757d', marginTop: 4, textAlign: 'center', },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20, },
  backButton: { padding: 5, },
  formContainer: { width: '100%' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10, },
  input: { flex: 1, height: 55, fontSize: 16, color: '#333' },
  orText: { textAlign: 'center', color: '#aaa', marginVertical: -8, marginBottom: 8, fontWeight: '600' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 15, marginTop: 10 },
  captureButton: { backgroundColor: '#eaf4ff', borderWidth: 1, borderColor: '#007bff' },
  captureButtonText: { color: '#007bff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  submitButton: { backgroundColor: '#28a745' },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  message: { marginTop: 20, fontSize: 16, textAlign: 'center', paddingHorizontal: 10, fontWeight: '500' },
  menuButton: { position: 'absolute', top: 50, left: 20, zIndex: 20, padding: 5 },
  resetButton: { position: 'absolute', top: 50, right: 20, zIndex: 20, padding: 5 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContainer: { backgroundColor: '#fff', borderRadius: 10, padding: 8, position: 'absolute', top: 90, left: 15, minWidth: 240, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  menuIcon: { marginRight: 15 },
  menuItemText: { fontSize: 17, color: '#333' },
  menuDivider: { height: 1, backgroundColor: '#eee', marginVertical: 6 },
  selectionModal: { width: '100%', maxWidth: 350, backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '70%', },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 5, },
  modalSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 15, },
  selectionItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', },
  selectionName: { fontSize: 16, fontWeight: '600', },
  selectionPhone: { fontSize: 14, color: '#555', },
  modalCloseText: { marginTop: 15, textAlign: 'center', color: '#007bff', fontWeight: '600', fontSize: 16, padding: 10, },
  foundCustomerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eaf7ed', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#28a745', marginBottom: 16, },
  foundCustomerName: { fontSize: 16, fontWeight: 'bold', color: '#155724', },
  foundCustomerPhone: { fontSize: 14, color: '#155724', },
});