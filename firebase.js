import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// Standard Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyMockApiKeyForEcoRouteWasteAI12345",
  authDomain: "ecoroute-ai.firebaseapp.com",
  projectId: "ecoroute-ai",
  storageBucket: "ecoroute-ai.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// Initialize Firebase App instance
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db = null;
let auth = null;

try {
  db = getFirestore(app);
} catch (e) {
  console.info("Firestore initialized with local simulated service layer.");
}

try {
  auth = getAuth(app);
} catch (e) {
  console.info("Firebase Auth initialized with simulated service layer.");
}

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
// Pushes report to Firestore collection "citizen_reports" (or simulates with 2-second setTimeout)
// and updates the user's DB profile with +50 points
export async function uploadReportToDB(reportData = {}) {
  const collectionName = 'citizen_reports';
  const payload = {
    ...reportData,
    status: 'Under Verification',
    rewardPoints: 50,
    createdAt: new Date().toISOString()
  };

  let reportId = 'REP-' + Date.now().toString(36).toUpperCase();

  try {
    if (db) {
      const collRef = collection(db, collectionName);
      // Attempt real Firestore insert with timeout fallback to ensure 2s smooth feedback
      const savePromise = addDoc(collRef, payload);
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ id: reportId, simulated: true }), 2000));
      const res = await Promise.race([savePromise, timeoutPromise]);
      if (res && res.id) reportId = res.id;
    } else {
      // 2-second simulated delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.info("Firestore live push fallback to simulated 2s delay:", err);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Add +50 points to user's DB profile
  await updateUserProfilePointsInDB(50);

  return {
    id: reportId,
    ...payload
  };
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

  // 1.5-second async database fetch simulation
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 1, name: 'Pune City Center',          pos: [18.5204, 73.8567], fillPct: 88 },
        { id: 2, name: 'Karvenagar / Cummins',       pos: [18.4893, 73.8202], fillPct: 62 },
        { id: 3, name: 'Hinjewadi IT Park',          pos: [18.5913, 73.7389], fillPct: 35 },
        { id: 4, name: 'Hadapsar',                   pos: [18.4966, 73.9416], fillPct: 92 },
        { id: 5, name: 'Kothrud',                    pos: [18.5074, 73.8151], fillPct: 68 },
      ]);
    }, 1500);
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

export { app, db, auth };
