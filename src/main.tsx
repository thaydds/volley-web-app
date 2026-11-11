import { appUpdates } from './updates/appUpdates';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@beachsports/tokens/css/tokens.css';
import '@beachsports/components/styles.css';
import './index.css';

appUpdates.start();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
