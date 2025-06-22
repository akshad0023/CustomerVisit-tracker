// app/owner.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
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
import { auth, db } from '../firebaseConfig';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleRegistration = async () => {
    if (email.trim() === '' || password.trim() === '') {
      Alert.alert('Validation Error', 'Both Email and Password are required.');
      return;
    }
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      await sendEmailVerification(user);
      const ownerRef = doc(db, 'owners', user.uid);
      await setDoc(ownerRef, {
        email: user.email,
        subscriptionStatus: "inactive"
      });
      Alert.alert(
        'Verification Email Sent!',
        'Your account has been created. Please check your email and click the verification link to continue.'
      );
      setEmail('');
      setPassword('');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Registration Failed', 'This email address is already registered. Please try logging in.');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Registration Failed', 'Password should be at least 6 characters.');
      } else {
        console.error('Registration error:', error);
        Alert.alert('System Error', 'An unexpected error occurred during registration.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (email.trim() === '' || password.trim() === '') {
      Alert.alert('Validation Error', 'Both Email and Password are required.');
      return;
    }
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      await user.reload();
      
      if (!user.emailVerified) {
        Alert.alert(
          "Email Not Verified",
          "Please check your inbox and click the verification link before logging in. Would you like us to resend the link?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Resend Email", onPress: () => sendEmailVerification(user) }
          ]
        );
        auth.signOut();
        setIsLoading(false);
        return;
      }

      const ownerRef = doc(db, 'owners', user.uid);
      const ownerSnap = await getDoc(ownerRef);

      if (!ownerSnap.exists() || ownerSnap.data().subscriptionStatus !== 'active') {
        Alert.alert('Subscription Inactive', 'Your account is not active. Please contact support.');
        auth.signOut();
      } else {
        // --- THIS IS THE UPDATED LOGIC ---
        // After a successful login, check if the password has changed.
        const lastKnownPassword = await AsyncStorage.getItem('ownerPassword');
        if (lastKnownPassword && lastKnownPassword !== password) {
          // If the password they just used is different from the last one we stored,
          // it means they reset it. We must clear the old reporting password for security.
          await AsyncStorage.removeItem('reportingPassword');
          Alert.alert(
            "Security Update",
            "Your main password has changed. You will be asked to create a new reporting password when you visit the Profit & Loss screen."
          );
        }
        
        // Always save the latest successful password to be used by the P&L screen check.
        await AsyncStorage.setItem('ownerPassword', password);
        
        Alert.alert('Welcome Back!', `Successfully logged in.`);
        router.replace('/');
      }
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert('Login Failed', 'Invalid email or password. Please try again or register.');
      } else {
        console.error('Login error:', error);
        Alert.alert('System Error', 'An unexpected error occurred during login.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = () => {
    Alert.prompt(
      "Reset Password",
      "Please enter your registered email address to receive a password reset link.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Link",
          onPress: async (emailToReset) => {
            if (emailToReset && emailToReset.includes('@')) {
              try {
                await sendPasswordResetEmail(auth, emailToReset.trim());
                Alert.alert(
                  "Check Your Email",
                  `A password reset link has been sent to ${emailToReset}. Please follow the instructions in the email.`
                );
              } catch (error: any) {
                console.error("Password reset error:", error);
                Alert.alert("Error", "Could not send reset email. Please ensure the email address is correct and try again.");
              }
            } else {
              Alert.alert("Invalid Email", "Please enter a valid email address.");
            }
          },
        },
      ],
      'plain-text',
      '',
      'email-address'
    );
  };
  
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#007bff" style={{ alignSelf: 'center', marginBottom: 15 }} />
          <Text style={styles.header}>Admin Portal</Text>
          <Text style={styles.subtitle}>Log in or register for an admin account.</Text>

          <IconTextInput
            iconName="mail-outline"
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <IconTextInput
            iconName="lock-closed-outline"
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity style={styles.forgotButton} onPress={handlePasswordReset}>
            <Text style={styles.forgotButtonText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="log-in-outline" size={22} color="#fff" />
                <Text style={styles.buttonText}>Login</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={handleRegistration} disabled={isLoading}>
            <Text style={styles.registerButtonText}>Register New Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f2f5', padding: 20, justifyContent: 'center', alignItems: 'center', },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: '#1c1c1e', },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30, },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, marginBottom: 16, paddingHorizontal: 12, },
  inputIcon: { marginRight: 10, },
  input: { flex: 1, height: 55, fontSize: 16, color: '#333', },
  button: { flexDirection: 'row', backgroundColor: '#007bff', paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10, },
  registerButton: { marginTop: 15, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#007bff', },
  registerButtonText: { color: '#007bff', fontSize: 16, fontWeight: '600', },
  forgotButton: { alignSelf: 'flex-end', paddingVertical: 10, marginBottom: 5, },
  forgotButtonText: { color: '#007bff', fontSize: 14, },
});