import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, update, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCaxAIeHUhaq3JDrzK5RRZjhU9QbAyNXcI",
  authDomain: "guestguard-319c8.firebaseapp.com",
  databaseURL: "https://guestguard-319c8-default-rtdb.firebaseio.com/",
  projectId: "guestguard-319c8",
  storageBucket: "guestguard-319c8.firebasestorage.app",
  messagingSenderId: "299437411901",
  appId: "1:299437411901:web:eb15708b8291c750556454"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, set, onValue, push, update, get };
