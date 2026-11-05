import React from 'react';
import { createRoot } from 'react-dom/client';
import { CitizenWallet as ContextCitizenWallet, AppProvider, mountCitizenWallet as contextMountCitizenWallet } from './AppContext.jsx';

export const CitizenWallet = ContextCitizenWallet;
export const mountCitizenWallet = contextMountCitizenWallet;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCitizenWallet);
  } else {
    mountCitizenWallet();
  }
}

if (typeof window !== 'undefined') {
  window.CitizenWallet = CitizenWallet;
  window.mountCitizenWallet = mountCitizenWallet;
}

export default CitizenWallet;
