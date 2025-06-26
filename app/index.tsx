import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity, TouchableWithoutFeedback, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  containerStyle?: object;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, containerStyle, ...props }) => {
  return (
    <View style={[styles.inputContainer, containerStyle]}>
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
  const [isSubmitting, setIsSubmitting] = useState(/* boolean */ false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [idImage, setIdImage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [matchAmount, setMatchAmount] = useState('');
  const [machineNumber, setMachineNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [nameSearchResults, setNameSearchResults] = useState<Customer[]>([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [ownerData, setOwnerData] = useState<{ hasSmsFeature?: boolean } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const ownerRef = doc(db, 'owners', user.uid);
          const docSnap = await getDoc(ownerRef);
          if (docSnap.exists()) { setOwnerData(docSnap.data()); }
        } catch (error) { console.error("Could not fetch owner data:", error); }
        finally { setLoading(false); }
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const clearCustomerInputs = () => {
    setPhone(''); setName(''); setIdImage(null); setMatchAmount(''); setMessage(''); setFoundCustomer(null); setMachineNumber('');
  };
  const resetForm = () => {
    clearCustomerInputs(); setFormMode(null);
  };

  const handleCaptureId = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { Alert.alert('Camera access is required!'); return; }
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!r.canceled) { setIdImage(r.assets[0].uri); Alert.alert('Success', 'Photo Captured!'); }
  };

  const handleLookup = async (lookupField: 'name' | 'phone') => {
    if (isSearching) return;
    const v = lookupField === 'name' ? name.trim() : phone.trim();
    if (!v) return;
    setIsSearching(true);
    setFoundCustomer(null);
    const user = auth.currentUser;
    if (!user) { Alert.alert("Error", "Not logged in."); setIsSearching(false); return; }
    const ref = collection(db, 'owners', user.uid, 'customers');
    try {
      if (lookupField === 'phone') {
        if (!/^\d{10}$/.test(v)) { Alert.alert('Invalid Phone', 'Phone must be 10 digits.'); setIsSearching(false); return; }
        const dRef = doc(ref, v);
        const dSnap = await getDoc(dRef);
        if (dSnap.exists()) {
          const cData = { id: dSnap.id, ...dSnap.data() } as Customer;
          setFoundCustomer(cData); setName(cData.name); setPhone(cData.phone);
        } else {
          Alert.alert("Not Found", "No customer with this phone number."); setName('');
        }
      } else {
        // Name validation for lookup: prevent digits
        if (/\d/.test(v)) {
            Alert.alert("Invalid Name", "Name cannot contain digits.");
            setIsSearching(false);
            return;
        }
        const q = query(ref, where('name', '==', v));
        const qSnap = await getDocs(q);
        const res = qSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[];
        if (res.length === 0) { Alert.alert("Not Found", "No customers with this name."); }
        else if (res.length === 1) { const cData = res[0]; setFoundCustomer(cData); setName(cData.name); setPhone(cData.phone); }
        else { setNameSearchResults(res); setSearchModalVisible(true); }
      }
    } catch (e) {
      Alert.alert("Error", "Customer lookup failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setFoundCustomer(customer); setName(customer.name); setPhone(customer.phone); setSearchModalVisible(false);
  };

  const checkCredits = async () => {
    const isNew = formMode === 'new';
    const cPhone = isNew ? phone.trim() : foundCustomer?.phone;
    const user = auth.currentUser;
    if (!user) { Alert.alert('Auth Error', 'Not logged in.'); return; }
    const ongoingShiftKey = `ongoingShift_${user.uid}`;
    const ongoingShift = await AsyncStorage.getItem(ongoingShiftKey);
    if (!ongoingShift) { Alert.alert('No Active Shift', 'Please start an employee shift first.'); return; }
    if (formMode === null) { Alert.alert('Selection Required', 'Please select a customer type.'); return; }
    if (!cPhone || !/^\d{10}$/.test(cPhone)) { Alert.alert('Invalid Phone Number', 'Phone number must be exactly 10 digits.'); return; }
    if (!isNew) {
      if (!foundCustomer) { Alert.alert("Validation Error", "Please look up and confirm an existing customer."); return; }
      if (!matchAmount) { Alert.alert('Validation Error', 'Match amount is required for existing customers.'); return; }
    }
    if (isNew) {
      if (!name) { Alert.alert('Validation Error', 'Please enter a name for the new customer.'); return; }
      // NEW: Name validation for new customer registration
      if (/\d/.test(name.trim())) {
          Alert.alert("Invalid Name", "Customer name cannot contain digits.");
          setIsSubmitting(false); // Stop submission
          return;
      }
    }

    const matchAmtNumber = Number(matchAmount) || 0;
    if (matchAmtNumber > 0 && !machineNumber.trim()) {
      Alert.alert('Machine Number Required', 'Please enter the machine number for the matched amount.');
      return;
    }

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
      // 12-hour reset logic
      if (exists && data?.timestamp?.toDate) {
        const lastVisit = data.timestamp.toDate();
        const now = new Date();
        const hoursSince = (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 12) {
          setMessage(`❌ Match already used in the last ${Math.floor(hoursSince)} hrs for ${cName}: $${data.matchAmount}`);
          setIsSubmitting(false);
          return;
        }
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

      await setDoc(vRef, { lastUsed: today, name: cName, phone: cPhone, idImageUrl: url, matchAmount: matchAmtNumber, machineNumber: machineNumber.trim(), timestamp: Timestamp.now() });

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

  const handleLogout = () => { Alert.alert( "Confirm Logout", "Are you sure?", [ { text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: async () => { await auth.signOut(); } } ] ); };
  const handleChangeEmail = () => { const user = auth.currentUser; if (!user) return; Alert.prompt( "Change Email", "Enter your new email address.", [ { text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: async (newEmail) => { if (newEmail && newEmail.includes('@')) { try { await updateEmail(user, newEmail.trim()); await sendEmailVerification(user); Alert.alert( "Success!", `Verification link sent to ${newEmail}. You will be logged out.` ); auth.signOut(); } catch (e) { Alert.alert("Error", "Could not change email."); } } else { Alert.alert("Invalid Email", "Please enter a valid new email address."); } } } ], 'plain-text', '', 'email-address' ); };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
      <LinearGradient
        colors={['#f8fafc', '#e2e8f0', '#cbd5e1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fullScreenGradient}
      >
        <SafeAreaView style={styles.container}>
          {/* Adjusted top position for buttons */}
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuVisible(prev => !prev)}
          >
            <Ionicons name="menu" size={32} color="#1e293b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={resetForm}>
            <Ionicons name="refresh-circle-outline" size={32} color="#1e293b" />
          </TouchableOpacity>

          {menuVisible && (
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
              {ownerData?.hasSmsFeature === true && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/bulksms'); }}>
                  <Ionicons name="send-outline" size={22} color="#444" style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Send Bulk Message</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/profitloss'); }}>
                <Ionicons name="wallet-outline" size={22} color="#444" style={styles.menuIcon} />
                <Text style={styles.menuItemText}>Profit & Loss</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={22} color="#dc3545" style={styles.menuIcon} />
                <Text style={[styles.menuItemText, { color: '#dc3545' }]}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}

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
            {/* Enhanced Logo UI */}
            <View style={styles.logoContainer}>
              <Text style={styles.logoTextCM}>CM</Text>
              <Text style={styles.logoTextT}>T</Text>
            </View>

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
                    <TouchableOpacity onPress={() => { setFormMode(null); clearCustomerInputs(); }} style={styles.backButton}>
                      <Ionicons name="arrow-back" size={24} color="#1e293b" />
                    </TouchableOpacity>
                    <Text style={styles.header}>{formMode === 'new' ? 'Register New' : 'Find Existing'}</Text>
                    <View style={{ width: 24 }} />
                  </View>

                  {formMode === 'new' && (
                    <>
                      <IconTextInput iconName="person-outline" placeholder="Customer Name (Required)" value={name} onChangeText={setName} />
                      <IconTextInput iconName="call-outline" placeholder="10-Digit Phone (Required)" keyboardType="number-pad" value={phone} onChangeText={setPhone} maxLength={10} />
                    </>
                  )}

                  {formMode === 'existing' && (
                    <>
                      {foundCustomer ? (
                        <View style={styles.foundCustomerBox}>
                          <Ionicons name="checkmark-circle" size={24} color="#166534" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.foundCustomerName}>{foundCustomer.name}</Text>
                            <Text style={styles.foundCustomerPhone}>{foundCustomer.phone}</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setFoundCustomer(null); setName(''); setPhone(''); }}>
                            <Ionicons name="close-circle" size={24} color="#64748b" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <IconTextInput iconName="person-outline" placeholder="Search by Name" value={name} onChangeText={setName} onBlur={() => handleLookup('name')} />
                          <Text style={styles.orText}>- OR -</Text>
                          <IconTextInput iconName="call-outline" placeholder="Search by 10-Digit Phone" keyboardType="number-pad" value={phone} onChangeText={setPhone} onBlur={() => handleLookup('phone')} maxLength={10} />
                        </>
                      )}
                    </>
                  )}

                  <View style={styles.amountRow}>
                    <IconTextInput iconName="cash-outline" placeholder={formMode === 'new' ? "Match Amt (Optional)" : "Match Amt (Required)"} keyboardType="numeric" value={matchAmount} onChangeText={setMatchAmount} containerStyle={{flex: 2}}/>
                    <IconTextInput iconName="game-controller-outline" placeholder="Machine #" keyboardType="number-pad" value={machineNumber} onChangeText={setMachineNumber} containerStyle={{flex: 1, marginLeft: 10}}/>
                  </View>

                  {formMode === 'new' && (
                    <TouchableOpacity style={[styles.button, styles.captureButton]} onPress={handleCaptureId}>
                      <Ionicons name={idImage ? "camera" : "camera-outline"} size={20} color="#0284c7" />
                      <Text style={styles.captureButtonText}>{idImage ? 'Photo Captured!' : 'Capture Photo (Optional)'}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={checkCredits} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                        <Text style={styles.submitButtonText}>Check & Save Visit</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {message !== '' && <Text style={styles.message}>{message}</Text>}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  fullScreenGradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  logoContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    width: 120,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoTextCM: {
    fontSize: 32,
    fontWeight: '800',
    color: '#3b82f6',
    letterSpacing: 1,
  },
  logoTextT: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 1,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '400',
  },
  choiceCard: {
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginBottom: 12,
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 8,
  },
  choiceDescription: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '400',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  formContainer: { width: '100%' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
    color: '#64748b',
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '400',
  },
  orText: {
    textAlign: 'center',
    color: '#94a3b8',
    marginVertical: -8,
    marginBottom: 8,
    fontWeight: '500',
    fontSize: 13,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 12,
  },
  captureButton: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  captureButtonText: {
    color: '#0284c7',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 6,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  message: {
    marginTop: 20,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 12,
    fontWeight: '500',
    color: '#1e293b',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 10,
  },
  menuButton: {
    position: 'absolute',
    top: 80,
    left: 20,
    zIndex: 99,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  resetButton: {
    position: 'absolute',
    top: 80,
    right: 20,
    zIndex: 99,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 0,
  },
  menuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 8,
    position: 'absolute',
    top: 120,
    left: 20,
    minWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    zIndex: 100,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuIcon: { marginRight: 12 },
  menuItemText: { fontSize: 16, color: '#334155', fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 4 },
  selectionModal: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '400',
  },
  selectionItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  selectionName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  selectionPhone: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#3b82f6',
    fontWeight: '500',
    fontSize: 15,
    padding: 10,
  },
  foundCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 16,
  },
  foundCustomerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
  },
  foundCustomerPhone: {
    fontSize: 14,
    color: '#15803d',
    marginTop: 1,
  },
});