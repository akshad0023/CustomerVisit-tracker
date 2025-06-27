// app/visithistory.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebaseConfig';

const { width: screenWidth } = Dimensions.get('window');

interface Visit {
  id: string;
  name: string;
  phone: string;
  idImageUrl: string;
  lastUsed: string;
  matchAmount?: number;
  machineNumber?: string;
  // --- REVERTED: Original fields for Match Amount Photos ---
  payoutSnapshotUrl?: string; // Used for match amount photos as per original code
  customerPayoutProofPhotoUrl?: string; // Also used for match amount photos as per original code

  // --- NEW: Separate field for Payout Photo (from uploadpayoutphoto.tsx) ---
  payoutPhotoUrl?: string;
}

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.searchContainer}>
    <Ionicons name={iconName} size={20} color="#888" style={styles.searchIcon} />
    <TextInput style={styles.searchInput} {...props} placeholderTextColor="#aaa" />
  </View>
);

const VisitHistoryScreen = () => {
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredVisits, setFilteredVisits] = useState<Visit[]>([]);
  const router = useRouter();

  const [showFullScreenPhoto, setShowFullScreenPhoto] = useState(false);
  const [fullScreenPhotoUrl, setFullScreenPhotoUrl] = useState<string | null>(null);
  const [fullScreenImageLoading, setFullScreenImageLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsReady(true);
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe();
  }, [router]);

  useFocusEffect(
    React.useCallback(() => {
      if (!isReady) return;

      const fetchVisits = async () => {
        setLoading(true);
        try {
          const user = auth.currentUser;
          if (!user) throw new Error('Owner not logged in');
          const ownerId = user.uid;

          const today = dayjs().format('YYYY-MM-DD');
          const q = query(
            collection(db, `owners/${ownerId}/visitHistory`),
            where('lastUsed', '==', today),
            orderBy('timestamp', 'desc')
          );
          const snapshot = await getDocs(q);
          const data: Visit[] = snapshot.docs.map(doc => {
            const v = doc.data();
            return {
              id: doc.id,
              name: v.name || 'Unknown',
              phone: v.phone || 'No Phone',
              idImageUrl: v.idImageUrl || '',
              lastUsed: v.lastUsed || '',
              matchAmount: typeof v.matchAmount === 'number' ? v.matchAmount : 0,
              machineNumber: v.machineNumber || '',
              // --- FETCHING ORIGINAL MATCH PHOTO FIELDS ---
              payoutSnapshotUrl: v.payoutSnapshotUrl || '', // Original field for match photos
              customerPayoutProofPhotoUrl: v.customerPayoutProofPhotoUrl || '', // Original field for match photos
              // --- FETCHING NEW PAYOUT PHOTO FIELD ---
              payoutPhotoUrl: v.payoutPhotoUrl || '',
            };
          });
          setVisits(data);
          setFilteredVisits(data);
        } catch (error) {
          console.error('Error fetching visit history:', error);
          Alert.alert("Error", "Could not fetch visit history.");
        } finally {
          setLoading(false);
        }
      };

      fetchVisits();
    }, [isReady])
  );

  useEffect(() => {
    if (searchQuery === '') {
      setFilteredVisits(visits);
    } else {
      const filteredData = visits.filter(visit =>
        visit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        visit.phone.includes(searchQuery.toLowerCase())
      );
      setFilteredVisits(filteredData);
    }
  }, [searchQuery, visits]);

  const handleViewPhoto = (url: string) => {
    setFullScreenPhotoUrl(url);
    setShowFullScreenPhoto(true);
    setFullScreenImageLoading(true);
  };

  const renderItem = ({ item }: { item: Visit }) => {
    // Determine which URL to use for the original "match amount photo" logic
    const matchPhotoUrl = item.payoutSnapshotUrl || item.customerPayoutProofPhotoUrl;

    return (
      <View style={styles.card}>
        {/* Basic Customer Info */}
        <View style={styles.infoRow}>
          <Ionicons name="person-circle-outline" size={24} color="#333" style={styles.icon} />
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={20} color="#555" style={styles.icon} />
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={20} color="#555" style={styles.icon} />
          <Text style={styles.detailText}>Visited on: {item.lastUsed}</Text>
        </View>
        {item.matchAmount !== undefined && item.matchAmount > 0 ? (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color="#28a745" style={styles.icon} />
            <Text style={[styles.detailText, { color: '#28a745', fontWeight: '600' }]}>
              Amount Matched: ${item.matchAmount.toFixed(2)}
            </Text>
          </View>
        ) : null}
        {item.machineNumber ? (
          <View style={styles.infoRow}>
            <Ionicons name="game-controller-outline" size={20} color="#555" style={styles.icon} />
            <Text style={styles.detailText}>
              On Machine: #{item.machineNumber}
            </Text>
          </View>
        ) : null}

        {/* Divider for Photo Sections */}
        <View style={styles.sectionDivider} />

        {/* Match Amount Photo Section (Restored to original logic) */}
        <Text style={styles.sectionHeader}>Match Photo</Text>
        {matchPhotoUrl ? ( // Checks for either of the original fields
          <TouchableOpacity
            style={[styles.actionButton, styles.viewMatchPhotoButton]}
            onPress={() => handleViewPhoto(matchPhotoUrl!)}
            accessibilityLabel="View Match Amount Photo"
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={20} color="#28a745" style={styles.icon} />
            <Text style={[styles.actionButtonText, { color: '#28a745' }]}>View Match Photo</Text>
          </TouchableOpacity>
        ) : (
          // Show this indicator if a match amount exists but no photo is found in original fields
          item.matchAmount && item.matchAmount > 0 ? (
            <View style={styles.noPhotoButton}>
              <Ionicons name="alert-circle-outline" size={20} color="#ffc107" style={styles.icon} />
              <Text style={styles.noPhotoButtonText}>No Match Photo Recorded</Text>
            </View>
          ) : (
            // Only show general info if no match amount at all
            <Text style={styles.noPhotoInfoText}>No match photo needed or recorded.</Text>
          )
        )}

        {/* Divider for Payout Photo Section */}
        <View style={styles.sectionDivider} />

        {/* Payout Photo Section (Uses new payoutPhotoUrl field) */}
        <Text style={styles.sectionHeader}>Payout Photo</Text>
        {item.payoutPhotoUrl ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.viewPayoutButton]}
            onPress={() => handleViewPhoto(item.payoutPhotoUrl!)}
            accessibilityLabel="View Payout Photo"
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={20} color="#007bff" style={styles.icon} />
            <Text style={styles.actionButtonText}>View Payout Photo</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.uploadPayoutButton]}
            onPress={() => router.push({ pathname: "/uploadpayout", params: { visitId: item.id } })}
            accessibilityLabel="Upload Payout Photo"
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={20} color="#dc3545" style={styles.icon} />
            <Text style={[styles.actionButtonText, { color: '#dc3545' }]}>Upload Payout Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Today's Visits...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>CMT<Text style={styles.headerNormal}> | Today's Visits</Text></Text>
        <TouchableOpacity onPress={() => router.push('/')} accessibilityLabel="Go to Home" accessibilityRole="button">
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 10, marginBottom: 10 }}>
        <IconTextInput
          iconName="search-outline"
          placeholder="Search by Customer Name or Phone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          accessibilityLabel="Search customer visits"
        />
      </View>

      <FlatList
        data={filteredVisits}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.loadingText}>
              {searchQuery ? 'No customers match your search for today.' : 'No visits recorded for today.'}
            </Text>
          </View>
        }
      />

      {/* Full Screen Photo Modal */}
      <Modal
        visible={showFullScreenPhoto}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullScreenPhoto(false)}
      >
        <SafeAreaView style={styles.fullScreenModalContainer}>
          <View style={styles.fullScreenModalHeader} pointerEvents="box-none">
            <TouchableOpacity
              onPress={() => setShowFullScreenPhoto(false)}
              style={styles.fullScreenModalBackButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.fullScreenModalHeaderTitle}>View Photo</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.fullScreenImageContainer}>
            {fullScreenImageLoading && (
              <ActivityIndicator size="large" color="#007bff" style={StyleSheet.absoluteFill} />
            )}
            {fullScreenPhotoUrl ? (
              <Image
                source={{ uri: fullScreenPhotoUrl }}
                style={styles.fullScreenImage}
                resizeMode="contain"
                onLoadEnd={() => setFullScreenImageLoading(false)}
                onError={() => {
                  setFullScreenImageLoading(false);
                  Alert.alert('Image Load Error', 'Could not load the image. It might be unavailable or corrupt. Check your Firebase Storage rules and the console for the URL.');
                  console.error("Failed to load image URL:", fullScreenPhotoUrl);
                }}
              />
            ) : (
              <Text style={styles.fullScreenErrorText}>No image URL provided.</Text>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 10, backgroundColor: '#f0f2f5', },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, marginTop: 10, },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#007bff',
  },
  headerNormal: {
    fontWeight: '300',
    color: '#1c1c1e',
  },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, },
  searchIcon: { marginRight: 10, },
  searchInput: { flex: 1, height: 50, fontSize: 16, color: '#333', },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50, },
  loadingText: { marginTop: 10, fontSize: 18, color: 'gray', textAlign: 'center', },
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 12, marginVertical: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, },
  icon: { marginRight: 15, width: 24, textAlign: 'center', },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1c1c1e', },
  detailText: { fontSize: 16, color: '#333', },
  divider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 8, },

  // --- Styles for sections and buttons ---
  sectionDivider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 15, },
  sectionHeader: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 10, alignSelf: 'center' },
  noPhotoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginBottom: 5, },
  noPhotoButtonText: { fontSize: 14, color: '#888', marginLeft: 8, },
  noPhotoInfoText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 5, marginBottom: 5, },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'stretch',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  viewMatchPhotoButton: {
    backgroundColor: '#e6ffe6', // Light green for match photo
  },
  viewPayoutButton: {
    backgroundColor: '#e0f2f7', // Light blue for payout photo view
  },
  uploadPayoutButton: {
    backgroundColor: '#fff3f3', // Very light red for upload
    borderColor: '#dc3545',
    borderWidth: 1,
  },

  // Styles for the Full Screen Photo Modal
  fullScreenModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: 50, // Pushes header down for status bar/notch
    paddingBottom: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  fullScreenModalBackButton: {
    padding: 5,
  },
  fullScreenModalHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  fullScreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  fullScreenImage: {
    width: screenWidth,
    height: '100%',
    resizeMode: 'contain',
  },
  fullScreenErrorText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default VisitHistoryScreen;