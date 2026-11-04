import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@beachsports/tokens/css/tokens.css';
import '@beachsports/components/styles.css';
import './index.css';

registerSW({
  onOfflineReady() {
    console.log('App pronto para uso offline');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
