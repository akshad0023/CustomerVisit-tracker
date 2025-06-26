import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// import ImageViewer from 'react-native-image-zoom-viewer'; // REMOVE THIS IMPORT
import ImageView from 'react-native-image-viewing'; // ADD THIS IMPORT
import { auth, db } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

interface Shift {
  id: string;
  employeeName: string;
  startTime?: string;
  endTime?: string;
  machines: { [machineNumber: string]: { in: number; out: number; images?: string[]; }; };
  totalIn: number;
  totalOut: number;
  totalMatchedAmount: number;
  profitOrLoss: number;
  notes?: string;
}

interface SummaryRowProps {
  label: string;
  value: string;
  valueColor?: string;
  isBold?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, valueColor = '#333', isBold = false, iconName }) => (
  <View style={styles.summaryRow}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {iconName && <Ionicons name={iconName} size={20} color={valueColor || '#333'} style={{ marginRight: 10, width: 22 }} />}
      <Text style={[styles.summaryLabel, isBold && { fontWeight: 'bold' }]}>{label}</Text>
    </View>
    <Text style={[styles.summaryValue, { color: valueColor }, isBold && { fontWeight: 'bold' }]}>{value}</Text>
  </View>
);

export default function MachineTracker() {
  const [shiftData, setShiftData] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  const [modalVisible, setModalVisible] = useState(false);
  // CHANGE: Now storing only valid image URLs as { uri: string } objects
  const [selectedMachineImagesForViewer, setSelectedMachineImagesForViewer] = useState<{ uri: string }[]>([]);
  const [selectedMachineNumber, setSelectedMachineNumber] = useState<string>('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Function to prepare and open the image modal
  const openImageModal = (images: string[], machineNumber: string, initialImageIndex: number = 0) => {
    // Filter for valid URLs and map to the { uri: string } format required by ImageView
    const validImageObjects = (images || [])
      .filter(url => typeof url === 'string' && url.startsWith('https://'))
      .map(url => ({ uri: url }));

    console.log(`[DEBUG] Opening modal for Machine ${machineNumber}. Prepared images:`, validImageObjects);

    if (validImageObjects.length > 0) {
      setSelectedMachineImagesForViewer(validImageObjects);
      setSelectedMachineNumber(machineNumber);
      setCurrentImageIndex(initialImageIndex); // Set the initial index
      setModalVisible(true);
    } else {
      Alert.alert('No Photos', `No valid photos available for Machine ${machineNumber}.`);
    }
  };

  // The navigateImage function is no longer needed as ImageView handles internal navigation
  // const navigateImage = (direction: 'prev' | 'next') => {
  //   if (selectedMachineImagesForViewer.length <= 1) return;
  //   if (direction === 'next') {
  //     setCurrentImageIndex((prevIndex) => (prevIndex + 1) % selectedMachineImagesForViewer.length);
  //   } else {
  //     setCurrentImageIndex((prevIndex) => (prevIndex - 1 + selectedMachineImagesForViewer.length) % selectedMachineImagesForViewer.length);
  //   }
  // };

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

  useEffect(() => {
    if (!isReady) return;

    const fetchShiftData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not found");
        const ownerId = user.uid;

        const q = query(collection(db, 'owners', ownerId, 'shifts'), orderBy('startTime', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => {
          const shift = doc.data();
          const machinesWithImages: { [key: string]: { in: number; out: number; images?: string[]; }; } = {};
          if (shift.machines) {
            Object.keys(shift.machines).forEach(machineKey => {
              machinesWithImages[machineKey] = {
                in: shift.machines[machineKey].in || 0,
                out: shift.machines[machineKey].out || 0,
                images: Array.isArray(shift.machines[machineKey].images)
                  ? shift.machines[machineKey].images.filter(Boolean)
                  : []
              };
            });
          }

          return {
            id: doc.id,
            employeeName: shift.employeeName,
            startTime: shift.startTime,
            endTime: shift.endTime,
            machines: machinesWithImages,
            totalIn: shift.totalIn || 0,
            totalOut: shift.totalOut || 0,
            totalMatchedAmount: shift.totalMatchedAmount || 0,
            profitOrLoss: shift.profitOrLoss || 0,
            notes: shift.notes,
          } as Shift;
        });
        setShiftData(data);
      } catch (error) {
        console.error('Error fetching shift data:', error);
        Alert.alert("Error", "Could not load shift history.");
      } finally {
        setLoading(false);
      }
    };
    fetchShiftData();
  }, [isReady]);

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Shift History...</Text>
      </View>
    );
  }

  const renderShiftCard = ({ item }: { item: Shift }) => {
    const businessProfit = (item.totalIn || 0) - (item.totalOut || 0);
    const resultColor = businessProfit >= 0 ? '#28a745' : '#dc3545';
    const profitLabel = businessProfit >= 0 ? 'Profit' : 'Loss';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.employeeName}>{item.employeeName}</Text>
          <View>
            <Text style={styles.timeText}>Start: {item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}</Text>
            <Text style={styles.timeText}>End: {item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}</Text>
          </View>
        </View>

        {item.notes && item.notes.trim() !== '' && (
          <>
            <View style={styles.divider} />
            <View style={styles.notesSection}>
              <Text style={styles.notesTitle}>📝 Shift Notes:</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          </>
        )}

        <View style={styles.divider} />
        {item.machines && Object.keys(item.machines).length > 0 && (
          <View style={styles.machineSection}>
            <View style={styles.machineTableHeader}>
              <Text style={[styles.machineTableCell, styles.tableHeaderText]}>Machine</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>In ($)</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'right' }]}>Out ($)</Text>
              <Text style={[styles.machineTableCell, styles.tableHeaderText, { textAlign: 'center' }]}>Snaps</Text>
            </View>
            {Object.keys(item.machines).sort((a,b) => parseInt(a) - parseInt(b)).map((machine) => (
              <View key={machine} style={styles.machineTableRow}>
                <Text style={styles.machineTableCell}>{machine}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${item.machines[machine].in.toFixed(2)}</Text>
                <Text style={[styles.machineTableCell, { textAlign: 'right' }]}>${item.machines[machine].out.toFixed(2)}</Text>
                <View style={[styles.machineTableCell, { alignItems: 'center' }]}>
                  {(item.machines[machine].images && item.machines[machine].images!.length > 0) ? (
                    <TouchableOpacity
                      // Changed openImageModal call to match new ImageView usage
                      onPress={() => openImageModal([...item.machines[machine].images!], machine, 0)}
                      style={styles.viewSnapshotsButton}
                    >
                      <Ionicons name="images-outline" size={20} color="#007bff" />
                      <Text style={styles.viewSnapshotsText}>({item.machines[machine].images!.length})</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.noSnapshotsText}>N/A</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.summaryContainer}>
          <SummaryRow label="Total In:" value={`$${(item.totalIn || 0).toFixed(2)}`} iconName="arrow-down-circle-outline" valueColor="#28a745" />
          <SummaryRow label="Total Out:" value={`$${(item.totalOut || 0).toFixed(2)}`} iconName="arrow-up-circle-outline" valueColor="#dc3545" />
          <SummaryRow label="Matched Amount:" value={`$${(item.totalMatchedAmount || 0).toFixed(2)}`} iconName="gift-outline" valueColor="#6f42c1" />
          <View style={styles.divider} />
          <SummaryRow label={`${profitLabel}:`} value={`$${Math.abs(businessProfit).toFixed(2)}`} valueColor={resultColor} isBold={true} iconName={businessProfit >= 0 ? "trending-up-outline" : "trending-down-outline"} />
        </View>
        <TouchableOpacity
          onPress={() => {
            const printContent = `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Shift Report - ${item.employeeName}</h2>
        <p><strong>Shift ID:</strong> ${item.id}</p>
        <p><strong>Start Time:</strong> ${item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}</p>
        <p><strong>End Time:</strong> ${item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}</p>

        ${item.notes ? `<p><strong>Shift Notes:</strong> ${item.notes}</p>` : ''}

        <h3>Machine Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <th style="text-align: left; border-bottom: 1px solid #ccc; padding: 8px;">Machine</th>
            <th style="text-align: right; border-bottom: 1px solid #ccc; padding: 8px;">In ($)</th>
            <th style="text-align: right; border-bottom: 1px solid #ccc; padding: 8px;">Out ($)</th>
            <th style="text-align: center; border-bottom: 1px solid #ccc; padding: 8px;">Snapshots</th>
          </tr>
          ${Object.keys(item.machines || {})
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(machine => {
              const m = item.machines[machine];
              return `
                <tr>
                  <td style="padding: 8px;">${machine}</td>
                  <td style="text-align: right; padding: 8px;">$${m.in.toFixed(2)}</td>
                  <td style="text-align: right; padding: 8px;">$${m.out.toFixed(2)}</td>
                  <td style="text-align: center; padding: 8px;">${m.images && m.images.length > 0 ? `${m.images.length} photo(s)` : 'N/A'}</td>
                </tr>
              `;
            }).join('')}
        </table>

        <h3>Summary</h3>
        <p><strong>Total In:</strong> $${(item.totalIn || 0).toFixed(2)}</p>
        <p><strong>Total Out:</strong> $${(item.totalOut || 0).toFixed(2)}</p>
        <p><strong>Matched Amount:</strong> $${(item.totalMatchedAmount || 0).toFixed(2)}</p>
        <p><strong>${profitLabel}:</strong> $${Math.abs(businessProfit).toFixed(2)}</p>
      </body>
    </html>
  `;
            import('expo-print').then(({ printAsync }) =>
              printAsync({ html: printContent })
            );
          }}
          style={{ marginTop: 10, backgroundColor: '#007bff', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Print Shift Summary</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Shift History</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#007bff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={shiftData}
        keyExtractor={(item) => item.id}
        renderItem={renderShiftCard}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.loadingText}>No shift history found.</Text>
          </View>
        }
      />

      {/* Replaced Modal with ImageView directly */}
      <ImageView
        images={selectedMachineImagesForViewer} // Using the new state for ImageView
        imageIndex={currentImageIndex}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)} // This closes the modal
        // Footer component from customerinfo.tsx adapted
        FooterComponent={({ imageIndex }) => (
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>
              Machine {selectedMachineNumber} ({imageIndex + 1}/{selectedMachineImagesForViewer.length})
            </Text>
          </View>
        )}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingTop: 10, },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, marginTop: 40, },
  header: { fontSize: 26, fontWeight: 'bold', color: '#1c1c1e', },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50, },
  loadingText: { marginTop: 10, fontSize: 18, color: 'gray', },
  card: { backgroundColor: '#fff', padding: 16, marginHorizontal: 10, marginVertical: 8, borderRadius: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, },
  cardHeader: { marginBottom: 12, },
  employeeName: { fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#111', },
  timeText: { fontSize: 14, color: '#666', },
  divider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 12, },
  notesSection: { backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, },
  notesTitle: { fontSize: 14, fontWeight: '600', color: '#495057', marginBottom: 5, },
  notesText: { fontSize: 14, color: '#343a40', fontStyle: 'italic', },
  machineSection: { marginVertical: 5, },
  machineTableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#dee2e6', },
  tableHeaderText: { fontSize: 14, fontWeight: '600', color: '#495057', },
  machineTableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, },
  machineTableCell: { flex: 1, fontSize: 16, color: '#333', paddingRight: 5 },
  summaryContainer: { marginTop: 12, },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, },
  summaryLabel: { fontSize: 16, color: '#495057', },
  summaryValue: { fontSize: 16, fontWeight: '500', },

  viewSnapshotsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0ff',
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  viewSnapshotsText: {
    marginLeft: 5,
    fontSize: 12,
    color: '#007bff',
    fontWeight: 'bold',
  },
  noSnapshotsText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },

  modalOverlay: { // Keeping these styles in case you want to use a custom Modal wrapper later
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: { // Not directly used by ImageView, but good to keep if you had fallback UI
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: { // Not directly used by ImageView
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  noImagesInModalText: { // Not directly used by ImageView
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },
  closeModalButton: { // Not directly used by ImageView
    backgroundColor: '#007bff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeModalButtonText: { // Not directly used by ImageView
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Removed closeButtonOverlay, imageViewerIndicator, navButton styles
  // as ImageView handles its own UI.
  footerContainer: { // Added for ImageView's FooterComponent
    height: 80,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  footerText: { // Added for ImageView's FooterComponent
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  }
});