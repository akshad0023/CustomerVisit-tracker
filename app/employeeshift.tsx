// app/employeeShift.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db, storage } from '../firebaseConfig';

interface IconTextInputProps extends TextInputProps {
  iconName: keyof typeof Ionicons.glyphMap;
}
const IconTextInput: React.FC<IconTextInputProps> = ({ iconName, ...props }) => (
  <View style={styles.inputContainer}>
    <Ionicons name={iconName} size={22} color="#FFD700" style={styles.inputIcon} /> {/* Gold icon */}
    <TextInput style={styles.input} {...props} placeholderTextColor="#888" /> {/* Lighter placeholder text */}
  </View>
);

export default function EmployeeShift() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState('');
  const [machineData, setMachineData] = useState<{ [key: string]: { in: string; out: string; images: string[] } }>({});
  const [isShiftStarted, setIsShiftStarted] = useState(false);
  const [isShiftEnding, setIsShiftEnding] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [startTime, setStartTime] = useState<string | null>(null);
  const [newMachine, setNewMachine] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [shiftNotes, setShiftNotes] = useState('');

  // Function to handle taking a machine snapshot and uploading to Firebase Storage
  const handleTakeSnapshot = async (machineKey: string) => {
    // Only allow one snapshot per machine
    if (machineData[machineKey]?.images.length >= 1) {
      Alert.alert('Snapshot Exists', `Only one snapshot is allowed for Machine ${machineKey}.`);
      return;
    }

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is required to take a snapshot.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const filename = `machineSnapshots/${auth.currentUser?.uid}/${machineKey}_${Date.now()}.jpg`;
        const imageRef = ref(storage, filename);

        await uploadBytes(imageRef, blob);
        const downloadURL = await getDownloadURL(imageRef);

        setMachineData((prev) => {
          const updated = { ...prev };
          const current = updated[machineKey] || { in: '', out: '', images: [] };
          const newImages = [...(current.images || []), downloadURL];
          updated[machineKey] = {
            ...current,
            images: newImages,
          };

          const storageKey = getStorageKey();
          if (storageKey) {
            AsyncStorage.getItem(storageKey).then((savedShiftStr) => {
              const savedShift = savedShiftStr ? JSON.parse(savedShiftStr) : {};
              savedShift.machineData = updated;
              AsyncStorage.setItem(storageKey, JSON.stringify(savedShift));
            });
          }

          return updated;
        });
      } catch (err) {
        console.error('Image Upload Error:', err);
        Alert.alert('Upload Error', 'Failed to upload image. Please try again.');
      }
    }
  };

  // Function to get the unique storage key for the current user's ongoing shift
  const getStorageKey = () => {
    const user = auth.currentUser;
    return user ? `ongoingShift_${user.uid}` : null;
  };

  // Effect to listen for authentication state changes and set readiness
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsReady(true);
      } else {
        router.replace('/owner');
      }
    });
    return () => unsubscribe(); // Cleanup subscription
  }, [router]);

  // Effect to restore ongoing shift state from AsyncStorage on component mount
  useEffect(() => {
    if (!isReady) return;

    const restoreShiftState = async () => {
      const storageKey = getStorageKey();
      if (!storageKey) return;

      const savedShift = await AsyncStorage.getItem(storageKey);
      if (savedShift) {
        const parsed = JSON.parse(savedShift);
        setEmployeeName(parsed.employeeName);
        setShiftId(parsed.shiftId);
        setStartTime(parsed.startTime);
        setIsShiftStarted(true);
        setIsShiftEnding(parsed.isShiftEnding || false);

        const restoredMachineData = parsed.machineData || {};
        Object.keys(restoredMachineData).forEach(key => {
            // Ensure images array is always initialized and is an array
            if (!restoredMachineData[key].images || !Array.isArray(restoredMachineData[key].images)) {
                restoredMachineData[key].images = [];
            }
        });
        setMachineData(restoredMachineData);
        setShiftNotes(parsed.shiftNotes || '');
      }
    };
    restoreShiftState();
  }, [isReady]);

  // Function to add a new machine input field
  const addMachine = () => {
    if (!newMachine.trim()) return;
    const machineKey = newMachine.trim();
    if (machineData[machineKey]) {
      Alert.alert('Duplicate Machine', `Machine ${machineKey} has already been added.`);
      return;
    }
    setMachineData((prev) => {
        const updated = { ...prev, [machineKey]: { in: '', out: '', images: [] } };
        // Save to AsyncStorage immediately
        const storageKey = getStorageKey();
        if (storageKey) {
            AsyncStorage.mergeItem(storageKey, JSON.stringify({ machineData: updated }));
        }
        return updated;
    });
    setNewMachine('');
  };

  // Function to handle deleting a machine from the list
  const handleDeleteMachine = (machineToDelete: string) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to remove Machine ${machineToDelete}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const storageKey = getStorageKey();
            if (!storageKey) return;
            setMachineData((prev) => {
              const updatedData = { ...prev };
              delete updatedData[machineToDelete];
              AsyncStorage.mergeItem(storageKey, JSON.stringify({ machineData: updatedData }));
              return updatedData;
            });
          },
        },
      ]
    );
  };

  // Function to start a new shift
  const handleStartShift = async () => {
    if (!employeeName.trim()) {
      Alert.alert('Please enter employee name');
      return;
    }
    const storageKey = getStorageKey();
    if (!storageKey) {
        Alert.alert("Error", "Could not start shift. User not identified.");
        return;
    }

    const newShiftId = `${employeeName.trim().replace(/\s+/g, '_')}_${Date.now()}`;
    const newStartTime = new Date();
    setShiftId(newShiftId);
    setStartTime(newStartTime.toISOString());
    setIsShiftStarted(true);
    await AsyncStorage.setItem(storageKey, JSON.stringify({
      employeeName,
      shiftId: newShiftId,
      startTime: newStartTime.toISOString(),
      isShiftEnding: false,
      machineData: {},
      shiftNotes: ''
    }));
    Alert.alert('Shift Started', `Shift for ${employeeName} has begun.`);
  };

  // Function to transition to the "ending shift" state (inputting machine data)
  const handleEndShift = async () => {
    setIsShiftEnding(true);
    const storageKey = getStorageKey();
    if (!storageKey) return;
    const current = await AsyncStorage.getItem(storageKey);
    if (current) {
      const parsed = JSON.parse(current);
      parsed.isShiftEnding = true;
      await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
    }
  };

  // Function to handle changes in shift notes and save to AsyncStorage
  const handleNotesInput = (text: string) => {
    setShiftNotes(text);
    const storageKey = getStorageKey();
    if (!storageKey) return;
    AsyncStorage.mergeItem(storageKey, JSON.stringify({ shiftNotes: text }));
  };

  // Function to handle changes in machine 'in' or 'out' amounts and save to AsyncStorage
  const handleMachineInput = (machine: string, type: 'in' | 'out', value: string) => {
    const storageKey = getStorageKey();
    if (!storageKey) return;
    setMachineData((prev) => {
      const updated = { ...prev, [machine]: { ...prev[machine], [type]: value, images: prev[machine]?.images || [] } };
      AsyncStorage.mergeItem(storageKey, JSON.stringify({ machineData: updated }));
      return updated;
    });
  };

  // Function to discard the current ongoing shift
  const handleDiscardShift = () => {
    Alert.alert(
      "Discard Shift",
      "Are you sure you want to discard this entire shift? All entered data will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            const storageKey = getStorageKey();
            if (storageKey) {
              await AsyncStorage.removeItem(storageKey);
            }
            setIsShiftStarted(false);
            setIsShiftEnding(false);
            setEmployeeName('');
            setMachineData({});
            setShiftId('');
            setStartTime(null);
            setShiftNotes('');
          }
        }
      ]
    );
  };

  // Function to save the completed shift to Firestore and update bank balance
  const handleSaveShift = async () => {
    setIsSubmitting(true);
    try {
      const hasMachineInput = Object.values(machineData).some(
        ({ in: i, out: o }) => (i && parseFloat(i) > 0) || (o && parseFloat(o) > 0)
      );

      if (!hasMachineInput) {
        Alert.alert('Missing Data', 'Please enter amounts for at least one machine.');
        setIsSubmitting(false);
        return;
      }

      // !!! MODIFIED VALIDATION LOGIC: Robust snapshot check for images existence !!!
      const machinesMissingSnapshots = Object.entries(machineData).filter(([machine, data]) => {
        const hasIn = data?.in && parseFloat(data.in) > 0;
        const hasOut = data?.out && parseFloat(data.out) > 0;
        const hasImages = Array.isArray(data?.images) && data.images.length > 0;
        // Only require snapshots if 'in' or 'out' value is provided for that machine
        return (hasIn || hasOut) && !hasImages;
      });

      if (machinesMissingSnapshots.length > 0) {
        const missingMachineNames = machinesMissingSnapshots.map(([name]) => name).join(', ');
        Alert.alert('Snapshots Required', `Please upload at least one snapshot for the following machines with entered data: ${missingMachineNames}.`);
        setIsSubmitting(false);
        return;
      }
      // !!! END MODIFIED VALIDATION !!!


      const user = auth.currentUser;
      if (!user) { throw new Error('Owner not logged in. Please restart the app.'); }
      const ownerId = user.uid;
      const endTime = new Date();
      const shiftStartDate = startTime ? new Date(startTime) : null;

      let totalIn = 0, totalOut = 0;
      const machines: { [key: string]: { in: number, out: number, images: string[] } } = {};
      const allCollectedImageUrls: string[] = [];

      Object.entries(machineData).forEach(([machine, { in: inAmt, out: outAmt, images }]) => {
        const inNum = parseFloat(inAmt) || 0;
        const outNum = parseFloat(outAmt) || 0;
        machines[machine] = { in: inNum, out: outNum, images: images || [] };
        totalIn += inNum;
        totalOut += outNum;
        images?.forEach(url => {
          if (!allCollectedImageUrls.includes(url)) {
            allCollectedImageUrls.push(url);
          }
        });
      });

      const profitOrLoss = totalIn - totalOut;
      const carryForward = totalOut;

      let totalMatchedAmount = 0;
      const visitSnapshot = await getDocs(collection(db, `owners/${ownerId}/visitHistory`));
      visitSnapshot.forEach(doc => {
        const data = doc.data();
        const visitTime = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
        if (visitTime && shiftStartDate && visitTime >= shiftStartDate && visitTime <= endTime) {
          totalMatchedAmount += data.matchAmount || 0;
        }
      });

      const shiftNetImpactOnBank = profitOrLoss - totalMatchedAmount;

      const currentBankBalanceStr = await AsyncStorage.getItem('bankBalance');
      let currentBankBalance = parseFloat(currentBankBalanceStr || '0');

      currentBankBalance += shiftNetImpactOnBank;
      await AsyncStorage.setItem('bankBalance', currentBankBalance.toString());

      await setDoc(doc(db, `owners/${ownerId}/shifts`, shiftId), {
        employeeName,
        startTime,
        endTime: endTime.toISOString(),
        machines,
        totalIn,
        totalOut,
        profitOrLoss,
        carryForward,
        totalMatchedAmount,
        notes: shiftNotes.trim(),
        timestamp: Timestamp.now(),
        machineSnapshots: allCollectedImageUrls.map((url) => ({
          url,
          timestamp: Timestamp.now(),
        })),
      });

      const storageKey = getStorageKey();
      if (storageKey) await AsyncStorage.removeItem(storageKey);

      Alert.alert('Shift Saved!', 'The shift data has been successfully recorded and bank balance updated.');
      setIsShiftStarted(false);
      setIsShiftEnding(false);
      setEmployeeName('');
      setMachineData({});
      setShiftId('');
      setStartTime(null);
      setShiftNotes('');
    } catch (error: any) {
      Alert.alert('Error Saving Shift', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
        <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FFD700" /> {/* Gold loading indicator */}
        </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Shift Control</Text>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Ionicons name="home-outline" size={28} color="#FFD700" /> {/* Gold home icon */}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {!isShiftStarted ? (
          <>
            <Text style={styles.cardTitle}>Start New Shift</Text>
            <IconTextInput iconName="person-circle-outline" placeholder="Enter Employee Name" value={employeeName} onChangeText={setEmployeeName} />
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleStartShift}>
              <Ionicons name="play-circle-outline" size={24} color="#000" /> {/* Black icon on gold button */}
              <Text style={styles.buttonText}>Start Shift</Text>
            </TouchableOpacity>
          </>
        ) : !isShiftEnding ? (
          <>
            <Text style={styles.cardTitle}>Shift Active</Text>
            <View style={styles.activeShiftInfo}>
              <Ionicons name="time-outline" size={40} color="#FFD700" /> {/* Gold icon */}
              <View style={{marginLeft: 15}}>
                <Text style={styles.activeShiftText}>Employee: <Text style={styles.activeShiftValue}>{employeeName}</Text></Text>
                <Text style={styles.activeShiftText}>Started at: <Text style={styles.activeShiftValue}>{startTime ? new Date(startTime).toLocaleTimeString() : ''}</Text></Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.button, styles.warningButton]} onPress={handleEndShift}>
              <Ionicons name="stop-circle-outline" size={24} color="#000" /> {/* Black icon on gold button */}
              <Text style={styles.buttonText}>End & Finalize Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleDiscardShift}>
              <Ionicons name="trash-bin-outline" size={20} color="#FFF" /> {/* White icon on red button */}
              <Text style={styles.buttonText}>Discard Shift</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Finalize Shift for {employeeName}</Text>
            <Text style={styles.subHeader}>Enter Machine Data</Text>
            <View style={styles.addMachineRow}>
              {/* Adjusted flex for IconTextInput to prevent overflow */}
              <View style={{flex: 1}}>
                <IconTextInput iconName="add-circle-outline" placeholder="Machine #" value={newMachine} onChangeText={setNewMachine} onSubmitEditing={addMachine} keyboardType="number-pad" />
              </View>
              <TouchableOpacity onPress={addMachine} style={styles.addButton}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            {Object.keys(machineData).length > 0 && (
              <View style={styles.machineTable}>
                <View style={styles.machineTableHeader}>
                  <Text style={[styles.machineCell, styles.machineHeadertext]}>Machine</Text>
                  <Text style={[styles.machineCell, styles.machineHeadertext, styles.centerHeaderText]}>In ($)</Text>
                  <Text style={[styles.machineCell, styles.machineHeadertext, styles.centerHeaderText]}>Out ($)</Text>
                  <View style={[styles.machineCell, styles.headerSnapshotColumn]}>
                    <View>
                      <Text style={styles.machineHeadertextSmall}>Snap</Text>
                    </View>
                  </View>
                  <View style={styles.deleteButtonHeader} />
                </View>
                {Object.keys(machineData).sort((a,b) => parseInt(a) - parseInt(b)).map((machine) => (
                  <View key={machine} style={styles.machineRow}>
                    <Text style={[styles.machineCell, styles.machineLabel]}>{machine}</Text>
                    <TextInput
                      placeholder="0"
                      keyboardType="numeric"
                      style={[styles.machineCell, styles.machineInput]}
                      value={machineData[machine]?.in || ''}
                      onChangeText={(text) => handleMachineInput(machine, 'in', text)}
                      placeholderTextColor="#888" // Lighter placeholder
                    />
                    <TextInput
                      placeholder="0"
                      keyboardType="numeric"
                      style={[styles.machineCell, styles.machineInput]}
                      value={machineData[machine]?.out || ''}
                      onChangeText={(text) => handleMachineInput(machine, 'out', text)}
                      placeholderTextColor="#888" // Lighter placeholder
                    />

                    <View style={[styles.machineCell, styles.snapshotColumn]}>
                      <TouchableOpacity
                        style={styles.snapshotButton}
                        onPress={() => handleTakeSnapshot(machine)}
                      >
                        <Ionicons name="camera-outline" size={20} color="#000" /> {/* Black icon on gold button */}
                      </TouchableOpacity>
                      {machineData[machine]?.images.length > 0 && (
                        <Text style={styles.snapshotCount}>{machineData[machine].images.length}/1</Text>
                      )}
                    </View>

                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteMachine(machine)}>
                      <Ionicons name="trash-outline" size={22} color="#FF6347" /> {/* Red icon */}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.notesContainer}>
              <Text style={styles.subHeader}>Shift Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g., Machine 5 was reset at 3 PM..."
                multiline
                value={shiftNotes}
                onChangeText={handleNotesInput}
                placeholderTextColor="#888" // Lighter placeholder
              />
            </View>

            <TouchableOpacity style={[styles.button, styles.successButton]} onPress={handleSaveShift} disabled={isSubmitting}>
              {/* Corrected conditional rendering inside TouchableOpacity */}
              {isSubmitting ? (
                <ActivityIndicator color="#000"/>
              ) : (
                <View style={{flexDirection: 'row', alignItems: 'center'}}> {/* Added View to hold icon and text */}
                  <Ionicons name="save-outline" size={24} color="#000" /> {/* Black icon on gold button */}
                  <Text style={styles.buttonText}>Save Shift</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleDiscardShift}>
              <Ionicons name="close-circle-outline" size={22} color="#FFF" /> {/* White icon on red button */}
              <Text style={styles.buttonText}>Cancel & Discard</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#121212', // Very dark background
    flexGrow: 1
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212', // Very dark background
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginTop: 40
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFD700' // Gold for header
  },
  card: {
    backgroundColor: '#1C1C1C', // Dark background for cards
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: '#333333', // Subtle border
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFD700', // Gold for card title
    textAlign: 'center',
    marginBottom: 24
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A', // Darker background for input
    borderWidth: 1,
    borderColor: '#555555', // Darker border
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 15, // Added margin for spacing
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: '#FFFFFF' // White text input
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, // Slightly less opaque shadow
  },
  buttonText: {
    color: '#000', // Black text for primary/warning/success buttons
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10
  },
  primaryButton: {
    backgroundColor: '#FFD700' // Gold
  },
  warningButton: {
    backgroundColor: '#FFD700' // Gold for warning
  },
  successButton: {
    backgroundColor: '#4CAF50' // Green for success
  },
  dangerButton: {
    backgroundColor: '#FF6347', // Red for danger
  },
  activeShiftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A', // Darker background for active shift info
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD700', // Gold border
  },
  activeShiftText: {
    fontSize: 16,
    color: '#CCCCCC' // Light grey text
  },
  activeShiftValue: { // New style for the dynamic text
    fontWeight: 'bold',
    color: '#FFFFFF', // White for the value
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFD700', // Gold for sub-headers
    marginBottom: 15
  },
  addMachineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    // No flex: 1 on the row itself
  },
  // The IconTextInput now has a wrapper View with flex: 1
  addButton: {
    marginLeft: 10,
    backgroundColor: '#FFD700', // Gold button
    paddingHorizontal: 20,
    height: 55,
    justifyContent: 'center',
    borderRadius: 12,
    // Removed fixed width if it was here, allowing content to dictate size
  },
  addButtonText: {
    color: '#000', // Black text
    fontWeight: 'bold',
    fontSize: 16
  },
  machineTable: {
    borderWidth: 1,
    borderColor: '#444444', // Darker border
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20
  },
  machineTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A', // Darker background for table header
    borderBottomWidth: 1,
    borderBottomColor: '#555555' // Darker border
  },
  machineHeadertext: {
    fontWeight: 'bold',
    color: '#FFD700', // Gold for table header text
    padding: 12,
    flex: 1,
  },
  machineHeadertextSmall: {
    fontWeight: 'bold',
    color: '#FFD700', // Gold
    fontSize: 14
  },
  centerHeaderText: {
    textAlign: 'center'
  },

  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222222' // Even darker border for rows
  },
  machineCell: {
    padding: 12,
    fontSize: 16,
    flex: 1,
    color: '#FFFFFF' // White for machine data
  },
  machineLabel: {
    fontWeight: '500',
    color: '#CCCCCC' // Light grey for machine label
  },
  machineInput: {
    backgroundColor: '#1C1C1C', // Dark input background
    textAlign: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#333333', // Darker border
    color: '#FFFFFF', // White text input
  },
  deleteButton: {
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#333333', // Darker border
  },
  deleteButtonHeader: {
    padding: 12,
    width: 46,
  },
  notesContainer: {
    marginVertical: 20,
  },
  notesInput: {
    backgroundColor: '#2A2A2A', // Darker background for notes input
    borderWidth: 1,
    borderColor: '#555555', // Darker border
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    height: 100,
    color: '#FFFFFF', // White text input
  },

  headerSnapshotColumn: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#555555', // Darker border
    padding: 12,
  },
  snapshotColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 5,
    borderLeftWidth: 1,
    borderLeftColor: '#333333', // Darker border
    flex: 1.2,
  },
  snapshotButton: {
    backgroundColor: '#FFD700', // Gold button
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotCount: {
    fontSize: 12,
    color: '#CCCCCC', // Light grey text
    marginLeft: 5,
  },
});