export type Household = {
  id: string;
  /** 戶號，例如「3F-1」 */
  unit: string;
  /** 住戶姓名，可留空 */
  name: string;
  /** 綁定的帳號末五碼，一戶可以有多組 */
  codes: string[];
};

export type MonthRecord = {
  /** 當期輸入的轉帳末五碼（不重複） */
  codes: string[];
  /** 當期手動標記為現金繳費的住戶 id */
  cash: string[];
};

export type AppData = {
  version: 1;
  communityName: string;
  households: Household[];
  /** 每一期的對帳紀錄，key 為 "YYYY-01"（上半年）或 "YYYY-07"（下半年） */
  months: Record<string, MonthRecord>;
  lastBackupAt: string | null;
};

export type PayStatus = {
  paid: boolean;
  /** 對到這一戶的轉帳末五碼 */
  codes: string[];
  cash: boolean;
};
