import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.jsx';
import 'katex/dist/katex.min.css';
import './styles.css';
import './sidebar.css';
import './editor.css';

createRoot(document.getElementById('root')).render(<App />);

registerSW({
  onOfflineReady() { window.dispatchEvent(new Event('leaf:offline-ready')); },
});
