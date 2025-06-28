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
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebaseConfig'; // Assuming firebaseConfig.ts is in the same directory
// LionLogo image import
const LionLogo = require('../assets/images/Logo1.png');
// const CasinoBackground = require('../assets/images/Lion.png');

// Enhanced Casino-themed colors with premium textures
const CasinoColors = {
  background: 'rgb(55, 51, 51)',            // Deeper black for premium feel rgb(55, 51, 51)
  cardBackground: '#1A1A1A',        // Rich dark charcoal
  primaryText: '#FFFFFF',            // Pure white for contrast
  secondaryText: '#B8B8B8',          // Refined light grey
  accentGold: '#D4AF37',            // Classic casino gold
  accentGoldLight: '#F4E481',       // Lighter gold for highlights
  accentRed: '#DC143C',             // Deep crimson red
  accentGreen: '#228B22',           // Forest green for success
  accentBlue: '#1E90FF',            // Dodger blue for accents
  inputBackground: '#2A2A2A',       // Richer input background
  inputBorder: '#666666',           // More prominent borders
  buttonPrimaryBg: '#D4AF37',       // Classic gold
  buttonPrimaryText: '#000000',     // Black text on gold
  buttonSecondaryBg: '#333333',     // Darker secondary buttons
  buttonSecondaryText: '#FFFFFF',
  buttonDangerBg: '#8B0000',        // Dark red for danger
  buttonDangerText: '#FFFFFF',
  shadowColor: '#000000',
  divider: '#444444',               // More visible dividers
  // Using 'as const' to ensure it's treated as a readonly tuple, matching LinearGradient's prop type
  gradientDark: ['#0A0A0A', '#1A1A1A', '#2A2A2A'] as const,
  gradientGold: ['#D4AF37', '#F4E481', '#D4AF37'] as const,
  neonGlow: '#D4AF37',              // Neon cyan for glow effects
};

// IconTextInput Component
interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
  containerStyle?: object;
}

