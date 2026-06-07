import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './serviceWorkerRegistration';
import { initStorageGuard, startStorageWatcher } from './utils/storageGuard';

// ══════════════════════════════════════════════════════════════════
// 🛡️ الخطوة الأولى: تشغيل حارس التخزين قبل أي حاجة تانية
// هيسترجع بيانات الجهاز لو اتضاع، وهيحمي من Vercel redeployments
// ══════════════════════════════════════════════════════════════════
initStorageGuard().then(() => {
  // بعد ما الحارس يتأكد من البيانات، نشغل التطبيق
  const cleanup = startStorageWatcher();

  // تسجيل Service Worker
  registerServiceWorker();

  // تشغيل React
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // cleanup عند إغلاق الصفحة
  window.addEventListener('beforeunload', cleanup);

}).catch((err) => {
  // حتى لو الحارس فشل، التطبيق يشتغل عادي
  console.warn('[main] StorageGuard error (non-fatal):', err);

  registerServiceWorker();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
