import React from 'react';
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

    // 3. Clear the form on success
    const form = submitBtn ? submitBtn.closest('form') : document.querySelector('form[onsubmit*="uploadReportToDB"]');
    if (form && typeof form.reset === 'function') {
      form.reset();
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

    // 4. Update user points (+50 PTS)
    if (window.updateUserProfilePointsInDB) {
      try {
        await window.updateUserProfilePointsInDB(50);
      } catch (ptsErr) {
        console.error("Error updating points in DB profile:", ptsErr);
      }
    } else if (window.addGreenPointsInContext) {
      window.addGreenPointsInContext(50);
    }

    // 5. Prepend new ticket card to "My Submitted Reports"
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

    // 6. Show green feedback banner
    if (typeof window.showCitizenBanner === 'function') {
      window.showCitizenBanner('Report Verified & Submitted! +50 Green Points Added');
    }

    return docRef;
  } catch (error) {
    // Error Handling: Wrap database call in try/catch and use standard console.error
    console.error("Failed to submit citizen report to Firestore:", error);
    if (typeof window.showCitizenBanner === 'function') {
      window.showCitizenBanner(`Submission failed: ${error.message || 'Error connecting to Firestore'}`);
    }
    throw error;
  } finally {
    // Re-enable button and restore original state
    if (submitBtn) {
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

// Global window exposure
if (typeof window !== 'undefined') {
  window.submitCitizenReport = submitCitizenReport;
  window.uploadReportToDB = submitCitizenReport;
  window.uploadReportToDBBackend = submitCitizenReport;
  window.CitizenWallet = ContextCitizenWallet;
  window.mountCitizenWallet = contextMountCitizenWallet;
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
