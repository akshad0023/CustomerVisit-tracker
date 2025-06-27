// app/viewphoto.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'; // <-- Add Alert here
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function ViewPhotoScreen() {
  const router = useRouter();
  const { url } = useLocalSearchParams();
  const [imageLoading, setImageLoading] = useState(true);

  if (!url) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>View Photo</Text>
          <View style={{width: 28}} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>No image URL provided.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>View Photo</Text>
        <View style={{width: 28}} />
      </View>
      <View style={styles.imageContainer}>
        {imageLoading && (
          <ActivityIndicator size="large" color="#007bff" style={StyleSheet.absoluteFill} />
        )}
        <Image
          source={{ uri: String(url) }}
          style={styles.image}
          resizeMode="contain"
          onLoadEnd={() => setImageLoading(false)}
          onError={() => {
            setImageLoading(false);
            Alert.alert('Image Load Error', 'Could not load the image. It might be unavailable or corrupt.');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  image: {
    width: width,
    height: '100%',
    resizeMode: 'contain',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
});