/**
 * appBridge.ts — جسر الترابط الشامل 🌉
 * ══════════════════════════════════════════════════════════════════
 * هذا الملف هو "المخ المركزي" للتطبيق:
 *
 * ① يربط كل الملفات ببعض (storageGuard ↔ DeviceIdentity ↔ App ↔ GitHub)
 * ② يحل مشاكل عدم الترابط (import conflicts, stale data, race conditions)
 * ③ نقطة واحدة لقراءة/حفظ البيانات من أي ملف
 * ④ يفهم حالة التطبيق كاملة في أي لحظة
 * ⑤ يصلح تلقائياً لو حاجة اتكسرت
 *
 * طريقة الاستخدام:
 * ─────────────────
 * import { Bridge } from './utils/appBridge';
 *
 * // قراءة بيانات الجهاز
 * const device = Bridge.device.read();
 *
 * // حفظ بيانات بشكل آمن
 * Bridge.storage.set('my_key', 'my_value');
 *
 * // تشخيص المشكلة
 * Bridge.diagnose();
 * ══════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════
// الثوابت المركزية — مفاتيح كل الملفات في مكان واحد
// ══════════════════════════════════════════════════════════════════
export const KEYS = {
  // مفاتيح الجهاز (من DeviceIdentity.tsx)
  device: {
    primary : 'group_m_device_primary',
    backup1 : 'group_m_device_bk1',
    backup2 : 'group_m_device_bk2',
    list    : 'group_m_devices_list',
  },
  // مفاتيح GitHub (من App.tsx)
  github: {
    token   : 'gh_token_primary',
    tokenB1 : 'gh_token_backup_1',
    tokenB2 : 'gh_token_backup_2',
    owner   : 'gh_owner',
    repo    : 'gh_repo',
    branch  : 'gh_branch',
    dataPath: 'gh_data_path',
    sha     : 'gh_last_sha',
  },
  // مفاتيح البيانات
  data: {
    config       : 'group_m_config',
    users        : 'group_m_users',
    installations: 'group_m_installations',
  },
  // مفاتيح الجلسة
  session: {
    admin: 'group_m_admin_session',
  },
} as const;

// كل المفاتيح المحمية في مصفوفة واحدة
export const ALL_KEYS: string[] = [
  ...Object.values(KEYS.device),
  ...Object.values(KEYS.github),
  ...Object.values(KEYS.data),
];

// ══════════════════════════════════════════════════════════════════
// Storage Layer — طبقة التخزين الموحدة
// ══════════════════════════════════════════════════════════════════
const SS_PREFIX = '__grd__';

function idbWrite(key: string, value: string): void {
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
        db.transaction('store', 'readwrite').objectStore('store').put(value, key);
      } catch (_) {}
    };
  } catch (_) {}
}

function idbRead(key: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('GroupM_Guard', 1);
      req.onupgradeneeded = (e: Event) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
      };
      req.onsuccess = (e: Event) => {
        try {
          const db  = (e.target as IDBOpenDBRequest).result;
          const get = db.transaction('store', 'readonly').objectStore('store').get(key);
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror   = () => resolve(null);
        } catch (_) { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

// ══════════════════════════════════════════════════════════════════
// Bridge.storage — التخزين الآمن
// ══════════════════════════════════════════════════════════════════
const storage = {
  /**
   * قراءة من كل المصادر — localStorage أولاً ثم sessionStorage
   */
  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      if (v && v !== 'null' && v !== 'undefined') return v;
    } catch (_) {}
    try {
      const v = sessionStorage.getItem(SS_PREFIX + key);
      if (v && v !== 'null' && v !== 'undefined') return v;
    } catch (_) {}
    return null;
  },

  /**
   * حفظ في كل الأماكن دفعة واحدة
   */
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch (_) {}
    try { sessionStorage.setItem(SS_PREFIX + key, value); } catch (_) {}
    idbWrite(key, value);
  },

  /**
   * قراءة بـ JSON parse آمن
   */
  getJson<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch (_) { return fallback; }
  },

  /**
   * حفظ JSON
   */
  setJson(key: string, value: unknown): void {
    try {
      const str = JSON.stringify(value);
      this.set(key, str);
    } catch (_) {}
  },

  /**
   * استرجاع من IndexedDB (async — للحالات الصعبة)
   */
  async recoverFromIDB(key: string): Promise<boolean> {
    const existing = this.get(key);
    if (existing) return true; // موجود، لا داعي للاسترجاع

    const idbVal = await idbRead(key);
    if (idbVal && idbVal !== 'null') {
      try { localStorage.setItem(key, idbVal); } catch (_) {}
      try { sessionStorage.setItem(SS_PREFIX + key, idbVal); } catch (_) {}
      return true;
    }
    return false;
  },

  /**
   * Backup كل البيانات المحمية
   */
  backupAll(): void {
    ALL_KEYS.forEach(key => {
      try {
        const val = localStorage.getItem(key);
        if (val && val !== 'null') {
          sessionStorage.setItem(SS_PREFIX + key, val);
          idbWrite(key, val);
        }
      } catch (_) {}
    });
  },

  /**
   * استرجاع كل البيانات من sessionStorage (sync — سريع)
   */
  recoverSync(): number {
    let recovered = 0;
    ALL_KEYS.forEach(key => {
      try {
        const lsVal = localStorage.getItem(key);
        if (!lsVal || lsVal === 'null') {
          const ssVal = sessionStorage.getItem(SS_PREFIX + key);
          if (ssVal && ssVal !== 'null') {
            localStorage.setItem(key, ssVal);
            recovered++;
          }
        }
      } catch (_) {}
    });
    return recovered;
  },
};

