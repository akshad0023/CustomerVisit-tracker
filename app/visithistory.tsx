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
  payoutSnapshotUrl?: string;
  customerPayoutProofPhotoUrl?: string;
  payoutPhotoUrl?: string;
}

interface IconTextInputProps extends TextInputProps {
  iconName: string;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => {
  return (
    <View style={styles.searchContainer}>
      {iconName ? (
        <Ionicons
          name={iconName as any}
          size={20}
          color="#FFD700"
          style={styles.searchIcon}
        />
      ) : null}
      <TextInput
        style={styles.searchInput}
        {...props}
        placeholderTextColor="#888"
      />
    </View>
  );
};

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
              payoutSnapshotUrl: v.payoutSnapshotUrl || '',
              customerPayoutProofPhotoUrl: v.customerPayoutProofPhotoUrl || '',
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

const renderItem = ({ item }: { item: Visit }) => (
  (() => {
    const matchPhotoUrl = item.payoutSnapshotUrl || item.customerPayoutProofPhotoUrl;
    return (
      <View style={styles.card}>
        {/* Basic Customer Info */}
        <View style={styles.infoRow}>
          <Ionicons name="person-circle-outline" size={24} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={20} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={20} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
          <Text style={styles.detailText}>Visited on: {item.lastUsed}</Text>
        </View>
        {item.matchAmount !== undefined && item.matchAmount > 0 ? (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={20} color="#4CAF50" style={styles.icon} /> {/* Green for cash */}
            <Text style={[styles.detailText, { color: '#4CAF50', fontWeight: '600' }]}>
              Amount Matched: ${item.matchAmount.toFixed(2)}
            </Text>
          </View>
        ) : null}
        {item.machineNumber ? (
          <View style={styles.infoRow}>
            <Ionicons name="game-controller-outline" size={20} color="#FFD700" style={styles.icon} /> {/* Gold icon */}
            <Text style={styles.detailText}>
              On Machine: #{item.machineNumber}
            </Text>
          </View>
        ) : null}

        {/* Divider for Photo Sections */}
        <View style={styles.sectionDivider} />

        {/* Match Amount Photo Section */}
        <Text style={styles.sectionHeader}>Match Photo</Text>
        {matchPhotoUrl ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.viewMatchPhotoButton]}
            onPress={() => handleViewPhoto(matchPhotoUrl!)}
            accessibilityLabel="View Match Amount Photo"
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={20} color="#000" style={styles.icon} /> {/* Black icon */}
            <Text style={[styles.actionButtonText, { color: '#000' }]}>View Match Photo</Text>
          </TouchableOpacity>
        ) : (
          item.matchAmount && item.matchAmount > 0 ? (
            <View style={styles.noPhotoButton}>
              <Ionicons name="alert-circle-outline" size={20} color="#FFD700" style={styles.icon} /> {/* Gold alert icon */}
              <Text style={styles.noPhotoButtonText}>No Match Photo Recorded</Text>
            </View>
          ) : (
            <Text style={styles.noPhotoInfoText}>No match photo needed or recorded.</Text>
          )
        )}

        {/* Divider for Payout Photo Section */}
        <View style={styles.sectionDivider} />

        {/* Payout Photo Section */}
        <Text style={styles.sectionHeader}>Payout Photo</Text>
        {item.payoutPhotoUrl ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.viewPayoutButton]}
            onPress={() => handleViewPhoto(item.payoutPhotoUrl!)}
            accessibilityLabel="View Payout Photo"
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={20} color="#000" style={styles.icon} /> {/* Black icon */}
            <Text style={styles.actionButtonText}>View Payout Photo</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.uploadPayoutButton]}
            onPress={() => router.push({ pathname: "/uploadpayout", params: { visitId: item.id } })}
            accessibilityLabel="Upload Payout Photo"
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={20} color="#FFF" style={styles.icon} /> {/* White icon */}
            <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Upload Payout Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  })()
);

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFD700" /> {/* Gold loading indicator */}
        <Text style={styles.loadingText}>Loading Today's Visits...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Today's Visits</Text>
        <TouchableOpacity onPress={() => router.push('/')} accessibilityLabel="Go to Home" accessibilityRole="button">
          <Ionicons name="home-outline" size={28} color="#FFD700" /> {/* Gold home icon */}
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
            {fullScreenPhotoUrl ? (
              <>
                {fullScreenImageLoading && (
                  <ActivityIndicator size="large" color="#FFD700" style={styles.imageLoadingIndicator} />
                )}
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
              </>
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
  container: {
    flex: 1,
    paddingTop: 10,
    backgroundColor: '#121212', // Very dark background
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    marginTop: -30, // Increased margin for status bar/notch
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for header
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A', // Darker background for search input
    borderWidth: 1,
    borderColor: '#555555', // Darker border
    borderRadius: 12,
    paddingHorizontal: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#FFFFFF', // White text input
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    color: '#CCCCCC', // Light grey for loading text
    textAlign: 'center',
  },
  card: {
    padding: 20,
    backgroundColor: '#1C1C1C', // Dark background for cards
    borderRadius: 12,
    marginVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#333333', // Subtle border
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    marginRight: 15,
    width: 24,
    textAlign: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for customer name
  },
  detailText: {
    fontSize: 16,
    color: '#CCCCCC', // Light grey for detail text
  },

  // --- Styles for sections and buttons ---
  sectionDivider: {
    height: 1,
    backgroundColor: '#444444', // Darker divider
    marginVertical: 15,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700', // Gold for section header
    marginBottom: 10,
    alignSelf: 'center',
  },
  noPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 5,
  },
  noPhotoButtonText: {
    fontSize: 14,
    color: '#888', // Consistent gray for info
    marginLeft: 8,
  },
  noPhotoInfoText: {
    fontSize: 14,
    color: '#888', // Consistent gray for info
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 5,
  },

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
    color: '#000', // Default black for buttons on gold/light backgrounds
  },
  viewMatchPhotoButton: {
    backgroundColor: '#FFD700', // Gold for match photo view
  },
  viewPayoutButton: {
    backgroundColor: '#FFD700', // Gold for payout photo view
  },
  uploadPayoutButton: {
    backgroundColor: '#FF6347', // Red for upload button
    borderColor: '#FF6347',
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
  imageLoadingIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});

export default VisitHistoryScreen;