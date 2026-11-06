import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import {
  CitizenWallet as ContextCitizenWallet,
  AppProvider,
  mountCitizenWallet as contextMountCitizenWallet,
} from './AppContext.jsx';

export const CitizenWallet = ContextCitizenWallet;
export const mountCitizenWallet = contextMountCitizenWallet;

/**
 * Submit Citizen Report to Firestore collection "citizen_reports"
 * Pushes: Nearest Bin, Issue Category, Additional Details, Timestamp
 * Shows loading spinner on button while saving, clears form on success.
 */
export async function submitCitizenReport(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  const submitBtn = document.getElementById('btnSubmitCitizenReport');
  const originalHtml = submitBtn
    ? submitBtn.innerHTML
    : '<i class="fa-solid fa-paper-plane"></i><span>Submit Citizen Report</span>';

  // 1. Show loading spinner on button while saving
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> <span>Saving to Firestore...</span>';
  }

  try {
    if (!db) {
      throw new Error("Firestore db instance is not initialized.");
    }

    // 2. Extract form data
    const binSelect = document.getElementById('citizenBinSelect');
    const nearestBin = binSelect
      ? (binSelect.options[binSelect.selectedIndex]?.text || binSelect.value || 'General Bin')
      : 'General Bin';

    const issueSelect = document.getElementById('citizenIssueType');
    const issueCategory = issueSelect ? issueSelect.value : 'Overflowing Waste';

    const notesTextarea = document.getElementById('citizenNotes');
    const additionalDetails = notesTextarea ? notesTextarea.value.trim() : '';

    const timestamp = new Date().toISOString();

    const reportPayload = {
      nearestBin,
      issueCategory,
      additionalDetails,
      timestamp,
      title: `${issueCategory} at ${nearestBin}`,
      status: 'Pending',
      priority: issueCategory === 'Overflowing Waste' ? 'High Priority' : 'Moderate Risk',
      reportedBy: window.authState?.currentUser?.displayName || 'Alex Johnson',
      createdAt: timestamp,
    };

    // Push data to Firestore collection named citizen_reports
    const reportsCollection = collection(db, 'citizen_reports');
    const docRef = await addDoc(reportsCollection, reportPayload);
    console.info("Report successfully stored in Firestore citizen_reports:", docRef.id);

    // If the try succeeds: set the loading state to false, clear the form, and show a success message
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }

    // Clear the form on success
    const form = submitBtn ? submitBtn.closest('form') : document.querySelector('form[onsubmit*="uploadReportToDB"]');
    if (form && typeof form.reset === 'function') {
      form.reset();
    }
    if (notesTextarea) {
      notesTextarea.value = '';
    }

    // Clear photo upload preview if present
    const thumb = document.getElementById('uploadThumbnail');
    const icon = document.getElementById('uploadIcon');
    const ut = document.getElementById('uploadText');
    if (thumb) {
      thumb.src = '';
      thumb.classList.add('hidden');
    }
    if (icon) icon.classList.remove('hidden');
    if (ut) ut.textContent = 'Click to select photo or capture';

    // Show a success message
    if (typeof window.showCitizenBanner === 'function') {
      window.showCitizenBanner('Report Verified & Submitted! +50 Green Points Added');
    }

    // Update user points (+50 PTS)
    if (window.updateUserProfilePointsInDB) {
      try {
        await window.updateUserProfilePointsInDB(50);
      } catch (ptsErr) {
        console.error("Error updating points in DB profile:", ptsErr);
      }
    } else if (window.addGreenPointsInContext) {
      window.addGreenPointsInContext(50);
    }

    // Prepend new ticket card to "My Submitted Reports"
    const myReportsContainer = document.getElementById('citizenMyReports');
    if (myReportsContainer) {
      const ticketNum = Math.floor(100 + Math.random() * 900);
      const card = document.createElement('div');
      card.className =
        'p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 animate-in fade-in duration-300';
      card.innerHTML = `
        <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold text-slate-900 dark:text-white">Ticket #${ticketNum}</span>
                <span class="text-xs text-slate-600 dark:text-slate-400">${issueCategory} at ${nearestBin}</span>
            </div>
            <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
                <i class="fa-regular fa-calendar-check text-[10px]"></i> Just now
            </div>
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex-shrink-0">
            Pending
        </span>
      `;
      myReportsContainer.prepend(card);
    }

    // Sync to AppContext if available
    if (window.appStore) {
      window.appStore.actions.addCitizenReport({
        ticketNum: String(Math.floor(105 + Math.random() * 20)),
        title: `${issueCategory} at ${nearestBin}`,
        issue: issueCategory,
        locationName: nearestBin,
        notes: additionalDetails,
        reportedBy: window.authState?.currentUser?.displayName || 'Citizen Reporter'
      });
    }

    return docRef;
  } catch (error) {
    // If it fails in the catch block:
    // 1. Set the loading state to false so the button doesn't spin infinitely
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }

    // 2. Print console.error(error)
    console.error(error);

    // 3. Show a browser alert("Failed to save: " + error.message)
    alert("Failed to save: " + error.message);

    if (typeof window.showCitizenBanner === 'function') {
      window.showCitizenBanner(`Failed to save: ${error.message || 'Error connecting to Firestore'}`);
    }
  } finally {
    // Re-enable button and restore original state so button doesn't spin infinitely
    if (submitBtn && submitBtn.disabled) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

/**
 * Initialize listeners for Citizen Hub
 */
export function initCitizenHub() {
  mountCitizenWallet();

  const submitBtn = document.getElementById('btnSubmitCitizenReport');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      const form = submitBtn.closest('form');
      if (!form) {
        submitCitizenReport(e);
      }
    });
  }

  const form = document.querySelector('form[onsubmit*="uploadReportToDB"]') || submitBtn?.closest('form');
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      return submitCitizenReport(e);
    };
  }
}

