// app/uploadpayoutphoto.tsx
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function UploadPayout() {
  const router = useRouter();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    handleTakePhoto();
  }, []);

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera Permission', 'Camera access is required to take a payout photo.');
      router.back();
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (result.canceled || !result.assets?.[0]?.uri) {
      Alert.alert('Photo Required', 'You must take a payout photo.');
      router.back();
      return;
    }

    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');

      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error('Failed to convert image to blob'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });

      // --- Store payout photos in a distinct folder ---
      const filename = `${visitId}_payout_${Date.now()}.jpg`; // Added '_payout_' for clarity
      const storagePath = `payoutPhotos/${user.uid}/${filename}`; // NEW FOLDER: payoutPhotos
      const storageRef = ref(getStorage(), storagePath);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      const visitDocRef = doc(db, `owners/${user.uid}/visitHistory`, visitId);
      // --- Update only the payoutPhotoUrl field ---
      await updateDoc(visitDocRef, { payoutPhotoUrl: downloadURL });

      console.log("Uploaded Payout Photo URL:", downloadURL);
      Alert.alert('Success', 'Payout photo uploaded successfully.');
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert('Upload Failed', 'An error occurred while uploading the photo.');
      router.back();
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {uploading ? (
        <>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={{ marginTop: 12 }}>Uploading payout photo...</Text>
        </>
      ) : (
        <Text>Preparing camera...</Text>
      )}
    </View>
  );
}