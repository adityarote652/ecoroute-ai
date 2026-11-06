import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── Firebase Configuration ───────────────────────────────────────────────────
// All values are injected at build-time by Vite from the .env file.
// NEVER hardcode credentials here — the .env file is gitignored.
// See .env.example for the list of required variable names.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoFallbackKey1234567890123456789',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ecoroute-ai.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ecoroute-ai',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ecoroute-ai.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-ABCDEF1234'
};

// ─── Initialize Firebase (singleton-safe) ─────────────────────────────────────
let appInstance = null;
try {
  appInstance = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.warn("Firebase initializeApp fallback:", e);
}

// ─── Firestore Database ────────────────────────────────────────────────────────
let dbInstance = null;
try {
  if (appInstance) dbInstance = getFirestore(appInstance);
} catch (e) {
  console.warn("Firestore initialization fallback:", e);
}

// ─── Firebase Auth ─────────────────────────────────────────────────────────────
let authInstance = null;
try {
  if (appInstance) authInstance = getAuth(appInstance);
} catch (e) {
  console.warn("Firebase auth initialization fallback:", e);
}

export const app = appInstance;
export const db = dbInstance;
export const auth = authInstance;

// Global Auth State Context
export const authState = {
  currentUser: null,
  isAuthenticated: false,
  subscribers: [],
  
  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.currentUser);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  },

  setUser(user) {
    this.currentUser = user;
    this.isAuthenticated = !!user;
    window.currentUser = user;
    this.subscribers.forEach(cb => cb(this.currentUser));
    updateAuthNavbarUI(user);
  },

  logout() {
    this.setUser(null);
  }
};

function updateAuthNavbarUI(user) {
  const authContainer = document.getElementById('authContainer');
  if (!authContainer) return;

  if (!user) {
    authContainer.innerHTML = `
      <button onclick="openLoginModal()" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 transition-all">
          <i class="fa-solid fa-right-to-bracket"></i>
          <span>Login / Portal</span>
      </button>`;
    return;
  }

  const role = (user.role || 'CITIZEN').toUpperCase();
  const roleConfig = {
    ADMIN: { label: 'ADMIN', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
    MUNICIPAL: { label: 'MUNICIPAL', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
    CITIZEN: { label: 'CITIZEN', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
  };
  const badgeConfig = roleConfig[role] || { label: role, cls: 'bg-slate-100 text-slate-700 border-slate-200' };

  authContainer.innerHTML = `
    <div class="flex items-center gap-2 animate-in fade-in duration-300">
        <span class="px-2.5 py-1 rounded-full text-xs font-bold border ${badgeConfig.cls} tracking-wider font-mono">${badgeConfig.label}</span>
        <button onclick="logout()" class="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg text-xs" title="Sign Out (${user.displayName || role})">
            <i class="fa-solid fa-right-from-bracket"></i>
        </button>
    </div>`;
}

// 1.5-second async simulated Promise for authentication
export async function authenticateUser(role, email) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const normalizedRole = (role || 'CITIZEN').toUpperCase();
      const user = {
        uid: 'user_' + Math.random().toString(36).substring(2, 9),
        email: email || `${normalizedRole.toLowerCase()}@ecoroute.gov`,
        displayName: normalizedRole === 'ADMIN' ? 'Admin Officer' : normalizedRole === 'MUNICIPAL' ? 'Ward Commissioner' : 'Alex Johnson',
        role: normalizedRole
      };
      authState.setUser(user);
      resolve(user);
    }, 1500);
  });
}

// Update citizen profile points in DB
export async function updateUserProfilePointsInDB(pointsToAdd = 50) {
  const user = authState.currentUser;
  const userId = user?.uid || 'user_guest_citizen';
  const currentPts = (typeof window.citizenPoints === 'number') ? window.citizenPoints : (window.state?.greenPoints || 450);
  const updatedPts = currentPts + pointsToAdd;

  try {
    if (db && user) {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, { 
        points: updatedPts, 
        lastReportAt: new Date().toISOString(),
        email: user.email || 'citizen@ecoroute.gov'
      }, { merge: true });
    }
  } catch (e) {
    console.info("Simulated DB user points update:", e);
  }

  // Synchronize React state, global state, and DOM
  if (window.setGreenPoints) {
    window.setGreenPoints(updatedPts);
  }
  window.citizenPoints = updatedPts;
  if (window.state) {
    window.state.greenPoints = updatedPts;
  }
  const el = document.getElementById('citizenPoints');
  if (el) el.textContent = `${updatedPts} PTS`;
  window.dispatchEvent(new CustomEvent('citizen:set-points', { detail: { amount: updatedPts } }));

  return updatedPts;
}

