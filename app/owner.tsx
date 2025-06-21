// app/owner.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  // I need these to handle the keyboard properly.
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { db } from '../firebaseConfig';

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.inputContainer}>
    <Ionicons name={iconName} size={22} color="#888" style={styles.inputIcon} />
    <TextInput style={styles.input} {...props} placeholderTextColor="#aaa" />
  </View>
);

export default function OwnerScreen() {
  const [ownerId, setOwnerId] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const checkOwner = async () => {
        const storedId = await AsyncStorage.getItem('ownerId');
        setIsRegistered(!!storedId);
      };
      checkOwner();
    }, [])
  );

  const handleSubmit = async () => {
    if (ownerId.trim() === '' || password.trim() === '') {
      Alert.alert('Validation Error', 'Both Owner ID and Password are required.');
      return;
    }
    // I should also dismiss the keyboard when the user presses submit.
    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const ownerRef = doc(db, 'owners', ownerId.trim());
      const ownerSnap = await getDoc(ownerRef);

      if (!ownerSnap.exists()) {
        await setDoc(ownerRef, { password });
        await AsyncStorage.setItem('ownerId', ownerId.trim());
        await AsyncStorage.setItem('ownerPassword', password);
        setIsRegistered(true);
        Alert.alert('Registration Successful', `Welcome, ${ownerId.trim()}! You are now logged in.`);
        router.replace('/');
      } else {
        const ownerData = ownerSnap.data();
        if (ownerData.password === password) {
          await AsyncStorage.setItem('ownerId', ownerId.trim());
          await AsyncStorage.setItem('ownerPassword', password);
          setIsRegistered(true);
          Alert.alert('Welcome Back', `Successfully logged in as ${ownerId.trim()}.`);
          router.replace('/');
        } else {
          Alert.alert('Login Failed', 'The password you entered is incorrect. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Owner login/registration error:', error);
      Alert.alert('System Error', 'An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out? This will require you to log in again.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Log Out", 
          style: "destructive", 
          onPress: async () => {
            await AsyncStorage.removeItem('ownerId');
            await AsyncStorage.removeItem('ownerPassword');
            setOwnerId('');
            setPassword('');
            setIsRegistered(false);
          } 
        }
      ]
    );
  };

  return (
    // This wrapper will handle dismissing the keyboard when I tap anywhere.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#007bff" style={{ alignSelf: 'center', marginBottom: 15 }} />
          <Text style={styles.header}>Admin Login</Text>
          <Text style={styles.subtitle}>
            {isRegistered ? 'Enter your credentials to continue.' : 'Register a new admin account.'}
          </Text>

          <IconTextInput
            iconName="person-outline"
            placeholder="Owner ID"
            value={ownerId}
            onChangeText={setOwnerId}
            autoCapitalize="none"
          />
          <IconTextInput
            iconName="lock-closed-outline"
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            // I'll add this so the keyboard "done" button can also submit the form.
            onSubmitEditing={handleSubmit}
          />
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={22} color="#fff" />
                <Text style={styles.buttonText}>{isRegistered ? 'Login' : 'Register & Login'}</Text>
              </>
            )}
          </TouchableOpacity>
          {isRegistered && (
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>Log out from this device</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    // I need to use flexGrow here so the ScrollView works correctly.
    flexGrow: 1, 
    backgroundColor: '#f0f2f5',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1c1c1e',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: '#333',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#007bff',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  logoutButton: {
    marginTop: 20,
    padding: 10,
  },
  logoutButtonText: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 14,
  },
});