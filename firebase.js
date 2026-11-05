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

// 1.5-second async simulated Promise for citizen reports (Firestore backend simulation)
export async function submitReportToBackend(reportData) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: 'REP-' + Date.now().toString(36).toUpperCase(),
        ...reportData,
        status: 'Under Verification',
        createdAt: new Date().toISOString()
      });
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
window.submitReportToBackend = submitReportToBackend;
window.generateOptimalRouteBackend = generateOptimalRouteBackend;
window.updateAuthNavbarUI = updateAuthNavbarUI;

export { app, db, auth };
