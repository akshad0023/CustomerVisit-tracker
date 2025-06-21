// firebaseConfig.ts (Compat version for Expo Go)

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBHvPtbdbyvJ1jVEh2nM1djCNg8C33gr8U",
  authDomain: "gameroomapp-754c6.firebaseapp.com",
  projectId: "gameroomapp-754c6",
  storageBucket: "gameroomapp-754c6.firebasestorage.app",
  messagingSenderId: "468335540597",
  appId: "1:468335540597:web:d2677d428590c12ef3bb3c",
  measurementId: "G-QZPH1ETR62"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

export { auth, db, firebase, storage };

