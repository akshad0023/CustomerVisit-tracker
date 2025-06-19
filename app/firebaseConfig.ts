import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBHvPtbdbyvJ1jVEh2nM1djCNg8C33gr8U",
  authDomain: "gameroomapp-754c6.firebaseapp.com",
  projectId: "gameroomapp-754c6",
  storageBucket: "gameroomapp-754c6.appspot.com",
  messagingSenderId: "468335540597",
  appId: "1:468335540597:web:d2677d428590c12ef3bb3c",
  measurementId: "G-QZPH1ETR62"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, firebaseConfig, storage };
