import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

// Reverted to your ORIGINAL project configuration (sector-one-me)
const firebaseConfig = {
    apiKey: "AIzaSyC-Vvjj9WceA0G4NI_-iTs-U5sszezM8SY",
    authDomain: "sector-one-me.firebaseapp.com",
    projectId: "sector-one-me",
    storageBucket: "sector-one-me.firebasestorage.app",
    messagingSenderId: "155069202564",
    appId: "1:155069202564:web:1f4c9c82f46f746d7842d1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);

export default app;
