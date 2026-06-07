/**
 * DeviceIdentity.tsx
 * ══════════════════════════════════════════════════════════════════
 * نظام تعريف الجهاز — يُعرض مرة واحدة فقط أول مرة يُفتح الموقع
 * البيانات تُحفظ في 3 مفاتيح localStorage + sessionStorage + IndexedDB
 * ولا تُمسح أبداً حتى لو اتغير رابط Vercel
 * ══════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { Smartphone, User, Phone, CheckCircle, Shield } from 'lucide-react';
import { guardedSet, guardedGet } from '../utils/storageGuard';

// ── مفاتيح localStorage ──────────────────────────────────────────
export const DEVICE_KEY_PRIMARY  = 'group_m_device_primary';
export const DEVICE_KEY_BACKUP1  = 'group_m_device_bk1';
export const DEVICE_KEY_BACKUP2  = 'group_m_device_bk2';
export const DEVICES_LIST_KEY    = 'group_m_devices_list';

export interface DeviceInfo {
  deviceId:   string; // معرف فريد للجهاز
  userName:   string; // اسم المستخدم
  userPhone:  string; // رقم الموبايل
  registeredAt: string; // تاريخ التسجيل
  userAgent:  string; // معلومات المتصفح
}

// ── توليد معرف فريد للجهاز ──────────────────────────────────────
function generateDeviceId(): string {
  const nav = navigator;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 0,
  ].join('|');
  // hash بسيط
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  }
  const base = Math.abs(h).toString(36).toUpperCase();
  const rand  = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DEV-${base}-${rand}`;
}

// ── قراءة بيانات الجهاز الحالي (من كل المصادر الممكنة) ──────────
export function readCurrentDevice(): DeviceInfo | null {
  try {
    // نقرأ من كل مصدر — guardedGet بيجرب localStorage + sessionStorage
    const raw =
      guardedGet(DEVICE_KEY_PRIMARY) ||
      guardedGet(DEVICE_KEY_BACKUP1) ||
      guardedGet(DEVICE_KEY_BACKUP2) ||
      // Fallback مباشر لـ localStorage
      localStorage.getItem(DEVICE_KEY_PRIMARY) ||
      localStorage.getItem(DEVICE_KEY_BACKUP1) ||
      localStorage.getItem(DEVICE_KEY_BACKUP2);
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    return JSON.parse(raw) as DeviceInfo;
  } catch {
    return null;
  }
}

// ── حفظ بيانات الجهاز الحالي (localStorage + sessionStorage + IndexedDB) ─
export function saveCurrentDevice(info: DeviceInfo): void {
  const str = JSON.stringify(info);

  // حفظ في localStorage (3 مفاتيح)
  try { localStorage.setItem(DEVICE_KEY_PRIMARY, str); } catch (_) {}
  try { localStorage.setItem(DEVICE_KEY_BACKUP1, str); } catch (_) {}
  try { localStorage.setItem(DEVICE_KEY_BACKUP2, str); } catch (_) {}

  // حفظ في sessionStorage + IndexedDB عبر guardedSet
  guardedSet(DEVICE_KEY_PRIMARY, str);
  guardedSet(DEVICE_KEY_BACKUP1, str);
  guardedSet(DEVICE_KEY_BACKUP2, str);

  // إضافة للقائمة العامة
  const list = readDevicesList();
  const idx  = list.findIndex(d => d.deviceId === info.deviceId);
  if (idx >= 0) list[idx] = info;
  else list.push(info);
  const listStr = JSON.stringify(list);
  try { localStorage.setItem(DEVICES_LIST_KEY, listStr); } catch (_) {}
  guardedSet(DEVICES_LIST_KEY, listStr);
}

// ── قراءة قائمة الأجهزة ─────────────────────────────────────────
export function readDevicesList(): DeviceInfo[] {
  try {
    const raw = guardedGet(DEVICES_LIST_KEY) || localStorage.getItem(DEVICES_LIST_KEY);
    if (!raw || raw === 'null') return [];
    return JSON.parse(raw) as DeviceInfo[];
  } catch {
    return [];
  }
}

// ── حذف جهاز من القائمة ──────────────────────────────────────────
export function deleteDevice(deviceId: string): void {
  const list = readDevicesList().filter(d => d.deviceId !== deviceId);
  try { localStorage.setItem(DEVICES_LIST_KEY, JSON.stringify(list)); } catch (_) {}

  // لو الجهاز الحالي هو المحذوف، امسح بياناته المحلية
  const current = readCurrentDevice();
  if (current?.deviceId === deviceId) {
    try { localStorage.removeItem(DEVICE_KEY_PRIMARY); } catch (_) {}
    try { localStorage.removeItem(DEVICE_KEY_BACKUP1); } catch (_) {}
    try { localStorage.removeItem(DEVICE_KEY_BACKUP2); } catch (_) {}
  }
}

// ── إلغاء ارتباط الجهاز الحالي فقط (بدون مسح من القائمة) ───────
export function unlinkCurrentDevice(): void {
  try { localStorage.removeItem(DEVICE_KEY_PRIMARY); } catch (_) {}
  try { localStorage.removeItem(DEVICE_KEY_BACKUP1); } catch (_) {}
  try { localStorage.removeItem(DEVICE_KEY_BACKUP2); } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════
// مكوّن شاشة التسجيل الأولي
// ══════════════════════════════════════════════════════════════════
interface DeviceIdentityProps {
  onComplete: (info: DeviceInfo) => void;
  primaryColor?: string;
}

export default function DeviceIdentity({ onComplete, primaryColor = '#0f172a' }: DeviceIdentityProps) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [done,   setDone]   = useState(false);

  const validate = (): string[] => {
    const e: string[] = [];
    if (!name.trim())  e.push('يرجى إدخال اسمك الكامل');
    if (!phone.trim()) e.push('يرجى إدخال رقم الموبايل');
    else if (!/^01[0-9]{9}$/.test(phone.trim().replace(/\s/g, '')))
      e.push('رقم الموبايل غير صحيح — يجب أن يبدأ بـ 01 ويكون 11 رقماً');
    return e;
  };

  const handleSubmit = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    const info: DeviceInfo = {
      deviceId:     generateDeviceId(),
      userName:     name.trim(),
      userPhone:    phone.trim().replace(/\s/g, ''),
      registeredAt: new Date().toISOString(),
      userAgent:    navigator.userAgent,
    };

    saveCurrentDevice(info);
    setDone(true);
    setTimeout(() => onComplete(info), 1200);
  };

  const inputCls = 'w-full px-4 py-3.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-offset-1 bg-white text-slate-700 transition font-bold';

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}
    >
      {/* بطاقة */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* رأس */}
        <div className="p-6 text-white text-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, #1e3a5f)` }}>
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-black">تسجيل الجهاز</h1>
          <p className="text-white/70 text-xs mt-1 leading-relaxed">
            سجّل اسمك مرة واحدة فقط — ستُحفظ بياناتك على هذا الجهاز نهائياً
          </p>
        </div>

        {/* نموذج */}
        {!done ? (
          <div className="p-6 space-y-4">

            {/* الاسم */}
            <div>
              <label className="block text-xs font-black text-slate-600 mb-1.5">
                <User size={11} className="inline ml-1" />الاسم الكامل *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="مثال: أحمد محمد علي"
                className={inputCls}
                style={{ focusRingColor: primaryColor }}
                autoFocus
              />
            </div>

            {/* الموبايل */}
            <div>
              <label className="block text-xs font-black text-slate-600 mb-1.5">
                <Phone size={11} className="inline ml-1" />رقم الموبايل *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="01XXXXXXXXX"
                className={inputCls}
                dir="ltr"
              />
            </div>

            {/* أخطاء */}
            {errors.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-bold space-y-1">
                {errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            {/* زر التسجيل */}
            <button
              type="button"
              onClick={handleSubmit}
              className="w-full py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, #1e3a5f)` }}
            >
              <Shield size={16} />
              تسجيل الجهاز والمتابعة
            </button>

            <p className="text-center text-[10px] text-slate-400 leading-relaxed">
              بياناتك محفوظة محلياً على جهازك فقط ولن تُمسح عند إغلاق الموقع
            </p>
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="w-14 h-14 text-emerald-500" />
            <p className="font-black text-slate-800 text-lg">تم التسجيل بنجاح!</p>
            <p className="text-slate-500 text-xs">جاري الدخول...</p>
          </div>
        )}
      </div>
    </div>
  );
}