// ══════════════════════════════════════════════════════════════════
// Bridge.device — إدارة بيانات الجهاز
// يربط DeviceIdentity.tsx مع storageGuard
// ══════════════════════════════════════════════════════════════════
export interface DeviceRecord {
  deviceId    : string;
  userName    : string;
  userPhone   : string;
  registeredAt: string;
  userAgent   : string;
}

const device = {
  /**
   * قراءة بيانات الجهاز الحالي من كل المصادر
   */
  read(): DeviceRecord | null {
    const raw =
      storage.get(KEYS.device.primary) ||
      storage.get(KEYS.device.backup1) ||
      storage.get(KEYS.device.backup2);
    if (!raw) return null;
    try { return JSON.parse(raw) as DeviceRecord; } catch (_) { return null; }
  },

  /**
   * حفظ بيانات الجهاز في كل المصادر
   */
  save(info: DeviceRecord): void {
    const str = JSON.stringify(info);
    // localStorage — 3 مفاتيح
    try { localStorage.setItem(KEYS.device.primary, str); } catch (_) {}
    try { localStorage.setItem(KEYS.device.backup1, str); } catch (_) {}
    try { localStorage.setItem(KEYS.device.backup2, str); } catch (_) {}
    // sessionStorage + IndexedDB
    storage.set(KEYS.device.primary, str);
    storage.set(KEYS.device.backup1, str);
    storage.set(KEYS.device.backup2, str);

    // تحديث القائمة
    const list = this.readList();
    const idx  = list.findIndex(d => d.deviceId === info.deviceId);
    if (idx >= 0) list[idx] = info;
    else list.push(info);
    storage.setJson(KEYS.device.list, list);
  },

  /**
   * قراءة قائمة كل الأجهزة
   */
  readList(): DeviceRecord[] {
    return storage.getJson<DeviceRecord[]>(KEYS.device.list, []);
  },

  /**
   * حذف جهاز من القائمة
   */
  delete(deviceId: string): void {
    const list = this.readList().filter(d => d.deviceId !== deviceId);
    storage.setJson(KEYS.device.list, list);
    // لو الجهاز الحالي هو المحذوف، امسح بياناته
    const current = this.read();
    if (current?.deviceId === deviceId) {
      this.unlinkCurrent();
    }
  },

  /**
   * إلغاء ارتباط الجهاز الحالي
   */
  unlinkCurrent(): void {
    [KEYS.device.primary, KEYS.device.backup1, KEYS.device.backup2].forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(SS_PREFIX + key); } catch (_) {}
    });
  },

  /**
   * مزامنة المفاتيح الثلاثة مع بعض
   */
  syncKeys(): void {
    const best =
      storage.get(KEYS.device.primary) ||
      storage.get(KEYS.device.backup1) ||
      storage.get(KEYS.device.backup2);
    if (!best) return;
    try { localStorage.setItem(KEYS.device.primary, best); } catch (_) {}
    try { localStorage.setItem(KEYS.device.backup1, best); } catch (_) {}
    try { localStorage.setItem(KEYS.device.backup2, best); } catch (_) {}
    storage.set(KEYS.device.primary, best);
    storage.set(KEYS.device.backup1, best);
    storage.set(KEYS.device.backup2, best);
  },
};

