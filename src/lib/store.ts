import { useSyncExternalStore } from "react";
import { CODE_RE, EMPTY_RECORD, MONTH_RE, newId, toPeriodKey } from "./logic";
import type { AppData, Household, MonthRecord } from "./types";

const STORAGE_KEY = "home-money:data";

const EMPTY_DATA: AppData = {
  version: 1,
  communityName: "",
  households: [],
  months: {},
  lastBackupAt: null,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, pattern?: RegExp): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && (!pattern || pattern.test(v)),
  );
}

/** 驗證並整理資料（讀取 localStorage 與匯入備份檔共用），格式不符時丟出錯誤 */
export function parseAppData(raw: unknown): AppData {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.households) || !isObject(raw.months)) {
    throw new Error("檔案格式不正確，不是本系統的備份檔");
  }
  const households: Household[] = raw.households.map((h) => {
    if (!isObject(h) || typeof h.id !== "string" || typeof h.unit !== "string") {
      throw new Error("備份檔中的住戶資料格式不正確");
    }
    return {
      id: h.id,
      unit: h.unit,
      name: typeof h.name === "string" ? h.name : "",
      phone: typeof h.phone === "string" ? h.phone : "",
      codes: stringList(h.codes, CODE_RE),
    };
  });
  const months: Record<string, MonthRecord> = {};
  for (const [key, value] of Object.entries(raw.months)) {
    if (!MONTH_RE.test(key) || !isObject(value)) continue;
    // 舊版以月份記錄，合併到所屬的期別
    const period = toPeriodKey(key);
    const existing = months[period] ?? EMPTY_RECORD;
    months[period] = {
      codes: [...new Set([...existing.codes, ...stringList(value.codes, CODE_RE)])],
      cash: [...new Set([...existing.cash, ...stringList(value.cash)])],
    };
  }
  return {
    version: 1,
    communityName: typeof raw.communityName === "string" ? raw.communityName : "",
    households,
    months,
    lastBackupAt: typeof raw.lastBackupAt === "string" ? raw.lastBackupAt : null,
  };
}

let cache: AppData | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): AppData {
  if (cache) return cache;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 瀏覽器封鎖儲存空間時，以空資料運作
  }
  if (raw) {
    try {
      cache = parseAppData(JSON.parse(raw));
    } catch {
      // 資料損毀：先另存一份，避免下次寫入時被覆蓋而永久遺失
      try {
        localStorage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, raw);
      } catch {}
      cache = EMPTY_DATA;
    }
  } else {
    cache = EMPTY_DATA;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 同一台裝置開了多個分頁時，同步其他分頁的修改
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 伺服器端與首次 hydration 時回傳 null，代表資料尚未從瀏覽器讀出 */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

function update(updater: (data: AppData) => AppData) {
  cache = updater(getSnapshot());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    alert("資料儲存失敗，可能是瀏覽器儲存空間已滿或被封鎖。請先到「備份」頁匯出資料。");
  }
  listeners.forEach((l) => l());
}

function updatePeriod(period: string, updater: (record: MonthRecord) => MonthRecord) {
  update((d) => ({
    ...d,
    months: { ...d.months, [period]: updater(d.months[period] ?? EMPTY_RECORD) },
  }));
}

export function addHousehold(input: Omit<Household, "id">) {
  update((d) => ({ ...d, households: [...d.households, { ...input, id: newId() }] }));
}

export function updateHousehold(id: string, input: Omit<Household, "id">) {
  update((d) => ({
    ...d,
    households: d.households.map((h) => (h.id === id ? { ...input, id } : h)),
  }));
}

export function deleteHousehold(id: string) {
  update((d) => ({
    ...d,
    households: d.households.filter((h) => h.id !== id),
    months: Object.fromEntries(
      Object.entries(d.months).map(([k, r]) => [k, { ...r, cash: r.cash.filter((c) => c !== id) }]),
    ),
  }));
}

/** 把一組末五碼綁定到某一戶（用於對不到住戶的末五碼） */
export function bindCode(householdId: string, code: string) {
  update((d) => ({
    ...d,
    households: d.households.map((h) =>
      h.id === householdId && !h.codes.includes(code) ? { ...h, codes: [...h.codes, code] } : h,
    ),
  }));
}

export function addPeriodCodes(period: string, codes: string[]) {
  updatePeriod(period, (r) => ({ ...r, codes: [...r.codes, ...codes.filter((c) => !r.codes.includes(c))] }));
}

export function removePeriodCode(period: string, code: string) {
  updatePeriod(period, (r) => ({ ...r, codes: r.codes.filter((c) => c !== code) }));
}

export function toggleCash(period: string, householdId: string) {
  updatePeriod(period, (r) => ({
    ...r,
    cash: r.cash.includes(householdId)
      ? r.cash.filter((id) => id !== householdId)
      : [...r.cash, householdId],
  }));
}

export function setCommunityName(name: string) {
  update((d) => ({ ...d, communityName: name }));
}

export function markBackedUp() {
  update((d) => ({ ...d, lastBackupAt: new Date().toISOString() }));
}

export function replaceAllData(data: AppData) {
  update(() => data);
}
