
import { SavedMap } from '../types';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy 
} from 'firebase/firestore';

const DB_NAME = 'SkiResortDB';
const STORE_NAME = 'maps';
const DB_VERSION = 1;

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCOSGsU7fH8vX4Q6hlWZvRkmscLVA4qdC0",
  authDomain: "skiresorttycoon-5b9de.firebaseapp.com",
  projectId: "skiresorttycoon-5b9de",
  storageBucket: "skiresorttycoon-5b9de.firebasestorage.app",
  messagingSenderId: "786932957496",
  appId: "1:786932957496:web:9a358a52b4189cfb4301cd",
  measurementId: "G-39VXQRBJG4"
};

// Initialize Firebase
let dbCloud: any = null;
try {
    const app = initializeApp(firebaseConfig);
    dbCloud = getFirestore(app);
    console.log("Firebase initialized successfully.");
} catch (e) {
    console.error("Error initializing Firebase:", e);
}

const CLOUD_COLLECTION = "ski_maps";

// --- IndexedDB (Local) Helper Functions ---

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

const saveMapToLocal = async (map: SavedMap): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(map);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadMapsFromLocal = async (): Promise<SavedMap[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as SavedMap[]);
    request.onerror = () => reject(request.error);
  });
};

const deleteMapFromLocal = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- Cloud Storage Helper Functions (Real Firebase) ---

const saveMapToCloud = async (map: SavedMap): Promise<void> => {
  if (!dbCloud) return;
  try {
    // Using setDoc with the map ID ensures we don't create duplicates if saved multiple times
    // and allows us to easily reference it later.
    await setDoc(doc(dbCloud, CLOUD_COLLECTION, map.id), map);
  } catch (error) {
    console.warn("Cloud storage save failed:", error);
    throw error;
  }
};

const loadMapsFromCloud = async (): Promise<SavedMap[]> => {
  if (!dbCloud) return [];
  try {
    const q = query(collection(dbCloud, CLOUD_COLLECTION), orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    const maps: SavedMap[] = [];
    querySnapshot.forEach((doc) => {
      maps.push(doc.data() as SavedMap);
    });
    return maps;
  } catch (error) {
    console.warn("Cloud storage load failed:", error);
    return [];
  }
};

const deleteMapFromCloud = async (id: string): Promise<void> => {
  if (!dbCloud) return;
  try {
    await deleteDoc(doc(dbCloud, CLOUD_COLLECTION, id));
  } catch (error) {
    console.warn("Cloud storage delete failed:", error);
  }
};

// --- Exported Hybrid Storage Service ---

export const saveMapToStorage = async (map: SavedMap): Promise<void> => {
  // 1. Save locally first to ensure immediate user access/offline capability
  await saveMapToLocal(map);

  // 2. Attempt to sync to cloud so others can access it
  try {
    await saveMapToCloud(map);
  } catch (e) {
    console.info("Map saved locally only (Cloud sync skipped).");
  }
};

export const loadMapsFromStorage = async (): Promise<SavedMap[]> => {
  // Load from both sources in parallel
  const [localMaps, cloudMaps] = await Promise.all([
    loadMapsFromLocal(),
    loadMapsFromCloud()
  ]);

  // Merge results using a Map to deduplicate by ID
  const mergedMaps = new Map<string, SavedMap>();

  // Cloud maps take precedence in case of updates, but local maps ensure speed
  // Add Cloud first
  cloudMaps.forEach(m => mergedMaps.set(m.id, m));
  // Add Local (if they don't exist yet, or to ensure offline availability)
  localMaps.forEach(m => {
      if (!mergedMaps.has(m.id)) {
          mergedMaps.set(m.id, m);
      }
  });

  // Return sorted by date (newest first)
  return Array.from(mergedMaps.values()).sort((a, b) => b.date - a.date);
};

export const deleteMapFromStorage = async (id: string): Promise<void> => {
  // Attempt to delete from both
  await Promise.all([
    deleteMapFromLocal(id),
    deleteMapFromCloud(id)
  ]);
};