// Async function uploadReportToDB()
// Pushes report to Firestore collection "citizen_reports" with error handling
export async function uploadReportToDB(reportData = {}) {
  const collectionName = 'citizen_reports';
  const timestamp = reportData.timestamp || new Date().toISOString();
  
  const payload = {
    nearestBin: reportData.nearestBin || reportData.locationName || reportData.location || 'Shivajinagar Market',
    issueCategory: reportData.issueCategory || reportData.issue || 'Overflowing Waste',
    additionalDetails: reportData.additionalDetails || reportData.notes || '',
    timestamp,
    title: reportData.title || `${reportData.issueCategory || reportData.issue || 'Overflowing Waste'} at ${reportData.nearestBin || reportData.locationName || 'Ward Station'}`,
    status: reportData.status || 'Pending',
    priority: reportData.priority || (reportData.issueCategory === 'Overflowing Waste' ? 'High Priority' : 'Moderate Risk'),
    reportedBy: reportData.reportedBy || window.authState?.currentUser?.displayName || 'Citizen Reporter',
    rewardPoints: 50,
    createdAt: timestamp,
    ...reportData,
  };

  try {
    const collRef = collection(db, collectionName);
    const docRef = await addDoc(collRef, payload);
    console.info("Report created in Firestore citizen_reports with ID:", docRef.id);
    
    // Add +50 points to user's DB profile
    await updateUserProfilePointsInDB(50);

    return {
      id: docRef.id,
      ...payload
    };
  } catch (err) {
    console.error(err);
    alert("Failed to save: " + err.message);
    throw err;
  }
}

// Backward-compatible alias
export const submitReportToBackend = uploadReportToDB;

