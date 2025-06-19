import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db, firebaseConfig } from './firebaseConfig';

export default function Login() {
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
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
          // TEMP: Clear stored credentials for testing
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
          router.replace('/owner');
        }
      };

      checkOwnerLogin();

      return () => {
        isActive = false;
      };
    }, [])
  );

  if (loading) return null;

  const handleCaptureId = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Camera access is required!');
      return;
    }

    const result: ImagePicker.ImagePickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setIdImage(base64Image);
      console.log('ID Image base64 captured');
    }
  };

  const checkCredits = async () => {
    if (isNewCustomer === null) {
      Alert.alert('Please select customer type');
      return;
    }

    if (phone.length < 6) {
      Alert.alert('Invalid Phone Number');
      return;
    }

    const today = dayjs().format('YYYY-MM-DD');
    const ownerId = await AsyncStorage.getItem('ownerId');
    if (!ownerId) {
      Alert.alert('Owner not logged in');
      return;
    }

    try {
      const ref = doc(db, `owners/${ownerId}/visitHistory`, phone.trim());
      const docSnap = await getDoc(ref);
      const userExists = docSnap.exists();
      const data = userExists ? docSnap.data() : null;

      if (userExists && data && data.lastUsed === today) { 
        setMessage(`❌ Amount match already used today: $${data.matchAmount}`);
        return;
      }

      let uploadedImageUrl = data?.idImageUrl || '';
      if (!userExists) {
        if (!isNewCustomer) {
          Alert.alert('Error', 'Customer does not exist');
          return;
        }
      }
      if (!userExists || idImage) {
        if (idImage && idImage.startsWith('data:image')) {
          try {
            const filename = `${ownerId}_${phone}_${Date.now()}.jpg`;
            console.log('📂 DEBUG FILE PATH:', { ownerId, phone, filename });
            // Extract base64 data from idImage
            const base64Data = idImage.split(',')[1];
            const fileUri = FileSystem.documentDirectory + filename;

            await FileSystem.writeAsStringAsync(fileUri, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // @ts-ignore
            await FileSystem.uploadAsync(
              `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/idImages%2F${filename}?uploadType=media`,
              fileUri,
              {
                uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: {
                  "Content-Type": "image/jpeg",
                },
              }
            );

            uploadedImageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/idImages%2F${filename}?alt=media`;
            console.log('✅ Image uploaded successfully:', uploadedImageUrl);
          } catch (uploadError: any) {
            console.error('🔥 Upload failed:', uploadError?.message || uploadError);
            Alert.alert('Upload Error', uploadError?.message || 'Could not upload ID image.');
            setMessage('⚠️ Error uploading ID image.');
            return;
          }
        } else {
          console.warn('No valid base64 image to upload.');
        }
      }

      await setDoc(ref, {
        lastUsed: today,
        name: name.trim() || data?.name || '',
        phone: phone.trim(),
        idImageUrl: uploadedImageUrl,
        matchAmount: Number(matchAmount),
        timestamp: new Date().toISOString(),
      });

      if (!userExists) {
        const customerRef = doc(db, `owners/${ownerId}/customers`, phone.trim());
        await setDoc(customerRef, {
          name: name.trim(),
          phone: phone.trim(),
          idImageUrl: uploadedImageUrl,
          createdAt: new Date().toISOString(),
        });
      }

      setMessage(userExists ? `✅ Visit updated. Amount matched: $${matchAmount}` : `✅ New customer registered. Amount matched: $${matchAmount}`);
    } catch (error: any) {
      console.log('Firestore error:', error);
      Alert.alert('Error', error?.message || 'An unknown error occurred');
      setMessage('⚠️ Error checking credits.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', position: 'relative' }}>
      <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
        <Text style={styles.menuIcon}>⋮</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.homeButton} onPress={() => setIsNewCustomer(null)}>
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
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
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
          </>
        )}
        {isNewCustomer !== null && (
          <View style={styles.buttonRow}>
            {isNewCustomer && (
              <TouchableOpacity style={[styles.button, { flex: 1, marginRight: 10 }]} onPress={handleCaptureId}>
                <Text style={styles.buttonText}>Capture ID Photo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: 'green' }]} onPress={checkCredits}>
              <Text style={styles.buttonText}>Check & Save</Text>
            </TouchableOpacity>
          </View>
        )}
        {message !== '' && <Text style={styles.message}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 22,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1e90ff',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  message: {
    marginTop: 20,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 10,
  },
  menuButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 20,
  },
  menuIcon: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  menuItem: {
    paddingVertical: 10,
    fontSize: 16,
  },
  homeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 20,
  },
  homeIcon: {
    fontSize: 26,
    fontWeight: 'bold',
  },
});