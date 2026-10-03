import type { AppData, Household, MonthRecord, PayStatus } from "./types";

export const CODE_RE = /^\d{5}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const EMPTY_RECORD: MonthRecord = { codes: [], cash: [] };

export function newId(): string {
  // crypto.randomUUID 只在 https / localhost 可用，用手機連區網 IP 測試時會不存在
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

export function householdLabel(h: Household): string {
  return h.name ? `${h.unit}　${h.name}` : h.unit;
}

export function sortHouseholds(list: Household[]): Household[] {
  return [...list].sort((a, b) =>
    a.unit.localeCompare(b.unit, "zh-Hant", { numeric: true }),
  );
}

/** 從使用者輸入中拆出末五碼；空白、逗號、換行等任何非數字字元都視為分隔 */
export function parseCodes(text: string): { codes: string[]; invalid: string[] } {
  const codes: string[] = [];
  const invalid: string[] = [];
  // 中文輸入法可能打出全形數字（１２３４５），先轉成半形
  const normalized = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  for (const token of normalized.split(/\D+/)) {
    if (!token) continue;
    if (CODE_RE.test(token)) codes.push(token);
    else invalid.push(token);
  }
  return { codes, invalid };
}

export function buildCodeIndex(households: Household[]): Map<string, Household> {
  const index = new Map<string, Household>();
  for (const h of households) {
    for (const code of h.codes) index.set(code, h);
  }
  return index;
}

/** 計算某個月每一戶的繳費狀態，以及對不到住戶的末五碼 */
export function computeMonth(data: AppData, month: string) {
  const record = data.months[month] ?? EMPTY_RECORD;
  const index = buildCodeIndex(data.households);
  const cash = new Set(record.cash);
  const byHousehold = new Map<string, PayStatus>();
  for (const h of data.households) {
    byHousehold.set(h.id, { paid: cash.has(h.id), codes: [], cash: cash.has(h.id) });
  }
  const unmatched: string[] = [];
  for (const code of record.codes) {
    const owner = index.get(code);
    const status = owner && byHousehold.get(owner.id);
    if (status) {
      status.codes.push(code);
      status.paid = true;
    } else {
      unmatched.push(code);
    }
  }
  return { byHousehold, unmatched };
}

/** 這個月是否已經開始對帳（有輸入過任何資料） */
export function hasRecord(data: AppData, month: string): boolean {
  const record = data.months[month];
  return !!record && (record.codes.length > 0 || record.cash.length > 0);
}

export function recordedMonths(data: AppData): string[] {
  return Object.keys(data.months)
    .filter((m) => hasRecord(data, m))
    .sort();
}
