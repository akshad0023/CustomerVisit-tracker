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
  Dimensions,
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

const { width } = Dimensions.get('window');

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}

const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.inputContainer}>
    <View style={styles.iconWrapper}>
      <Ionicons name={iconName} size={20} color="#6B7280" />
    </View>
    <TextInput 
      style={styles.input} 
      {...props} 
      placeholderTextColor="#9CA3AF" 
    />
  </View>
);

// Regex for password complexity: at least 6 characters, at least one letter, one number, one special character
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

      if (!ownerSnap.exists() || ownerSnap.data().subscriptionStatus !== 'active') {
        Alert.alert('Subscription Inactive', 'Your account is not active. Please contact support.');
        auth.signOut();
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
    Alert.prompt(
      "Reset Password",
      "Please enter your registered email address to receive a password reset link. You will set your new password through the link sent to your email.",
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
      <View style={styles.container}>
        {/* Background Gradient Effect */}
        <View style={styles.backgroundGradient} />
        
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <View style={styles.logoInner}>
                <Text style={styles.logoText}>CMT</Text>
              </View>
            </View>
            
            <Text style={styles.title}>Admin Portal</Text>
            <Text style={styles.subtitle}>
              {isRegistering ? 'Create your admin account' : 'Welcome back, admin'}
            </Text>
          </View>

          {/* Form Card */}
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
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons 
                      name={isRegistering ? "person-add-outline" : "log-in-outline"} 
                      size={20} 
                      color="#FFFFFF" 
                    />
                    <Text style={styles.primaryButtonText}>
                      {isRegistering ? 'Create Account' : 'Sign In'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {isRegistering && (
                <View style={styles.passwordRequirements}>
                  <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                  <Text style={styles.requirementsText}>
                    • At least 6 characters long{'\n'}
                    • Include at least one letter{'\n'}
                    • Include at least one number{'\n'}
                    • Include at least one special character (@$!%*?&)
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Secure admin access powered by CMT
            </Text>
          </View>
        </ScrollView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: '#3B82F6',
    opacity: 0.05,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoInner: {
    width: 80,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E6E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: '#5B7FE8',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  },
  formHeader: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  formContent: {
    padding: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  iconWrapper: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    height: 56,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  passwordRequirements: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  requirementsText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});