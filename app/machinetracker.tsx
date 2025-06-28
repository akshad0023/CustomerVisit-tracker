import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const SummaryRow: React.FC<SummaryRowProps> = ({
  label,
  value,
  valueColor = '#FFFFFF',
  isBold = false,
  iconName,
}) => (
  <View style={styles.summaryRow}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {iconName && (
        <Ionicons
          name={iconName}
          size={20}
          color={valueColor || '#FFD700'}
          style={{ marginRight: 10, width: 22 }}
        />
      )}
      <Text
        style={[
          styles.summaryLabel,
          { color: valueColor },
          isBold && { fontWeight: 'bold' },
        ]}
      >
        {label}
      </Text>
    </View>
    <Text
      style={[
        styles.summaryValue,
        { color: valueColor },
        isBold && { fontWeight: 'bold' },
      ]}
    >
      {value}
    </Text>
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
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Loading Shift History...</Text>
      </View>
    );
  }

  const renderShiftCard = ({ item }: { item: Shift }) => {
    const businessProfit = (item.totalIn || 0) - (item.totalOut || 0);
    const resultColor = businessProfit >= 0 ? '#4CAF50' : '#FF6347'; // Green for profit, Red for loss
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
                      <Ionicons name="images-outline" size={20} color="#FFD700" /> {/* Gold icon */}
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
          <SummaryRow label="Total In:" value={`$${(item.totalIn || 0).toFixed(2)}`} iconName="arrow-down-circle-outline" valueColor="#4CAF50" /> {/* Green */}
          <SummaryRow label="Total Out:" value={`$${(item.totalOut || 0).toFixed(2)}`} iconName="arrow-up-circle-outline" valueColor="#FF6347" /> {/* Red */}
          <SummaryRow label="Matched Amount:" value={`$${(item.totalMatchedAmount || 0).toFixed(2)}`} iconName="gift-outline" valueColor="#FFD700" /> {/* Gold */}
          <View style={styles.divider} />
          <SummaryRow label={`${profitLabel}:`} value={`$${Math.abs(businessProfit).toFixed(2)}`} valueColor={resultColor} isBold={true} iconName={businessProfit >= 0 ? "trending-up-outline" : "trending-down-outline"} />
        </View>
        <TouchableOpacity
          onPress={() => {
            const printContent = `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #121212; color: #FFFFFF;">
        <h2 style="color: #FFD700;">Shift Report - ${item.employeeName}</h2>
        <p><strong>Shift ID:</strong> <span style="color: #CCCCCC;">${item.id}</span></p>
        <p><strong>Start Time:</strong> <span style="color: #CCCCCC;">${item.startTime ? new Date(item.startTime).toLocaleString() : 'N/A'}</span></p>
        <p><strong>End Time:</strong> <span style="color: #CCCCCC;">${item.endTime ? new Date(item.endTime).toLocaleString() : 'N/A'}</span></p>

        ${item.notes ? `<p><strong style="color: #FFD700;">Shift Notes:</strong> <span style="color: #CCCCCC; font-style: italic;">${item.notes}</span></p>` : ''}

        <h3 style="color: #FFD700;">Machine Details:</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; background-color: #1C1C1C; border: 1px solid #333333;">
          <thead>
            <tr style="background-color: #333333;">
              <th style="text-align: left; border-bottom: 1px solid #555555; padding: 10px; color: #FFD700;">Machine</th>
              <th style="text-align: right; border-bottom: 1px solid #555555; padding: 10px; color: #FFD700;">In ($)</th>
              <th style="text-align: right; border-bottom: 1px solid #555555; padding: 10px; color: #FFD700;">Out ($)</th>
              <th style="text-align: center; border-bottom: 1px solid #555555; padding: 10px; color: #FFD700;">Snapshots</th>
            </tr>
          </thead>
          <tbody>
          ${Object.keys(item.machines || {})
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(machine => {
              const m = item.machines[machine];
              return `
                <tr>
                  <td style="padding: 10px; color: #FFFFFF; border-bottom: 1px solid #222222;">${machine}</td>
                  <td style="text-align: right; padding: 10px; color: #FFFFFF; border-bottom: 1px solid #222222;">$${m.in.toFixed(2)}</td>
                  <td style="text-align: right; padding: 10px; color: #FFFFFF; border-bottom: 1px solid #222222;">$${m.out.toFixed(2)}</td>
                  <td style="text-align: center; padding: 10px; color: #FFFFFF; border-bottom: 1px solid #222222;">${m.images && m.images.length > 0 ? `${m.images.length} photo(s)` : 'N/A'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <h3 style="color: #FFD700; margin-top: 20px;">Summary</h3>
        <p><strong>Total In:</strong> <span style="color: #4CAF50;">$${(item.totalIn || 0).toFixed(2)}</span></p>
        <p><strong>Total Out:</strong> <span style="color: #FF6347;">$${(item.totalOut || 0).toFixed(2)}</span></p>
        <p><strong>Matched Amount:</strong> <span style="color: #FFD700;">$${(item.totalMatchedAmount || 0).toFixed(2)}</span></p>
        <p><strong>${profitLabel}:</strong> <span style="color: ${resultColor}; font-weight: bold;">$${Math.abs(businessProfit).toFixed(2)}</span></p>
      </body>
    </html>
  `;
            import('expo-print').then(({ printAsync }) =>
              printAsync({ html: printContent })
            );
          }}
          style={styles.printButton}
        >
          <Text style={styles.printButtonText}>Print Shift Summary</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Shift History</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#FFD700" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={shiftData}
        keyExtractor={(item) => item.id}
        renderItem={renderShiftCard}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.noDataText}>No shift history found.</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#121212', // Very dark background
    paddingTop: 10,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    marginTop: 40,
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFD700', // Gold for header
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
  },
  card: {
    backgroundColor: '#1C1C1C', // Dark background for cards
    padding: 16,
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#333333', // Subtle border
  },
  cardHeader: {
    marginBottom: 12,
  },
  employeeName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#FFD700', // Gold for employee name
  },
  timeText: {
    fontSize: 14,
    color: '#CCCCCC', // Light grey for time text
  },
  divider: {
    height: 1,
    backgroundColor: '#444444', // Darker divider
    marginVertical: 12,
  },
  notesSection: {
    backgroundColor: '#2A2A2A', // Slightly lighter dark for notes section
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700', // Gold border for notes
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700', // Gold for notes title
    marginBottom: 5,
  },
  notesText: {
    fontSize: 14,
    color: '#AAAAAA', // Slightly lighter grey for notes text
    fontStyle: 'italic',
  },
  machineSection: {
    marginVertical: 5,
  },
  machineTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#555555', // Darker border
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700', // Gold for table headers
  },
  machineTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  machineTableCell: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF', // White for machine data
    paddingRight: 5
  },
  summaryContainer: {
    marginTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#CCCCCC', // Light grey for summary labels
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF', // Default white for summary values (overridden by specific colors)
  },

  viewSnapshotsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333', // Dark button background
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#FFD700', // Gold border
  },
  viewSnapshotsText: {
    marginLeft: 5,
    fontSize: 12,
    color: '#FFD700', // Gold text
    fontWeight: 'bold',
  },
  noSnapshotsText: {
    fontSize: 12,
    color: '#888888', // Darker grey for N/A
    fontStyle: 'italic',
  },
  printButton: {
    marginTop: 10,
    backgroundColor: '#FFD700', // Gold button
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  printButtonText: {
    color: '#000000', // Black text on gold button
    fontSize: 16,
    fontWeight: '600',
  },
  noDataText: {
    color: '#CCCCCC', // Light grey for no data text
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
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