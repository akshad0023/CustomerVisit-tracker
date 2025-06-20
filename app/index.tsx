import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// --- FIX: Corrected import path assuming firebaseConfig is in the project root ---
import { db } from '../firebaseConfig';

// --- HELPER FUNCTION TO CONVERT URI TO BLOB ---
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
// --- END HELPER FUNCTION ---

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
  const [isNewCustomer, setIsNewCustomer] = useState<boolean | null>(null);

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

  const resetForm = () => {
    setPhone('');
    setName('');
    setIdImage(null);
    setMatchAmount('');
    setIsNewCustomer(null);
    setMessage('');
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
      console.log('ID Image URI captured:', result.assets[0].uri);
      Alert.alert('Success', 'ID Photo Captured!');
    }
  };

  const checkCredits = async () => {
    if (isNewCustomer === null) {
      Alert.alert('Selection Required', 'Please select if this is a new or existing customer.');
      return;
    }
    if (phone.length < 6) {
      Alert.alert('Validation Error', 'Please enter a valid phone number.');
      return;
    }
    if (!matchAmount) {
      Alert.alert('Validation Error', 'Please enter the match amount.');
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
      Alert.alert('Authentication Error', 'Owner is not logged in. Please restart the app.');
      setIsSubmitting(false);
      return;
    }

    try {
      const visitHistoryRef = doc(db, `owners/${ownerId}/visitHistory`, phone.trim());
      const docSnap = await getDoc(visitHistoryRef);
      const userExists = docSnap.exists();
      const data = userExists ? docSnap.data() : null;

      if (userExists && data?.lastUsed === today) {
        setMessage(`❌ Amount match already used today: $${data.matchAmount}`);
        setIsSubmitting(false);
        return;
      }
      
      let uploadedImageUrl = data?.idImageUrl || '';

      if (idImage) {
        // --- DIAGNOSTIC LOGGING BLOCK ---
        const filename = `${phone.trim()}_${Date.now()}.jpg`;
        const finalPath = `owners/${ownerId}/customer_ids/${filename}`;
        
        console.log("-----------------------------------------");
        console.log("ATTEMPTING UPLOAD WITH THIS INFO:");
        console.log("1. ownerId from AsyncStorage:", ownerId);
        console.log("2. Final path for Firebase Storage:", finalPath);
        console.log("-----------------------------------------");
        // --- END DIAGNOSTIC LOGGING BLOCK ---
        
        try {
          const blob = await uriToBlob(idImage);
          const storage = getStorage();
          const imageRef = ref(storage, finalPath);
          
          await uploadBytes(imageRef, blob);
          uploadedImageUrl = await getDownloadURL(imageRef);
          
          console.log('✅ Image uploaded successfully:', uploadedImageUrl);
        } catch (uploadError: any) {
          console.error('🔥 UPLOAD FAILED! FULL ERROR OBJECT:', uploadError);
          if (uploadError.serverResponse) {
             console.error('Server Response:', uploadError.serverResponse);
          }
          Alert.alert('Upload Error', 'Could not upload the ID image. Check console for details.');
          setMessage('⚠️ Error uploading ID image.');
          setIsSubmitting(false);
          return;
        }
      }

      const visitData = {
        lastUsed: today,
        name: name.trim() || data?.name || '',
        phone: phone.trim(),
        idImageUrl: uploadedImageUrl,
        matchAmount: Number(matchAmount),
        timestamp: new Date().toISOString(),
      };
      
      await setDoc(visitHistoryRef, visitData);

      if (!userExists) {
        const customerRef = doc(db, `owners/${ownerId}/customers`, phone.trim());
        await setDoc(customerRef, {
          name: name.trim(),
          phone: phone.trim(),
          idImageUrl: uploadedImageUrl,
          createdAt: new Date().toISOString(),
        });
        setMessage(`✅ New customer registered. Matched: $${matchAmount}`);
      } else {
        setMessage(`✅ Visit updated. Matched: $${matchAmount}`);
      }
      
      setTimeout(() => {
        resetForm();
      }, 2000);

    } catch (error: any) {
      console.log('Firestore error:', error);
      Alert.alert('Error', error?.message || 'An unknown error occurred.');
      setMessage('⚠️ An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', position: 'relative' }}>
      <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
        <Text style={styles.menuIcon}>⋮</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.homeButton} onPress={resetForm}>
        <Text style={styles.homeIcon}>🏠</Text>
      </TouchableOpacity>
      <Modal visible={menuVisible} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.menuContainer}>
            <TouchableOpacity onPress={() => { setMenuVisible(false); router.push('/visitHistory'); }}>
              <Text style={styles.menuItem}>Visit History</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMenuVisible(false); router.push('/customerInfo'); }}>
              <Text style={styles.menuItem}>Customer Info</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMenuVisible(false); router.push('/employeeShift'); }}>
              <Text style={styles.menuItem}>Employee Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMenuVisible(false); router.push('/machineTracker'); }}>
              <Text style={styles.menuItem}>Machine Tracker</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMenuVisible(false); router.push('/logout'); }}>
              <Text style={styles.menuItem}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>Register Member</Text>
        {isNewCustomer === null && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 20 }}>
            <TouchableOpacity style={[styles.button, { marginRight: 10 }]} onPress={() => setIsNewCustomer(true)}>
              <Text style={styles.buttonText}>New Customer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => setIsNewCustomer(false)}>
              <Text style={styles.buttonText}>Existing Customer</Text>
            </TouchableOpacity>
          </View>
        )}
        {isNewCustomer !== null && (
          <>
            {isNewCustomer && (
              <TextInput
                style={styles.input}
                placeholder="Enter Customer Name"
                value={name}
                onChangeText={setName}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Enter Phone Number"
              keyboardType="phone-pad"
              autoFocus={true}
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter Match Amount"
              keyboardType="numeric"
              value={matchAmount}
              onChangeText={setMatchAmount}
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, { flex: 1, marginRight: 10 }]} onPress={handleCaptureId}>
                <Text style={styles.buttonText}>{idImage ? 'Re-take ID' : 'Capture ID'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: isSubmitting ? '#ccc' : 'green' }]}
                onPress={checkCredits}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Check & Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
        {message !== '' && <Text style={styles.message}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { fontSize: 22, marginBottom: 20, fontWeight: 'bold' },
  input: { width: '100%', borderWidth: 1, borderColor: '#aaa', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 16 },
  button: { backgroundColor: '#1e90ff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  message: { marginTop: 20, fontSize: 16, textAlign: 'center', paddingHorizontal: 10 },
  buttonRow: { flexDirection: 'row', width: '100%', marginBottom: 10 },
  menuButton: { position: 'absolute', top: 40, left: 20, zIndex: 20 },
  menuIcon: { fontSize: 26, fontWeight: 'bold' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 20 },
  menuContainer: { backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  menuItem: { paddingVertical: 10, fontSize: 16 },
  homeButton: { position: 'absolute', top: 40, right: 20, zIndex: 20 },
  homeIcon: { fontSize: 26, fontWeight: 'bold' },
});