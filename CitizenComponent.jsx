import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

export function CitizenWallet() {
  const [pts, setPts] = useState(450);

  useEffect(() => {
    window.setGreenPoints = setPts;
    window.citizenPoints = pts;
    if (window.state) window.state.greenPoints = pts;
    const el = document.getElementById('citizenPoints');
    if (el) el.textContent = `${pts} PTS`;
  }, [pts]);

  useEffect(() => {
    const handleAdd = (e) => {
      const amount = (e && e.detail && typeof e.detail.amount === 'number') ? e.detail.amount : 50;
      setPts((prev) => prev + amount);
    };
    const handleDeduct = (e) => {
      const amount = (e && e.detail && typeof e.detail.amount === 'number') ? e.detail.amount : 0;
      setPts((prev) => Math.max(0, prev - amount));
    };
    const handleSet = (e) => {
      if (e && e.detail && typeof e.detail.amount === 'number') {
        setPts(e.detail.amount);
      }
    };

    window.addEventListener('citizen:add-points', handleAdd);
    window.addEventListener('citizen:deduct-points', handleDeduct);
    window.addEventListener('citizen:set-points', handleSet);

    return () => {
      window.removeEventListener('citizen:add-points', handleAdd);
      window.removeEventListener('citizen:deduct-points', handleDeduct);
      window.removeEventListener('citizen:set-points', handleSet);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 rounded-2xl shadow-md">
      <i className="fa-solid fa-coins text-amber-300 text-2xl"></i>
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wider opacity-90">Green Points Wallet</div>
        <div className="text-2xl font-extrabold font-mono" id="citizenPoints">{pts} PTS</div>
      </div>
    </div>
  );
}

export function mountCitizenWallet() {
  const rootEl = document.getElementById('citizenWalletRoot');
  if (rootEl) {
    if (!rootEl._reactRoot) {
      const root = createRoot(rootEl);
      root.render(<CitizenWallet />);
      rootEl._reactRoot = root;
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCitizenWallet);
  } else {
    mountCitizenWallet();
  }
}

window.CitizenWallet = CitizenWallet;
window.mountCitizenWallet = mountCitizenWallet;
