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
    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const ownerRef = doc(db, 'owners', ownerId.trim());
      const ownerSnap = await getDoc(ownerRef);

      if (!ownerSnap.exists()) {
        // --- FIX: Logic for NEW Owner Registration ---
        // Create the owner with a default "inactive" status.
        await setDoc(ownerRef, {
          password: password,
          subscriptionStatus: "inactive" 
        });

        // Do NOT log them in. Instead, instruct them to contact you.
        Alert.alert(
          'Registration Successful!',
          'Your account has been created. Please contact support to activate your subscription.'
        );
        setOwnerId('');
        setPassword('');
        
      } else {
        // --- FIX: Logic for EXISTING Owner Login ---
        const ownerData = ownerSnap.data();

        // First, check the password.
        if (ownerData.password !== password) {
          Alert.alert('Login Failed', 'The password you entered is incorrect. Please try again.');
          setIsLoading(false);
          return; // Stop the function here.
        }
        
        // If password is correct, now check the subscription.
        if (ownerData.subscriptionStatus !== 'active') {
          Alert.alert(
            'Subscription Inactive',
            'Your account is not active. Please contact support to activate or renew your subscription.'
          );
          setIsLoading(false);
          return; // Stop the function here.
        }

        // If both password and subscription are valid, log them in.
        await AsyncStorage.setItem('ownerId', ownerId.trim());
        await AsyncStorage.setItem('ownerPassword', password);
        setIsRegistered(true);
        Alert.alert('Welcome Back', `Successfully logged in as ${ownerId.trim()}.`);
        router.replace('/');
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#007bff" style={{ alignSelf: 'center', marginBottom: 15 }} />
          <Text style={styles.header}>Admin Login</Text>
          <Text style={styles.subtitle}>
            Enter your credentials to access the control panel.
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
            onSubmitEditing={handleSubmit}
          />
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={22} color="#fff" />
                <Text style={styles.buttonText}>
                  {isRegistered ? 'Login' : 'Register & Proceed'}
                </Text>
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