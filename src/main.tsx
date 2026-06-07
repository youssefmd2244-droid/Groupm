/**
 * main.tsx — Entry Point
 * ══════════════════════════════════════════════════════════
 * ✅ لا top-level await
 * ✅ لا import conflicts
 * ✅ Bridge يشتغل قبل React مباشرة
 * ══════════════════════════════════════════════════════════
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './serviceWorkerRegistration';
import { Bridge } from './utils/appBridge';
import { initStorageGuard } from './utils/storageGuard';

// ── 1. تهيئة حارس التخزين (sync — قبل React) ──────────────
initStorageGuard();

// ── 2. تهيئة الجسر (sync — يربط كل الملفات) ───────────────
Bridge.init();

// ── 3. تشغيل React ──────────────────────────────────────────
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// ── 4. Service Worker ────────────────────────────────────────
registerServiceWorker();
