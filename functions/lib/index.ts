import * as admin from 'firebase-admin';
// Note: getAuth is not directly used for context.auth validation in onCall functions,
// as the callable framework handles it automatically.
// import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';
// Changed from 'firebase-functions/v2/https' to 'firebase-functions/v2/https' for onCall
import * as https from 'firebase-functions/v2/https'; // Use v2 http for callable functions
import twilio from 'twilio';

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

let cachedTwilioClient: ReturnType<typeof twilio> | null = null;

// Define secrets as before
export const twilioSid = defineSecret("TWILIO_SID");
export const twilioToken = defineSecret("TWILIO_TOKEN");
export const twilioNumber = defineSecret("TWILIO_NUMBER");

// Changed from https.onRequest to https.onCall
// Callable functions receive 'data' and 'context' as arguments.
// Authentication is handled automatically by the onCall framework.
export const sendBulkSms = https.onCall({ secrets: [twilioSid, twilioToken, twilioNumber] }, async (request) => {
  // Access data and context from the single 'request' object for v2 callable functions
  const data = request.data as { message: string }; // Cast data to expected type
  const context = request.auth; // The context.auth object is now directly available

  const sid = twilioSid.value();
  const token = twilioToken.value();
  const sender = twilioNumber.value();

  // Initialize Twilio client only once
  if (!cachedTwilioClient) {
    try {
      cachedTwilioClient = twilio(sid, token);
      console.log("Twilio client initialized successfully.");
    } catch (err) {
      console.error("Error initializing Twilio client:", err);
      // Throw HttpsError for client-callable errors
      throw new https.HttpsError(
        'internal',
        'Server error: Failed to initialize Twilio service.'
      );
    }
  }

  if (!cachedTwilioClient || !sender) {
    console.error("Twilio client or sender number is not configured after initialization attempt.");
    throw new https.HttpsError(
      'internal',
      'Twilio service is not fully configured on the server.'
    );
  }

  // Authentication check: context.auth will be null if the user is not authenticated.
  // This replaces your manual header parsing and token verification.
  if (!context || !context.uid) {
    console.error('Authentication failed: context.auth is null or missing UID.');
    throw new https.HttpsError(
      'unauthenticated',
      'You must be logged in to send messages.'
    );
  }

  const ownerId = context.uid; // Get UID directly from context.auth
  const messageBody = data.message; // Get message from the 'data' payload

  if (!messageBody || messageBody.trim().length === 0) {
    throw new https.HttpsError(
      'invalid-argument',
      'The message body cannot be empty.'
    );
  }

  try {
    const ownerDoc = await db.collection("owners").doc(ownerId).get();
    if (!ownerDoc.exists || ownerDoc.data()?.hasSmsFeature !== true) {
      throw new https.HttpsError(
        'permission-denied',
        'Your subscription does not include this feature.'
      );
    }

    const customersRef = db.collection(`owners/${ownerId}/customers`);
    const snapshot = await customersRef.get();
    if (snapshot.empty) {
      // For onCall, a success with a message is a valid return, not an error
      return { success: false, message: "No customers found for this owner." };
    }

    // Prepare phone numbers, assuming doc.id is the phone number string
    const phoneNumbers = snapshot.docs.map(doc => `+1${doc.id}`);
    const smsPromises = phoneNumbers.map((number) => {
      return cachedTwilioClient!.messages.create({
        to: number,
        from: sender,
        body: messageBody,
      });
    });

    const results = await Promise.allSettled(smsPromises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const errorCount = results.length - successCount;

    console.log(`SMS sending complete: ${successCount} successful, ${errorCount} failed.`);

    // Return the result for a callable function
    return {
      success: true,
      message: "Messaging process complete!",
      successCount,
      errorCount,
    };
  } catch (error: any) {
    console.error("Critical error in sendBulkSms function:", error);
    // If it's already an HttpsError, re-throw it. Otherwise, wrap it.
    if (error.code && error.message) {
      throw new https.HttpsError(error.code, error.message);
    } else {
      throw new https.HttpsError(
        'internal',
        'An unexpected server error occurred during SMS processing.',
        error.message // Pass original error message as details if useful for debugging
      );
    }
  }
});
