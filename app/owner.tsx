import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from './firebaseConfig';

export default function OwnerScreen() {
  const [ownerId, setOwnerId] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const checkOwner = async () => {
        const storedId = await AsyncStorage.getItem('ownerId');
        const storedPass = await AsyncStorage.getItem('ownerPassword');
        setIsRegistered(!!storedId && !!storedPass);
      };
      checkOwner();
    }, [])
  );

  const handleSubmit = async () => {
    if (ownerId.trim() === '' || password.trim() === '') {
      Alert.alert('Error', 'Both fields are required');
      return;
    }

    try {
      const ownerRef = doc(db, 'owners', ownerId);
      const ownerSnap = await getDoc(ownerRef);

      if (!ownerSnap.exists()) {
        // Register new owner
        await setDoc(ownerRef, { password });
        await AsyncStorage.setItem('ownerId', ownerId);
        await AsyncStorage.setItem('ownerPassword', password);
        setIsRegistered(true);
        Alert.alert('Success', 'Owner registered successfully');
        router.replace('/');
      } else {
        const ownerData = ownerSnap.data();
        if (ownerData.password === password) {
          // Valid login
          await AsyncStorage.setItem('ownerId', ownerId);
          await AsyncStorage.setItem('ownerPassword', password);
          setIsRegistered(true);
          Alert.alert('Welcome Back', `Welcome back, ${ownerId}`);
          router.replace('/');
        } else {
          Alert.alert('Error', 'Invalid credentials');
        }
      }
    } catch (error: any) {
      console.error('Owner login error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('ownerId');
    await AsyncStorage.removeItem('ownerPassword');
    setOwnerId('');
    setPassword('');
    setIsRegistered(false);
    Alert.alert('Logged Out', 'You have been logged out.');
    router.replace('/owner');
  };

  const clearStorage = async () => {
    try {
      await AsyncStorage.clear();
      console.log('Storage cleared');
      Alert.alert('Cleared', 'Storage has been cleared.');
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{isRegistered ? 'Owner Login' : 'Owner Registration'}</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter Owner ID"
        value={ownerId}
        onChangeText={setOwnerId}
      />
      <TextInput
        style={styles.input}
        placeholder="Enter Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{isRegistered ? 'Login' : 'Register & Proceed'}</Text>
      </TouchableOpacity>
      {isRegistered && (
        <TouchableOpacity style={[styles.button, { backgroundColor: 'red', marginTop: 10 }]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.button, { backgroundColor: 'orange', marginTop: 10 }]} onPress={clearStorage}>
        <Text style={styles.buttonText}>Clear Storage</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1e90ff',
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
  },
});