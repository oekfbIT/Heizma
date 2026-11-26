/**
 * @file      main.tsx – Einstiegspunkt: React mounten, Provider (Auth, Core, Router) setzen
 * @layer     Web · App-Rahmen
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './core/auth';
import { CoreProvider } from './core/CoreProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CoreProvider>
          <App />
        </CoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