// ══════════════════════════════════════════════════════════════════
// Bridge.github — إدارة GitHub credentials
// يربط App.tsx مع storageGuard
// ══════════════════════════════════════════════════════════════════
const github = {
  /**
   * قراءة الـ token من كل المصادر
   */
  getToken(): string {
    return (
      storage.get(KEYS.github.token)   ||
      storage.get(KEYS.github.tokenB1) ||
      storage.get(KEYS.github.tokenB2) ||
      ''
    );
  },

  /**
   * حفظ الـ token في كل الأماكن
   */
  setToken(token: string): void {
    if (!token?.trim()) return;
    const t = token.trim();
    storage.set(KEYS.github.token,   t);
    storage.set(KEYS.github.tokenB1, t);
    storage.set(KEYS.github.tokenB2, t);
  },

  /**
   * قراءة كل credentials
   */
  read() {
    return {
      token   : this.getToken(),
      owner   : storage.get(KEYS.github.owner)    || '',
      repo    : storage.get(KEYS.github.repo)     || '',
      branch  : storage.get(KEYS.github.branch)   || 'main',
      dataPath: storage.get(KEYS.github.dataPath) || 'assets/data.json',
      sha     : storage.get(KEYS.github.sha)      || undefined,
    };
  },

  /**
   * حفظ كل credentials
   */
  save(cfg: { token?: string; owner?: string; repo?: string; branch?: string; dataPath?: string }) {
    if (cfg.token)    this.setToken(cfg.token);
    if (cfg.owner)    storage.set(KEYS.github.owner,    cfg.owner);
    if (cfg.repo)     storage.set(KEYS.github.repo,     cfg.repo);
    if (cfg.branch)   storage.set(KEYS.github.branch,   cfg.branch);
    if (cfg.dataPath) storage.set(KEYS.github.dataPath, cfg.dataPath);
  },
};

// ══════════════════════════════════════════════════════════════════
// Bridge.init — تهيئة كاملة عند بدء التطبيق
// ══════════════════════════════════════════════════════════════════
function init(): void {
  // 1. تحقق من localStorage
  let lsOk = false;
  try {
    localStorage.setItem('__bridge_ping__', '1');
    lsOk = localStorage.getItem('__bridge_ping__') === '1';
    localStorage.removeItem('__bridge_ping__');
  } catch (_) {}

  if (!lsOk) {
    console.warn('[Bridge] localStorage غير متاح');
    return;
  }

  // 2. استرجاع sync من sessionStorage
  const recovered = storage.recoverSync();
  if (recovered > 0) {
    console.info(`[Bridge] ✅ استُرد ${recovered} مفتاح من sessionStorage`);
  }

  // 3. مزامنة مفاتيح الجهاز
  device.syncKeys();

  // 4. backup في الخلفية
  setTimeout(() => {
    storage.backupAll();
  }, 300);

  // 5. مراقبة التغييرات
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key || !ALL_KEYS.includes(e.key)) return;
    if (e.newValue && e.newValue !== 'null') {
      try { sessionStorage.setItem(SS_PREFIX + e.key, e.newValue); } catch (_) {}
      idbWrite(e.key, e.newValue);
    }
  });

  // 6. backup دوري كل دقيقة
  setInterval(() => storage.backupAll(), 60_000);

  // 7. استرجاع async من IndexedDB في الخلفية
  setTimeout(async () => {
    for (const key of [KEYS.device.primary, KEYS.device.backup1, KEYS.device.backup2]) {
      await storage.recoverFromIDB(key);
    }
    // مزامنة مرة تانية بعد IDB
    device.syncKeys();
  }, 1000);
}

// ══════════════════════════════════════════════════════════════════
// Bridge.diagnose — تشخيص كامل للمشاكل
// اكتب Bridge.diagnose() في الـ Console لتشخيص المشكلة
// ══════════════════════════════════════════════════════════════════
async function diagnose(): Promise<void> {
  console.group('[Bridge] 🔍 تشخيص كامل');

  // فحص localStorage
  const lsKeys = Object.keys(localStorage);
  console.log('📦 localStorage keys:', lsKeys.filter(k => k.startsWith('group_m') || k.startsWith('gh_')));

  // فحص sessionStorage
  const ssKeys = Object.keys(sessionStorage).filter(k => k.startsWith(SS_PREFIX));
  console.log('💾 sessionStorage (guard):', ssKeys);

  // فحص بيانات الجهاز
  const dev = device.read();
  console.log('📱 الجهاز الحالي:', dev ? `${dev.userName} (${dev.userPhone})` : '❌ غير مسجل');

  // فحص قائمة الأجهزة
  const list = device.readList();
  console.log('📋 قائمة الأجهزة:', list.length, 'جهاز');

  // فحص GitHub
  const gh = github.read();
  console.log('🐙 GitHub Token:', gh.token ? `✅ موجود (${gh.token.slice(0, 10)}...)` : '❌ غير موجود');

  // فحص IndexedDB
  console.log('🔍 IndexedDB:');
  for (const key of [KEYS.device.primary, KEYS.device.backup1]) {
    const val = await idbRead(key);
    console.log(`  ${key}: ${val ? '✅' : '❌'}`);
  }

  console.groupEnd();
}

// ══════════════════════════════════════════════════════════════════
// Export الجسر الرئيسي
// ══════════════════════════════════════════════════════════════════
export const Bridge = {
  init,
  storage,
  device,
  github,
  diagnose,
  KEYS,
};

// ── جعله متاح في الـ console للتشخيص ──────────────────────────────
if (typeof window !== 'undefined') {
  (window as any).__Bridge = Bridge;
}

export default Bridge;
