/**
 * storageGuard.ts — نسخة مصلحة
 * ══════════════════════════════════════════════════════════════════
 * ✅ لا top-level await
 * ✅ كل الدوال sync أو تعمل في الخلفية
 * ✅ متوافقة مع TypeScript strict mode
 * ══════════════════════════════════════════════════════════════════
 */

const PROTECTED_KEYS = [
  'group_m_device_primary',
  'group_m_device_bk1',
  'group_m_device_bk2',
  'group_m_devices_list',
  'gh_token_primary',
  'gh_token_backup_1',
  'gh_token_backup_2',
  'gh_owner', 'gh_repo', 'gh_branch', 'gh_data_path', 'gh_last_sha',
  'group_m_config', 'group_m_users', 'group_m_installations',
];

// ── Prefix للـ sessionStorage ─────────────────────────────────────
const SS_PREFIX = '__grd__';

// ── IDB ──────────────────────────────────────────────────────────
function idbSet(key: string, value: string): void {
  try {
    const req = indexedDB.open('GroupM_Guard', 1);
    req.onupgradeneeded = (e: Event) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
    req.onsuccess = (e: Event) => {
      try {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction('store', 'readwrite');
        tx.objectStore('store').put(value, key);
      } catch (_) {}
    };
  } catch (_) {}
}

function idbGetAsync(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('GroupM_Guard', 1);
      req.onupgradeneeded = (e: Event) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };
      req.onsuccess = (e: Event) => {
        try {
          const db = (e.target as IDBOpenDBRequest).result;
          const tx = db.transaction('store', 'readonly');
          const getReq = tx.objectStore('store').get(key);
          getReq.onsuccess = () => resolve(getReq.result ?? null);
          getReq.onerror   = () => resolve(null);
        } catch (_) { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

// ══════════════════════════════════════════════════════════════════
// الدوال المُصدَّرة
// ══════════════════════════════════════════════════════════════════

/**
 * initStorageGuard — يشتغل عند بدء التطبيق
 * sync بالكامل (بدون await) لمنع مشاكل TypeScript
 */
export function initStorageGuard(): void {
  try {
    // تحقق إن localStorage شغال
    localStorage.setItem('__guard_test__', '1');
    if (localStorage.getItem('__guard_test__') !== '1') return;
    localStorage.removeItem('__guard_test__');

    // استرجاع sync من sessionStorage
    PROTECTED_KEYS.forEach(key => {
      try {
        const lsVal = localStorage.getItem(key);
        if (!lsVal || lsVal === 'null' || lsVal === 'undefined') {
          const ssVal = sessionStorage.getItem(SS_PREFIX + key);
          if (ssVal && ssVal !== 'null' && ssVal !== 'undefined') {
            localStorage.setItem(key, ssVal);
          }
        } else {
          sessionStorage.setItem(SS_PREFIX + key, lsVal);
        }
      } catch (_) {}
    });

    // مزامنة مفاتيح الجهاز
    const d1 = localStorage.getItem('group_m_device_primary');
    const d2 = localStorage.getItem('group_m_device_bk1');
    const d3 = localStorage.getItem('group_m_device_bk2');
    const best = d1 || d2 || d3;
    if (best) {
      if (!d1) try { localStorage.setItem('group_m_device_primary', best); } catch (_) {}
      if (!d2) try { localStorage.setItem('group_m_device_bk1', best); } catch (_) {}
      if (!d3) try { localStorage.setItem('group_m_device_bk2', best); } catch (_) {}
    }

    // backup لـ IndexedDB في الخلفية (async — لا يعطّل)
    setTimeout(() => {
      PROTECTED_KEYS.forEach(key => {
        try {
          const val = localStorage.getItem(key);
          if (val && val !== 'null') idbSet(key, val);
        } catch (_) {}
      });
    }, 500);

  } catch (_) {}
}

/**
 * startStorageWatcher — مراقب دوري
 * يعيد backup كل 60 ثانية
 */
export function startStorageWatcher(): () => void {
  // backup فوري
  backupAllToGuard();

  // backup كل دقيقة
  const interval = setInterval(backupAllToGuard, 60_000);

  // مراقبة storage events
  const handler = (e: StorageEvent) => {
    if (!e.key || !PROTECTED_KEYS.includes(e.key)) return;
    if (e.newValue && e.newValue !== 'null') {
      try { sessionStorage.setItem(SS_PREFIX + e.key, e.newValue); } catch (_) {}
      idbSet(e.key, e.newValue);
    }
  };
  window.addEventListener('storage', handler);

  return () => {
    clearInterval(interval);
    window.removeEventListener('storage', handler);
  };
}

/**
 * backupAllToGuard — حفظ كل شيء
 */
export function backupAllToGuard(): void {
  PROTECTED_KEYS.forEach(key => {
    try {
      const val = localStorage.getItem(key);
      if (val && val !== 'null') {
        sessionStorage.setItem(SS_PREFIX + key, val);
        idbSet(key, val);
      }
    } catch (_) {}
  });
}

/**
 * guardedSet — حفظ في كل الأماكن
 */
export function guardedSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (_) {}
  try { sessionStorage.setItem(SS_PREFIX + key, value); } catch (_) {}
  idbSet(key, value);
}

/**
 * guardedGet — قراءة من أقوى مصدر متاح
 */
export function guardedGet(key: string): string | null {
  try {
    const lsVal = localStorage.getItem(key);
    if (lsVal && lsVal !== 'null' && lsVal !== 'undefined') return lsVal;
  } catch (_) {}
  try {
    const ssVal = sessionStorage.getItem(SS_PREFIX + key);
    if (ssVal && ssVal !== 'null' && ssVal !== 'undefined') return ssVal;
  } catch (_) {}
  return null;
}

/**
 * recoverFromIDB — استرجاع async من IndexedDB
 * استخدمه لما تشك إن البيانات ضاعت
 */
export async function recoverFromIDB(): Promise<void> {
  for (const key of PROTECTED_KEYS) {
    try {
      const lsVal = localStorage.getItem(key);
      if (!lsVal || lsVal === 'null') {
        const idbVal = await idbGetAsync(key);
        if (idbVal && idbVal !== 'null') {
          try { localStorage.setItem(key, idbVal); } catch (_) {}
          try { sessionStorage.setItem(SS_PREFIX + key, idbVal); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

export default {
  init    : initStorageGuard,
  backup  : backupAllToGuard,
  watch   : startStorageWatcher,
  set     : guardedSet,
  get     : guardedGet,
  recover : recoverFromIDB,
};
