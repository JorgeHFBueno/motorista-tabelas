import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDupc4TnykC_U_PQv8vZRG075oM4_3ujVI",
  authDomain: "app-motor-api.firebaseapp.com",
  databaseURL: "https://app-motor-api-default-rtdb.firebaseio.com",
  projectId: "app-motor-api",
  storageBucket: "app-motor-api.firebasestorage.app",
  messagingSenderId: "351178495955",
  appId: "1:351178495955:web:f0fcd281be3fd9757c0126",
  measurementId: "G-T88TRGNBTH"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(console.error);