/**
 * Citizen Hub Report Form React Component
 * Manages form state, loading indicator, and Firebase addDoc submission with try/catch error handling.
 */
export function CitizenReportForm({ onReportSubmitted }) {
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [nearestBin, setNearestBin] = useState('Pune City Center');
  const [issueCategory, setIssueCategory] = useState('Overflowing Waste');
  const [additionalDetails, setAdditionalDetails] = useState('');

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setLoading(true);
    setSuccessMessage('');

    try {
      if (!db) {
        throw new Error("Firestore db instance is not initialized.");
      }

      const timestamp = new Date().toISOString();
      const reportPayload = {
        nearestBin,
        issueCategory,
        additionalDetails,
        timestamp,
        title: `${issueCategory} at ${nearestBin}`,
        status: 'Pending',
        priority: issueCategory === 'Overflowing Waste' ? 'High Priority' : 'Moderate Risk',
        reportedBy: window.authState?.currentUser?.displayName || 'Alex Johnson',
        createdAt: timestamp,
      };

      const reportsCollection = collection(db, 'citizen_reports');
      const docRef = await addDoc(reportsCollection, reportPayload);
      console.info("Report successfully stored in Firestore citizen_reports:", docRef.id);

      // If the try succeeds, set the loading state to false, clear the form, and show a success message
      setLoading(false);
      setNearestBin('Pune City Center');
      setIssueCategory('Overflowing Waste');
      setAdditionalDetails('');
      setSuccessMessage('Report Verified & Submitted! +50 Green Points Added');

      if (typeof window.showCitizenBanner === 'function') {
        window.showCitizenBanner('Report Verified & Submitted! +50 Green Points Added');
      }

      if (typeof onReportSubmitted === 'function') {
        onReportSubmitted(docRef.id);
      }

      return docRef;
    } catch (error) {
      // If it fails in the catch block, set the loading state to false, print console.error(error), and show a browser alert("Failed to save: " + error.message)
      setLoading(false);
      console.error(error);
      alert("Failed to save: " + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {successMessage && (
        <div className="p-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
          <i className="fa-solid fa-circle-check text-emerald-600"></i>
          <span>{successMessage}</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          Select Nearest Bin
        </label>
        <select
          value={nearestBin}
          onChange={(e) => setNearestBin(e.target.value)}
          required
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="Pune City Center">B01 - Pune City Center</option>
          <option value="Karvenagar / Cummins">B02 - Karvenagar / Cummins</option>
          <option value="Hinjewadi IT Park">B03 - Hinjewadi IT Park</option>
          <option value="Hadapsar Terminal">B04 - Hadapsar Terminal</option>
          <option value="Kothrud Stand">B05 - Kothrud Stand</option>
          <option value="FC Road Night Zone">B06 - FC Road Night Zone</option>
          <option value="Prabhat Road Colony">B07 - Prabhat Road Colony</option>
          <option value="Westend Mall">B09 - Westend Mall</option>
          <option value="Pune University Road">B12 - Pune University Road</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          Issue Category
        </label>
        <select
          value={issueCategory}
          onChange={(e) => setIssueCategory(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="Overflowing Waste">Overflowing Waste</option>
          <option value="Damaged Bin Structure">Damaged Bin Structure</option>
          <option value="Hazardous / Medical Waste">Hazardous / Medical Waste</option>
          <option value="Foul Odor / Pungent Spill">Foul Odor / Pungent Spill</option>
          <option value="Irregular Pickup Schedule">Irregular Pickup Schedule</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          Additional Details
        </label>
        <textarea
          value={additionalDetails}
          onChange={(e) => setAdditionalDetails(e.target.value)}
          rows="2"
          placeholder="e.g. Bin overflowing near Market Gate 2..."
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <i className="fa-solid fa-spinner fa-spin mr-1.5"></i>
            <span>Saving to Firestore...</span>
          </>
        ) : (
          <>
            <i className="fa-solid fa-paper-plane"></i>
            <span>Submit Citizen Report</span>
          </>
        )}
      </button>
    </form>
  );
}

export const CitizenHubForm = CitizenReportForm;

export function mountCitizenForm(containerId = 'citizenFormRoot') {
  const rootEl = document.getElementById(containerId);
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <CitizenReportForm />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

// Global window exposure
if (typeof window !== 'undefined') {
  window.submitCitizenReport = submitCitizenReport;
  window.uploadReportToDB = submitCitizenReport;
  window.uploadReportToDBBackend = submitCitizenReport;
  window.CitizenWallet = ContextCitizenWallet;
  window.mountCitizenWallet = contextMountCitizenWallet;
  window.CitizenReportForm = CitizenReportForm;
  window.CitizenHubForm = CitizenReportForm;
  window.mountCitizenForm = mountCitizenForm;
  window.initCitizenHub = initCitizenHub;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCitizenHub);
  } else {
    initCitizenHub();
  }
}

export default CitizenWallet;
