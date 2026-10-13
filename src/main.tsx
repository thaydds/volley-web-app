import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

declare const UPDATE_SW: () => void;

registerSW({
  onNeedRefresh() {
    if (confirm('Nova versão disponível. Atualizar?')) {
      UPDATE_SW();
    }
  },
  onOfflineReady() {
    console.log('App pronto para uso offline');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
