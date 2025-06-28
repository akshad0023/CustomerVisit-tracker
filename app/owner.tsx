// All imports stay the same
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
  Dimensions,
  Image,
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
const LionLogo = require('../assets/images/Logo1.png');

const { width } = Dimensions.get('window');

// --- Casino App UI Colors ---
const CasinoColors = {
  background: 'black',
  cardBackground: '#1E1E2A',
  primaryText: '#FFFFFF',
  secondaryText: '#BBBBBB',
  accentGold: '#FFD700',
  accentRed: '#FF3366',
  accentGreen: '#33FF66',
  accentBlue: '#00CCFF',
  inputBackground: '#2A2A3E',
  inputBorder: '#555566',
  buttonPrimaryBg: '#FFD700',
  buttonPrimaryText: '#1A1A2A',
  buttonSecondaryBg: '#4A4A5A',
  buttonSecondaryText: '#FFFFFF',
  buttonDangerBg: '#CC0000',
  buttonDangerText: '#FFFFFF',
  shadowColor: '#000000',
  divider: '#404050',
};

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}

const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.inputContainer}>
    <View style={styles.iconWrapper}>
      <Ionicons name={iconName} size={20} color={CasinoColors.secondaryText} />
    </View>
    <TextInput
      style={styles.input}
      {...props}
      placeholderTextColor={CasinoColors.secondaryText}
    />
  </View>
);

const passwordComplexityRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

export default function OwnerScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const router = useRouter();

  const handleRegistration = async () => {
    if (email.trim() === '' || password.trim() === '') {
      Alert.alert('Validation Error', 'Both Email and Password are required.');
      return;
    }

    if (!passwordComplexityRegex.test(password)) {
      Alert.alert(
        'Weak Password',
        'Password must be at least 6 characters long and include at least one letter, one number, and one special character (e.g., @$!%*?&).'
      );
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
      setIsRegistering(false);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Registration Failed', 'This email address is already registered. Please try logging in.');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Registration Failed', 'Password is too weak. Please ensure it meets the complexity requirements.');
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

      if (!ownerSnap.exists()) {
        Alert.alert('Access Denied', 'Your email is not registered as an admin.');
        auth.signOut();
        setIsLoading(false);
        return;
      }

      if (ownerSnap.data().subscriptionStatus !== 'active') {
        Alert.alert('Subscription Inactive', 'Your account is not active. Please contact support.');
        auth.signOut();
        setIsLoading(false);
        return;
      } else {
        const lastKnownPassword = await AsyncStorage.getItem('ownerPassword');
        if (lastKnownPassword && lastKnownPassword !== password) {
          await AsyncStorage.removeItem('reportingPassword');
          Alert.alert(
            "Security Update",
            "Your main password has changed. You will be asked to create a new reporting password when you visit the Profit & Loss screen."
          );
        }

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
    if (!email.includes('@')) {
      Alert.alert("Invalid Email", "Please enter a valid email address to reset your password.");
      return;
    }

    sendPasswordResetEmail(auth, email.trim())
      .then(() => {
        Alert.alert("Check Your Email", `A password reset link has been sent to ${email}.`);
      })
      .catch((error) => {
        console.error("Password reset error:", error);
        Alert.alert("Error", "Could not send reset email. Make sure the email is correct and try again.");
      });
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <Image source={LionLogo} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.title}>Admin Portal</Text>
            <Text style={styles.subtitle}>
              {isRegistering ? 'Create your admin account' : 'Welcome back, admin'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <TouchableOpacity
                style={[styles.tabButton, !isRegistering && styles.activeTab]}
                onPress={() => setIsRegistering(false)}
              >
                <Text style={[styles.tabText, !isRegistering && styles.activeTabText]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, isRegistering && styles.activeTab]}
                onPress={() => setIsRegistering(true)}
              >
                <Text style={[styles.tabText, isRegistering && styles.activeTabText]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formContent}>
              <IconTextInput
                iconName="mail-outline"
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <IconTextInput
                iconName="lock-closed-outline"
                placeholder="Enter your password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoComplete="password"
              />

              {!isRegistering && (
                <TouchableOpacity style={styles.forgotPasswordButton} onPress={handlePasswordReset}>
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.disabledButton]}
                onPress={isRegistering ? handleRegistration : handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={CasinoColors.buttonPrimaryText} size="small" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Ionicons
                      name={isRegistering ? "person-add-outline" : "log-in-outline"}
                      size={20}
                      color={CasinoColors.buttonPrimaryText}
                    />
                    <Text style={styles.primaryButtonText}>
                      {isRegistering ? 'Create Account' : 'Sign In'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {isRegistering && (
                <View style={styles.passwordRequirements}>
                  <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                  <Text style={styles.requirementsText}>
                    • At least 6 characters long{'\n'}
                    • Include at least one letter{'\n'}
                    • Include at least one number{'\n'}
                    • Include at least one special character (@$!%*?&){'\n'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Secure admin access powered by GMT
            </Text>
          </View>
        </ScrollView>
        <StatusBar style="light" />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CasinoColors.background },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 120, paddingBottom: 40 },
  headerSection: { alignItems: 'center', marginBottom: 40 },
  logoContainer: { marginBottom: 24 },
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
  title: { fontSize: 32, fontWeight: 'bold', color: CasinoColors.primaryText, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: CasinoColors.secondaryText, textAlign: 'center', lineHeight: 24 },
  formCard: {
    backgroundColor: CasinoColors.cardBackground, borderRadius: 24,
    shadowColor: CasinoColors.shadowColor, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: CasinoColors.divider,
  },
  formHeader: {
    flexDirection: 'row', backgroundColor: CasinoColors.inputBackground,
    borderBottomWidth: 1, borderBottomColor: CasinoColors.divider,
  },
  tabButton: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab: {
    backgroundColor: CasinoColors.cardBackground, borderBottomWidth: 3,
    borderBottomColor: CasinoColors.accentGold,
  },
  tabText: { fontSize: 16, fontWeight: '600', color: CasinoColors.secondaryText },
  activeTabText: { color: CasinoColors.accentGold },
  formContent: { padding: 24 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CasinoColors.inputBackground,
    borderWidth: 1, borderColor: CasinoColors.inputBorder, borderRadius: 16,
    marginBottom: 16, paddingHorizontal: 16, height: 56,
  },
  iconWrapper: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: CasinoColors.primaryText, height: 56 },
  forgotPasswordButton: { alignSelf: 'flex-end', paddingVertical: 8, marginBottom: 8 },
  forgotPasswordText: { fontSize: 14, color: CasinoColors.accentBlue, fontWeight: '500' },
  primaryButton: {
    flexDirection: 'row', backgroundColor: CasinoColors.buttonPrimaryBg,
    paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    shadowColor: CasinoColors.accentGold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
  },
  disabledButton: { opacity: 0.7, backgroundColor: CasinoColors.buttonSecondaryBg },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: CasinoColors.buttonPrimaryText, fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  passwordRequirements: {
    marginTop: 20, padding: 16, backgroundColor: CasinoColors.inputBackground,
    borderRadius: 12, borderLeftWidth: 4, borderLeftColor: CasinoColors.accentGold,
  },
  requirementsTitle: { fontSize: 14, fontWeight: '600', color: CasinoColors.primaryText, marginBottom: 8 },
  requirementsText: { fontSize: 13, color: CasinoColors.secondaryText, lineHeight: 20 },
  footer: { alignItems: 'center', marginTop: 40 },
  footerText: { fontSize: 14, color: CasinoColors.secondaryText, textAlign: 'center' },
});