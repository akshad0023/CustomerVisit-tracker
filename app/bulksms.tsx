// app/bulksms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import 'firebase/compat/functions'; // This import seems to be for compatibility, ensure it's correct for your Firebase version
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, firebase } from '../firebaseConfig'; // Ensure firebase is imported for functions

export default function BulkSmsScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = () => {
    if (message.trim().length < 5) {
      Alert.alert("Message Too Short", "Please enter a meaningful message to send.");
      return;
    }

    Alert.alert(
      "Confirm Send",
      "This will send an SMS to ALL customers in your database. This action cannot be undone. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Send Now",
          style: "default",
          onPress: async () => {
            Keyboard.dismiss();
            setIsLoading(true);
            try {
              const user = auth.currentUser;
              // --- DIAGNOSTIC LOG: Check if user is authenticated on the client side ---
              console.log("Current user in React Native (bulksms.tsx):", user ? user.uid : "No user");

              if (!user) {
                Alert.alert("Authentication Error", "You must be logged in to send messages.");
                setIsLoading(false);
                return;
              }

              // Ensure your 'us-central1' region matches your Cloud Function deployment
              const functions = firebase.app().functions('us-central1');
              const sendSmsFunction = functions.httpsCallable('sendBulkSms');

              // The user's ID token is automatically attached by firebase.functions.httpsCallable
              const response = await sendSmsFunction({ message: message.trim(), uid: user.uid }); // uid parameter might be redundant if using context.auth.uid in cloud function

              const data = response.data as { success: boolean; message: string; successCount?: number, errorCount?: number; };

              if (data.success) {
                Alert.alert(
                  "Process Complete",
                  `${data.message}\n\nSuccessfully sent: ${data.successCount || 0}\nFailed: ${data.errorCount || 0}`
                );
                setMessage('');
              } else {
                Alert.alert("Process Failed", data.message || "Could not complete the process.");
              }
            } catch (error: any) {
              console.error("Cloud function error:", error);
              // Provide more specific error messages if possible based on error.code
              if (error.code === 'unauthenticated') {
                  Alert.alert("Authentication Required", "You are not logged in or your session has expired. Please log in again.");
              } else if (error.code === 'permission-denied') {
                  Alert.alert("Permission Denied", "You do not have permission to perform this action.");
              } else {
                  Alert.alert("Error", error.message || "An unexpected error occurred. Please try again.");
              }
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.headerContainer}>
            <Text style={styles.header}>Send Customer Message</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close-circle" size={32} color="#ccc" />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.subtitle}>
              This message will be sent via SMS to all customers. Standard messaging rates from your Twilio account will apply.
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Type your message for offers or events..."
                multiline
                value={message}
                onChangeText={setMessage}
                maxLength={160} // Added max length for standard SMS segments
              />
              <Text style={styles.charCount}>{message.length} / 160</Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleSendMessage} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={22} color="#fff" />
                  <Text style={styles.buttonText}>Send to All Customers</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', },
  scrollContainer: { paddingTop: 10, paddingHorizontal: 15, flexGrow: 1, },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 15, marginTop: 10, },
  header: { fontSize: 24, fontWeight: 'bold', color: '#1c1c1e', },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5, },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 20, lineHeight: 22, },
  inputContainer: { marginBottom: 20, },
  input: {
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    textAlignVertical: 'top',
    height: 150,
    color: '#333',
  },
  charCount: { textAlign: 'right', color: '#888', fontSize: 12, marginTop: 4, },
  button: { flexDirection: 'row', backgroundColor: '#007bff', paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 2, },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10, },
});