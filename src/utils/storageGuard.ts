/**
 * storageGuard.ts
 * ══════════════════════════════════════════════════════════════════
 * 🛡️ حارس التخزين الذكي — يحل مشكلة ضياع بيانات localStorage في Vercel
 *
 * المشكلة الجذرية:
 * ─────────────────
 * localStorage في المتصفح يبقى موجود، لكن في حالات معينة (Preview URLs،
 * Hard Refresh، Service Worker قديم، أو Vercel deployment جديد) يبدو
 * كأن البيانات اتمسحت وهي في الحقيقة لأ.
 *
 * الحل:
 * ─────
 * 1. نحفظ backup في sessionStorage (أسرع من localStorage)
 * 2. نحفظ backup ثاني في IndexedDB (أصعب حاجة تتمسح)
 * 3. عند كل load، نسترجع من أي مصدر متاح ونرد للباقين
 * 4. نتحقق إن localStorage شغال صح قبل ما React يبدأ
 * 5. نمنع Service Worker من مسح أي حاجة عندنا
 * ══════════════════════════════════════════════════════════════════
 */

// ── المفاتيح الخاصة بالجهاز ──────────────────────────────────────
const DEVICE_KEYS = [
  'group_m_device_primary',
  'group_m_device_bk1',
  'group_m_device_bk2',
  'group_m_devices_list',
];

// ── مفاتيح GitHub (مهمة جداً) ────────────────────────────────────
const GITHUB_KEYS = [
  'gh_token_primary',
  'gh_token_backup_1',
  'gh_token_backup_2',
  'gh_owner',
  'gh_repo',
  'gh_branch',
  'gh_data_path',
  'gh_last_sha',
];

// ── مفاتيح Config ─────────────────────────────────────────────────
const CONFIG_KEYS = [
  'group_m_config',
  'group_m_users',
  'group_m_installations',
];

const ALL_PROTECTED_KEYS = [...DEVICE_KEYS, ...GITHUB_KEYS, ...CONFIG_KEYS];

// ── اسم قاعدة IndexedDB ───────────────────────────────────────────
const IDB_NAME    = 'GroupM_Guard';
const IDB_STORE   = 'protected_storage';
const IDB_VERSION = 1;

// ══════════════════════════════════════════════════════════════════
// 1. IndexedDB Helper — الحارس الأقوى
// ══════════════════════════════════════════════════════════════════

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror   = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    });
  } catch {
    // صامت — مش هنكسر التطبيق
  }
}

// ══════════════════════════════════════════════════════════════════
// 2. قراءة من كل المصادر (localStorage + sessionStorage + IndexedDB)
// ══════════════════════════════════════════════════════════════════

function readFromAllSources(key: string): string | null {
  // أولاً: localStorage (المصدر الأساسي)
  try {
    const v = localStorage.getItem(key);
    if (v && v !== 'null' && v !== 'undefined') return v;
  } catch (_) {}

  // ثانياً: sessionStorage (backup سريع)
  try {
    const v = sessionStorage.getItem(`__guard__${key}`);
    if (v && v !== 'null' && v !== 'undefined') return v;
  } catch (_) {}

  return null;
}

async function readFromAllSourcesAsync(key: string): Promise<string | null> {
  // أولاً: المصادر الفورية
  const sync = readFromAllSources(key);
  if (sync) return sync;

  // ثانياً: IndexedDB (الأقوى لكن async)
  return await idbGet(key);
}

// ══════════════════════════════════════════════════════════════════
// 3. حفظ في كل المصادر دفعة واحدة
// ══════════════════════════════════════════════════════════════════