const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, containerStyle, ...props }) => {
  return (
    <LinearGradient
      colors={['#2A2A2A', '#1A1A1A']}
      style={[styles.inputContainer, containerStyle]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Ionicons name={iconName} size={24} color={CasinoColors.accentGold} style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        {...props}
        placeholderTextColor={CasinoColors.secondaryText}
      />
    </LinearGradient>
  );
};

// Stylesheet - MODIFIED FOR SIZING ADJUSTMENTS AND FONT OVERFLOW FIXES
const styles = StyleSheet.create({
  fullScreenGradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CasinoColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100, // Reduced top padding to pull everything up
    paddingBottom: 100 ,
    paddingHorizontal: 20,
  },
  // --- LOGO STYLES (MATCH OwnerScreen) ---
  logoContainer: {
    marginBottom: 24,
  },
  logoImage: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: CasinoColors.accentGold,
    shadowColor: CasinoColors.accentGold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
    marginTop: 10,
    marginBottom: 10,
  },


  // Enhanced Card Styles - ADJUSTED SIZES FOR SMALLER, CLEANER LOOK
  card: {
    width: '100%', // Adjusted width to be more expansive
    maxWidth: 1000, // Removed maxWidth to allow it to expand
    backgroundColor: 'rgba(26,26,26,0.6)',
    borderRadius: 16,
    paddingVertical: 5, // Reduced vertical padding
    paddingHorizontal: 20, // Keep horizontal padding the same, or adjust as needed // Increased padding for more space
    alignSelf: 'center',
    shadowColor: CasinoColors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: CasinoColors.accentGold,
    borderTopWidth: 3,
    borderTopColor: CasinoColors.accentGoldLight,
  },

  // Enhanced Typography
  header: {
    fontSize: 26, // Increased font size for prominence
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
    color: CasinoColors.primaryText,
    letterSpacing: 1,
    textShadowColor: CasinoColors.accentGold,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    fontFamily: 'serif',
  },
  headerExisting: {
    fontSize: 24, // Slightly smaller than new customer header
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
    color: CasinoColors.primaryText,
    letterSpacing: 0.8,
    textShadowColor: CasinoColors.accentGold,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    fontFamily: 'serif',
  },
  subtitle: {
    fontSize: 16, // Slightly increased font size for better readability
    color: CasinoColors.secondaryText,
    textAlign: 'center',
    marginBottom: 30, // Increased margin bottom for more separation
    fontWeight: '600',
    letterSpacing: 0.8,
    lineHeight: 22, // Adjusted line height
  },

  // Enhanced Interactive Elements (Choice Cards) - ADJUSTED FONT SIZES
  choiceCard: {
    backgroundColor: CasinoColors.inputBackground,
    padding: 5, // Increased padding
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: CasinoColors.inputBorder,
    alignItems: 'center',
    marginVertical: 20, // Even vertical spacing between cards
    shadowColor: CasinoColors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 1,
    borderTopWidth: 2,
    borderTopColor: CasinoColors.accentGold,
  },
  choiceTitle: {
    fontSize: 18, // Increased font size
    fontWeight: '800',
    color: CasinoColors.accentGold,
    marginTop: 10, // Increased margin top
    letterSpacing: 0.8,
    textShadowColor: CasinoColors.background,
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1,
    textAlign: 'center',
    lineHeight: 24,
  },
  choiceDescription: {
    fontSize: 14, // Increased font size
    color: CasinoColors.secondaryText,
    marginTop: 6, // Increased margin top
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },

  // Enhanced Form Elements
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20, // Increased margin bottom
    paddingHorizontal: 0, // Removed horizontal padding
  },
  backButton: {
    padding: 10,
    backgroundColor: CasinoColors.inputBackground,
    borderRadius: 10,
  },
  formContainer: {
    width: '100%'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: CasinoColors.inputBorder,
    borderRadius: 12, // Increased border radius
    marginBottom: 18, // Increased margin bottom
    paddingHorizontal: 15, // Increased padding
    height: 48, // Increased height
    shadowColor: CasinoColors.shadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  inputIcon: {
    marginRight: 12,
    color: CasinoColors.accentGold,
  },
  input: {
    flex: 1,
    height: 48, // Match inputContainer height
    fontSize: 15, // Increased font size
    color: CasinoColors.primaryText,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Enhanced Buttons - ADJUSTED SIZES
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14, // Increased padding
    marginTop: 18, // Increased margin top
    shadowColor: CasinoColors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1.5,
  },
  captureButton: {
    backgroundColor: CasinoColors.inputBackground,
    borderColor: CasinoColors.accentBlue,
  },
  captureButtonText: {
    color: CasinoColors.accentBlue,
    fontSize: 15, // Increased font size
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#FFD700',
    paddingVertical: 10,
    paddingHorizontal:10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CasinoColors.accentGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 20, // Extra space from border
  },
  submitButtonText: {
    color: CasinoColors.buttonPrimaryText,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  // Enhanced UI Elements
  orText: {
    textAlign: 'center',
    color: CasinoColors.secondaryText,
    marginVertical: -5, // Adjusted to be closer
    marginBottom: 15,
    fontWeight: '700',
    fontSize: 14, // Increased font size
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  message: {
    marginTop: 25, // Increased margin top
    fontSize: 15, // Increased font size
    textAlign: 'center',
    paddingHorizontal: 15,
    fontWeight: '700',
    color: CasinoColors.accentGreen,
    backgroundColor: CasinoColors.inputBackground,
    borderRadius: 12,
    paddingVertical: 12, // Increased padding vertical
    borderWidth: 1.5,
    borderColor: CasinoColors.accentGreen,
    letterSpacing: 0.4,
    textShadowColor: CasinoColors.background,
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 1.5,
  },

  // Enhanced Navigation Elements - ADJUSTED SIZES
  menuButton: {
    position: 'absolute',
    top: 70,
    left: 15,
    zIndex: 99,
    backgroundColor: 'transparent',
    padding: 6,
  },
 
  // Enhanced Modal Styles - ADJUSTED SIZES
  modalBackgroundCentered: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
  },
menuContainer: {
  position: 'absolute',
  top: 110,
  left: 2,
  width: 230,
  backgroundColor: CasinoColors.cardBackground,
  paddingVertical: 12,
  paddingHorizontal: 12,
  shadowColor: CasinoColors.accentGold,
  shadowOpacity: 0.5,
  shadowRadius: 10,
  elevation: 10,
  borderRightWidth: 2,
  borderColor: CasinoColors.accentGold,
  zIndex: 200,
  borderTopRightRadius: 16,
  borderBottomRightRadius: 16,
  maxHeight: 350,
},
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 1,
  },
  menuIcon: {
    marginRight: 15,
    color: CasinoColors.accentGold,
    fontSize: 18,
  },
  menuItemText: {
  fontSize: 17,                // increased size
  color: '#FFFFFF',            // pure white
  fontWeight: '800',           // bolder
  letterSpacing: 0.4,
},
  menuDivider: {
    height: 1.5,
    backgroundColor: CasinoColors.accentGold,
    marginVertical: 6,
    opacity: 0.3,
  },
  selectionModal: {
    width: '90%',
    maxWidth: 360,
    backgroundColor: CasinoColors.cardBackground,
    borderRadius: 20,
    padding: 25,
    maxHeight: '70%',
    shadowColor: CasinoColors.accentBlue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 12,
    borderWidth: 2,
    borderColor: CasinoColors.accentBlue,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: CasinoColors.primaryText,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  modalSubtitle: {
    fontSize: 15,
    color: CasinoColors.secondaryText,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  selectionItem: {
    backgroundColor: CasinoColors.inputBackground,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: CasinoColors.inputBorder,
    borderLeftWidth: 3,
    borderLeftColor: CasinoColors.accentGold,
  },
  selectionName: {
    fontSize: 16,
    fontWeight: '700',
    color: CasinoColors.primaryText,
    letterSpacing: 0.4,
  },
  selectionPhone: {
    fontSize: 14,
    color: CasinoColors.secondaryText,
    marginTop: 5,
    fontWeight: '500',
  },
  modalCloseText: {
    marginTop: 20,
    fontSize: 16,
    color: CasinoColors.accentRed,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  foundCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CasinoColors.inputBackground,
    borderWidth: 1.5,
    borderColor: CasinoColors.accentGreen,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: CasinoColors.accentGreen,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: CasinoColors.accentGreen,
  },
  foundCustomerName: {
    fontSize: 16,
    fontWeight: '800',
    color: CasinoColors.primaryText,
    letterSpacing: 0.4,
  },
  foundCustomerPhone: {
    fontSize: 14,
    color: CasinoColors.secondaryText,
    fontWeight: '600',
  },
});

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

  // Payout Snapshot State
  const [showPayoutCamera, setShowPayoutCamera] = useState(false);
  const [payoutSnapshotUri, setPayoutSnapshotUri] = useState<string | null>(null);
  const [pendingMatchAmount, setPendingMatchAmount] = useState<number | null>(null);
  const [pendingMachineNumber, setPendingMachineNumber] = useState<string>('');

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

  const handlePayoutSnapshot = async (): Promise<string | null> => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { Alert.alert('Camera access is required for payout snapshot!'); return null; }
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!r.canceled) {
      return r.assets[0].uri;
    }
    return null;
  };

  const checkCredits = async (capturedPayoutUri: string | null = null) => {
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
      if (/\d/.test(name.trim())) {
          Alert.alert("Invalid Name", "Customer name cannot contain digits.");
          setIsSubmitting(false);
          return;
      }
    }

    const matchAmtNumber = Number(matchAmount) || 0;
    if (matchAmtNumber > 0 && !machineNumber.trim()) {
      Alert.alert('Machine Number Required', 'Please enter the machine number for the matched amount.');
      return;
    }

    const currentPayoutUri = capturedPayoutUri || payoutSnapshotUri;
    if (matchAmtNumber > 0) {
      if (!currentPayoutUri) {
        setPendingMatchAmount(matchAmtNumber);
        setPendingMachineNumber(machineNumber.trim());
        setShowPayoutCamera(true);
        return;
      }
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

      let payoutSnapshotUrl = '';
      if (matchAmtNumber > 0 && currentPayoutUri) {
        try {
          const ts = Date.now();
          const payoutPath = `owners/${ownerId}/matchSnapshots/${cPhone}/${ts}.jpg`;
          const blob = await uriToBlob(currentPayoutUri);
          const store = getStorage();
          const payoutRef = ref(store, payoutPath);
          await uploadBytes(payoutRef, blob);
          payoutSnapshotUrl = await getDownloadURL(payoutRef);
          await AsyncStorage.setItem(`pendingPayout_${cPhone}`, 'true');
        } catch (e) {
          Alert.alert('Upload Error', 'Could not upload payout snapshot.');
          setIsSubmitting(false);
          return;
        }
      }

      await setDoc(vRef, {
        lastUsed: today,
        name: cName,
        phone: cPhone,
        idImageUrl: url,
        matchAmount: matchAmtNumber,
        machineNumber: machineNumber.trim(),
        timestamp: Timestamp.now(),
        ...(payoutSnapshotUrl ? { payoutSnapshotUrl } : {})
      });

      if (isNew) {
        const cRef = doc(db, `owners/${ownerId}/customers`, cPhone);
        await setDoc(cRef, { name: cName, phone: cPhone, idImageUrl: url, createdAt: Timestamp.now() });
        setMessage(`✅ New customer registered. Matched: $${matchAmtNumber}`);
      } else {
        setMessage(`✅ Visit updated for ${cName}. Matched: $${matchAmtNumber}`);
      }

      setTimeout(() => {
        clearCustomerInputs();
        setPayoutSnapshotUri(null);
        setShowPayoutCamera(false);
        setPendingMatchAmount(null);
        setPendingMachineNumber('');
      }, 2000);
    } catch (e) {
      console.error("Error during checkCredits:", e);
      Alert.alert('Error', 'An unknown error occurred during processing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayoutCameraFlow = async () => {
    const capturedUri = await handlePayoutSnapshot();
    if (capturedUri) {
      setPayoutSnapshotUri(capturedUri);
      Alert.alert('Snapshot Captured!', 'Payout photo captured successfully.');

      setMatchAmount(String(pendingMatchAmount ?? ''));
      setMachineNumber(pendingMachineNumber);

      setShowPayoutCamera(false);

      setTimeout(() => {
        checkCredits(capturedUri);
      }, 400);
    } else {
      Alert.alert('No Photo Taken', 'Payout snapshot is required to proceed.');
    }
  };

  const handleLogout = () => { Alert.alert( "Confirm Logout", "Are you sure?", [ { text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: async () => { await auth.signOut(); } } ] ); };
  const handleChangeEmail = () => { const user = auth.currentUser; if (!user) return; Alert.prompt( "Change Email", "Enter your new email address.", [ { text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: async (newEmail) => { if (newEmail && newEmail.includes('@')) { try { await updateEmail(user, newEmail.trim()); await sendEmailVerification(user); Alert.alert( "Success!", `Verification link sent to ${newEmail}. You will be logged out.` ); auth.signOut(); } catch (e) { Alert.alert("Error", "Could not change email."); } } else { Alert.alert("Invalid Email", "Please enter a valid new email address."); } } } ], 'plain-text', '', 'email-address' ); };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={CasinoColors.accentGold} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
      <View style={styles.fullScreenGradient}>
        <LinearGradient
          colors={[CasinoColors.background, CasinoColors.cardBackground, CasinoColors.background]}
          locations={[0, 0.5, 1]}
          style={styles.fullScreenGradient}
        >
        <SafeAreaView style={styles.container}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuVisible(prev => !prev)}
          >
            <Ionicons name="reorder-three-outline" size={38} color={CasinoColors.accentGold} />
          </TouchableOpacity>

          {menuVisible && (
            <TouchableOpacity
              activeOpacity={1}
              style={styles.menuOverlay}
              onPress={() => setMenuVisible(false)}
            >
              <View style={styles.menuContainer}>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/visithistory'); }}>
                  <Ionicons name="time-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Visit History</Text>
                </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/customerinfo'); }}>
                <Ionicons name="people-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                <Text style={styles.menuItemText}>Customer Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/employeeshift'); }}>
                <Ionicons name="person-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                <Text style={styles.menuItemText}>Employee Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/machinetracker'); }}>
                <Ionicons name="analytics-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                <Text style={styles.menuItemText}>Machine Tracker</Text>
              </TouchableOpacity>
              {ownerData?.hasSmsFeature === true && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/bulksms'); }}>
                  <Ionicons name="send-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                  <Text style={styles.menuItemText}>Send Bulk Message</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/profitloss'); }}>
                <Ionicons name="wallet-outline" size={22} color={CasinoColors.secondaryText} style={styles.menuIcon} />
                <Text style={styles.menuItemText}>Profit & Loss</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={22} color={CasinoColors.accentRed} style={styles.menuIcon} />
                  <Text style={[styles.menuItemText, { color: CasinoColors.accentRed }]}>Logout</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          <Modal visible={searchModalVisible} transparent animationType="slide">
            <View style={styles.modalBackgroundCentered}>
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

          <Modal visible={showPayoutCamera} transparent animationType="fade">
            <View style={styles.modalBackgroundCentered}>
              <View style={[styles.selectionModal, { alignItems: 'center' }]}>
                <Text style={styles.modalTitle}>Machine Snapshot Required</Text>
                <Text style={styles.modalSubtitle}>Before saving, please take a photo of the machine where match amount is entered.</Text>
                <TouchableOpacity style={[styles.button, styles.captureButton, { marginTop: 18 }]} onPress={handlePayoutCameraFlow}>
                  <Ionicons name="camera-outline" size={22} color={CasinoColors.buttonPrimaryText} />
                  <Text style={styles.captureButtonText}>Take Snapshot</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowPayoutCamera(false); setPayoutSnapshotUri(null); }}>
                  <Text style={styles.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.logoContainer}>
              <Image source={LionLogo} style={styles.logoImage} resizeMode="contain" />
            </View>

            <View style={styles.card}>
              {formMode === null ? (
                <>
                  <Text style={styles.header}>Customer Management</Text>
                  <Text style={styles.subtitle}>Choose an option to manage customers.</Text>
                  <TouchableOpacity style={styles.choiceCard} onPress={() => setFormMode('new')}>
                    <Ionicons name="person-add-outline" size={30} color={CasinoColors.accentGold} />
                    <Text style={styles.choiceTitle}>New Customer Registration</Text>
                    <Text style={styles.choiceDescription}>Enroll a new player and their details.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.choiceCard} onPress={() => setFormMode('existing')}>
                    <Ionicons name="search-outline" size={30} color={CasinoColors.accentGold} />
                    <Text style={styles.choiceTitle}>Existing Customer Visit</Text>
                    <Text style={styles.choiceDescription}>Log a new visit or payout for a returning player.</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.formContainer}>
                  <View style={styles.formHeader}>
                    <TouchableOpacity onPress={() => { setFormMode(null); clearCustomerInputs(); }} style={styles.backButton}>
                      <Ionicons name="arrow-back" size={24} color={CasinoColors.secondaryText} />
                    </TouchableOpacity>
                    <Text style={formMode === 'new' ? styles.header : styles.headerExisting}>{formMode === 'new' ? 'Register Customer' : 'Existing Customer'}</Text>
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
                          <Ionicons name="checkmark-circle" size={24} color={CasinoColors.accentGreen} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.foundCustomerName}>{foundCustomer.name}</Text>
                            <Text style={styles.foundCustomerPhone}>{foundCustomer.phone}</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setFoundCustomer(null); setName(''); setPhone(''); }}>
                            <Ionicons name="close-circle" size={24} color={CasinoColors.accentRed} />
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
                    <IconTextInput
                        iconName="cash-outline"
                        placeholder={formMode === 'new' ? "Match Amt (Opt.)" : "Match Amt (Req.)"}
                        keyboardType="numeric"
                        value={matchAmount}
                        onChangeText={setMatchAmount}
                        containerStyle={{flex: 2}}
                    />
                    <IconTextInput
                        iconName="game-controller-outline"
                        placeholder="Machine #"
                        keyboardType="number-pad"
                        value={machineNumber}
                        onChangeText={setMachineNumber}
                        containerStyle={{flex: 1, marginLeft: 10}}
                    />
                  </View>

                  {formMode === 'new' && (
                    <TouchableOpacity style={[styles.button, styles.captureButton]} onPress={handleCaptureId}>
                      <Ionicons name={idImage ? "camera" : "camera-outline"} size={20} color={CasinoColors.accentBlue} />
                      <Text style={styles.captureButtonText}>{idImage ? 'Photo Captured!' : 'Capture Photo'}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={() => checkCredits()} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color={CasinoColors.buttonPrimaryText} /> : (
                      <>
                        <Ionicons name="save-outline" size={22} color={CasinoColors.buttonPrimaryText} />
                        <Text style={styles.submitButtonText}>Process Visit</Text>
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
      </View>
    </TouchableWithoutFeedback>
  );
}