// Asynchronously fetch bin coordinates and fill-levels from DB (with loading delay simulation)
export async function fetchBinsFromDB() {
  try {
    if (db) {
      const binsColl = collection(db, 'bins');
      const fetchPromise = getDocs(binsColl);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
      const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
      if (snapshot && !snapshot.empty) {
        const binsList = [];
        snapshot.forEach(docSnap => {
          binsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        return binsList;
      }
    }
  } catch (e) {
    // fallback to simulated DB fetch
  }

  // 1.2-second async database fetch simulation with rich bin metadata
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        // 5 Original Map Bins
        { id: '1',   code: 'B01', name: 'Pune City Center',       pos: [18.5204, 73.8567], lat: 18.5204, lng: 73.8567, fillPct: 88, baseFill: 88, status: 'Critical', urgency: 'high', capacity: '1000L', capacityL: 1000, wasteType: 'Organic', areaType: 'Commercial', lastPickup: 'Today, 06:30 AM', priorityScore: 92 },
        { id: '2',   code: 'B02', name: 'Karvenagar / Cummins',    pos: [18.4893, 73.8202], lat: 18.4893, lng: 73.8202, fillPct: 62, baseFill: 62, status: 'Warning',  urgency: 'medium', capacity: '750L',  capacityL: 750,  wasteType: 'Mixed',   areaType: 'Residential', lastPickup: 'Yesterday, 05:00 PM', priorityScore: 68 },
        { id: '3',   code: 'B03', name: 'Hinjewadi IT Park',       pos: [18.5913, 73.7389], lat: 18.5913, lng: 73.7389, fillPct: 35, baseFill: 35, status: 'Normal',   urgency: 'low',    capacity: '1500L', capacityL: 1500, wasteType: 'Recyclable', areaType: 'Commercial', lastPickup: 'Today, 07:15 AM', priorityScore: 38 },
        { id: '4',   code: 'B04', name: 'Hadapsar Terminal',       pos: [18.4966, 73.9416], lat: 18.4966, lng: 73.9416, fillPct: 92, baseFill: 92, status: 'Critical', urgency: 'high', capacity: '1500L', capacityL: 1500, wasteType: 'Mixed',   areaType: 'Industrial', lastPickup: 'Yesterday, 04:30 PM', priorityScore: 95 },
        { id: '5',   code: 'B05', name: 'Kothrud Stand',           pos: [18.5074, 73.8151], lat: 18.5074, lng: 73.8151, fillPct: 68, baseFill: 68, status: 'Warning',  urgency: 'medium', capacity: '800L',  capacityL: 800,  wasteType: 'Organic', areaType: 'Transit',    lastPickup: '2 days ago', priorityScore: 72 },
        // 4 Missing Bins with Accurate Pune Coordinates
        { id: 'B06', code: 'B06', name: 'FC Road Night Zone',     pos: [18.5262, 73.8441], lat: 18.5262, lng: 73.8441, fillPct: 97, baseFill: 97, status: 'Critical', urgency: 'high', capacity: '1000L', capacityL: 1000, wasteType: 'Organic', areaType: 'Commercial', lastPickup: 'Yesterday, 10:00 PM', priorityScore: 98 },
        { id: 'B07', code: 'B07', name: 'Prabhat Road Colony',    pos: [18.5135, 73.8315], lat: 18.5135, lng: 73.8315, fillPct: 86, baseFill: 86, status: 'Critical', urgency: 'high', capacity: '1200L', capacityL: 1200, wasteType: 'Organic', areaType: 'Residential', lastPickup: 'Yesterday, 08:30 PM', priorityScore: 89 },
        { id: 'B09', code: 'B09', name: 'Westend Mall',           pos: [18.5623, 73.8078], lat: 18.5623, lng: 73.8078, fillPct: 91, baseFill: 91, status: 'Critical', urgency: 'high', capacity: '1500L', capacityL: 1500, wasteType: 'Dry',     areaType: 'Commercial', lastPickup: 'Yesterday, 06:15 PM', priorityScore: 93 },
        { id: 'B12', code: 'B12', name: 'Pune University Road',   pos: [18.5367, 73.8242], lat: 18.5367, lng: 73.8242, fillPct: 84, baseFill: 84, status: 'Critical', urgency: 'high', capacity: '1000L', capacityL: 1000, wasteType: 'Mixed',   areaType: 'Commercial', lastPickup: 'Yesterday, 09:00 PM', priorityScore: 88 },
      ]);
    }, 1200);
  });
}

// 1.5-second async simulated Promise for route calculation
export async function generateOptimalRouteBackend(wardId = 'Ward 4') {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ward: wardId,
        fixedDistanceKm: 38.4,
        optimizedDistanceKm: 18.2,
        savingsPercent: 52.6,
        co2SavedKg: 20.6,
        status: 'DISPATCHED',
        dispatchedAt: new Date().toISOString()
      });
    }, 1500);
  });
}

// Updates bin status in Firestore database with try/catch error handling
export async function updateBinStatusInDB(binId, updateData = {}) {
  try {
    if (db) {
      const binRef = doc(db, 'bins', String(binId));
      await setDoc(binRef, {
        ...updateData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.info(`Bin ${binId} successfully updated in Firestore:`, updateData);
    }
  } catch (err) {
    console.error(`Error updating bin ${binId} status in Firestore:`, err);
  }
}

// Expose globals for window bindings
window.firebaseApp = app;
window.firestoreDb = db;
window.firebaseAuth = auth;
window.authState = authState;
window.authenticateUser = authenticateUser;
window.submitReportToBackend = uploadReportToDB;
window.uploadReportToDBBackend = uploadReportToDB;
window.uploadReportToDB = uploadReportToDB;
window.updateUserProfilePointsInDB = updateUserProfilePointsInDB;
window.fetchBinsFromDB = fetchBinsFromDB;
window.generateOptimalRouteBackend = generateOptimalRouteBackend;
window.updateAuthNavbarUI = updateAuthNavbarUI;
window.updateBinStatusInDB = updateBinStatusInDB;