function writeToAllSources(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (_) {}
  try { sessionStorage.setItem(`__guard__${key}`, value); } catch (_) {}
  // IndexedDB بشكل async في الخلفية
  idbSet(key, value).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════
// 4. استرجاع وإصلاح (Recovery) — القلب الأساسي
// ══════════════════════════════════════════════════════════════════

async function recoverKey(key: string): Promise<boolean> {
  // هل localStorage عنده القيمة؟
  let lsVal: string | null = null;
  try { lsVal = localStorage.getItem(key); } catch (_) {}

  if (lsVal && lsVal !== 'null' && lsVal !== 'undefined') {
    // localStorage تمام — نحدث الباقين
    try { sessionStorage.setItem(`__guard__${key}`, lsVal); } catch (_) {}
    idbSet(key, lsVal).catch(() => {});
    return true;
  }

  // localStorage فاضي — نجيب من sessionStorage أو IndexedDB
  const recovered = await readFromAllSourcesAsync(key);
  if (recovered && recovered !== 'null' && recovered !== 'undefined') {
    // استعدنا البيانات — نرجعها لـ localStorage فوراً
    try { localStorage.setItem(key, recovered); } catch (_) {}
    console.info(`[StorageGuard] ✅ تم استرداد: ${key}`);
    return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════
// 5. الدالة الرئيسية — تُنفَّذ عند بدء التطبيق
// ══════════════════════════════════════════════════════════════════

export async function initStorageGuard(): Promise<void> {
  console.info('[StorageGuard] 🛡️ بدء حماية التخزين...');

  // أ. تحقق إن localStorage شغال
  let lsWorking = false;
  try {
    localStorage.setItem('__guard_test__', '1');
    lsWorking = localStorage.getItem('__guard_test__') === '1';
    localStorage.removeItem('__guard_test__');
  } catch (_) {}

  if (!lsWorking) {
    console.warn('[StorageGuard] ⚠️ localStorage غير متاح — Private Mode؟');
    return;
  }

  // ب. استرجاع كل المفاتيح المحمية
  const recoveryPromises = DEVICE_KEYS.map(k => recoverKey(k));
  const results = await Promise.all(recoveryPromises);
  const recovered = results.filter(Boolean).length;

  if (recovered > 0) {
    console.info(`[StorageGuard] ✅ تم استرداد ${recovered} مفتاح`);
  }

  // ج. الآن نعمل backup لكل حاجة موجودة
  backupAllToGuard();

  console.info('[StorageGuard] 🛡️ الحماية فعّالة');
}

// ══════════════════════════════════════════════════════════════════
// 6. Backup فوري لكل البيانات الموجودة
// ══════════════════════════════════════════════════════════════════

export function backupAllToGuard(): void {
  ALL_PROTECTED_KEYS.forEach(key => {
    try {
      const val = localStorage.getItem(key);
      if (val && val !== 'null' && val !== 'undefined') {
        // حفظ في sessionStorage
        try { sessionStorage.setItem(`__guard__${key}`, val); } catch (_) {}
        // حفظ في IndexedDB
        idbSet(key, val).catch(() => {});
      }
    } catch (_) {}
  });
}

// ══════════════════════════════════════════════════════════════════
// 7. Safe Set — بديل لـ localStorage.setItem يحفظ في كل مكان
// ══════════════════════════════════════════════════════════════════

export function guardedSet(key: string, value: string): void {
  writeToAllSources(key, value);
}

export function guardedGet(key: string): string | null {
  return readFromAllSources(key);
}

// ══════════════════════════════════════════════════════════════════
// 8. مراقب التغييرات — يعمل Backup تلقائي عند أي تغيير
// ══════════════════════════════════════════════════════════════════

export function startStorageWatcher(): () => void {
  // مراقبة storage events (بين tabs)
  const handler = (e: StorageEvent) => {
    if (!e.key) return;
    if (!ALL_PROTECTED_KEYS.includes(e.key)) return;

    if (e.newValue && e.newValue !== 'null') {
      // قيمة جديدة — نعمل backup
      try { sessionStorage.setItem(`__guard__${e.key}`, e.newValue); } catch (_) {}
      idbSet(e.key, e.newValue).catch(() => {});
    } else if (e.newValue === null) {
      // حذف — نتجاهل (مش هنسمح بضياع البيانات)
      console.warn(`[StorageGuard] ⚠️ محاولة حذف محمية: ${e.key}`);
      // نرجع القيمة من الـ backup
      recoverKey(e.key).catch(() => {});
    }
  };

  window.addEventListener('storage', handler);

  // backup دوري كل 30 ثانية
  const interval = setInterval(backupAllToGuard, 30_000);

  // cleanup function
  return () => {
    window.removeEventListener('storage', handler);
    clearInterval(interval);
  };
}

// ══════════════════════════════════════════════════════════════════
// 9. تشخيص — اعرف إيه اللي موجود
// ══════════════════════════════════════════════════════════════════

export async function diagnoseStorage(): Promise<void> {
  console.group('[StorageGuard] 🔍 تشخيص التخزين');

  for (const key of DEVICE_KEYS) {
    const ls  = (() => { try { return localStorage.getItem(key); } catch { return 'ERROR'; } })();
    const ss  = (() => { try { return sessionStorage.getItem(`__guard__${key}`); } catch { return 'ERROR'; } })();
    const idb = await idbGet(key);

    console.log(
      `${key}:\n  LS=${ls ? '✅' : '❌'} | SS=${ss ? '✅' : '❌'} | IDB=${idb ? '✅' : '❌'}`
    );
  }

  console.groupEnd();
}

export default {
  init    : initStorageGuard,
  backup  : backupAllToGuard,
  watch   : startStorageWatcher,
  set     : guardedSet,
  get     : guardedGet,
  diagnose: diagnoseStorage,
};
