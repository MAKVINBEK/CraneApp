import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { LanguageProvider } from './components/locales/LanguageContext.jsx';

// Global Scripts
import '../scripts/apple-emoji.js';
import './configs/i18n.js';

// Styles
import './styles/tailwind.css';

createRoot(document.getElementById('appRoot')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
