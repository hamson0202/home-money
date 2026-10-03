"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Loading, MonthSwitcher, inputClass } from "@/components/ui";
import { exportMonthExcel } from "@/lib/excel";
import {
  EMPTY_RECORD,
  buildCodeIndex,
  computeMonth,
  formatMonth,
  householdLabel,
  monthKey,
  parseCodes,
  shiftMonth,
  sortHouseholds,
} from "@/lib/logic";
import { addMonthCodes, bindCode, removeMonthCode, toggleCash, useAppData } from "@/lib/store";
import type { AppData, Household, PayStatus } from "@/lib/types";

const BACKUP_REMINDER_DAYS = 30;

export default function ReconcilePage() {
  const data = useAppData();
  const [month, setMonth] = useState(() => monthKey());
  if (!data) return <Loading />;
  return <Reconcile data={data} month={month} onMonthChange={setMonth} />;
}

type Feedback = {
  added: { code: string; owner?: Household }[];
  duplicated: string[];
  invalid: string[];
};

type Filter = "all" | "unpaid" | "paid";

function Reconcile({ data, month, onMonthChange }: { data: AppData; month: string; onMonthChange: (m: string) => void }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);
  const [now] = useState(() => Date.now());

  const households = useMemo(() => sortHouseholds(data.households), [data.households]);
  const codeIndex = useMemo(() => buildCodeIndex(data.households), [data.households]);
  const { byHousehold, unmatched } = useMemo(() => computeMonth(data, month), [data, month]);
  const record = data.months[month] ?? EMPTY_RECORD;

  const paidCount = households.filter((h) => byHousehold.get(h.id)?.paid).length;
  const unpaidList = households.filter((h) => !byHousehold.get(h.id)?.paid);
  const visible = households.filter((h) => {
    const paid = byHousehold.get(h.id)?.paid;
    return filter === "all" || (filter === "paid" ? paid : !paid);
  });

  function changeMonth(delta: number) {
    onMonthChange(shiftMonth(month, delta));
    setFeedback(null);
  }

  function submit() {
    const { codes, invalid } = parseCodes(text);
    if (!codes.length && !invalid.length) return;
    const seen = new Set(record.codes);
    const added: Feedback["added"] = [];
    const duplicated: string[] = [];
    for (const code of codes) {
      if (seen.has(code)) {
        duplicated.push(code);
      } else {
        seen.add(code);
        added.push({ code, owner: codeIndex.get(code) });
      }
    }
    if (added.length) addMonthCodes(month, added.map((a) => a.code));
    setFeedback({ added, duplicated, invalid });
    setText("");
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await exportMonthExcel(data, month);
    } finally {
      setExporting(false);
    }
  }

  const daysSinceBackup = data.lastBackupAt
    ? (now - new Date(data.lastBackupAt).getTime()) / 86_400_000
    : Infinity;

  return (
    <>
      <div className="space-y-4 print:hidden">
        <MonthSwitcher label={formatMonth(month)} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />

        {households.length === 0 ? (
          <Card>
            <p className="text-slate-600">
              還沒有住戶資料。請先到
              <Link href="/households" className="mx-1 font-medium text-emerald-700 underline">
                住戶管理
              </Link>
              新增住戶與帳號末五碼。
            </p>
          </Card>
        ) : (
          <>
            {daysSinceBackup > BACKUP_REMINDER_DAYS && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {data.lastBackupAt ? `已經 ${Math.floor(daysSinceBackup)} 天沒有備份` : "資料還沒有備份過"}
                ，資料只存在這個瀏覽器，建議到
                <Link href="/settings" className="mx-1 font-medium underline">
                  設定備份
                </Link>
                匯出備份檔。
              </div>
            )}

            <Stats paid={paidCount} total={households.length} />

            <Card title="輸入轉帳末五碼">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="例如：12345，可一次貼上多筆（用空白、逗號或換行分開），按 Enter 送出"
                className={`${inputClass} resize-y font-mono`}
              />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" onClick={submit} disabled={!text.trim()}>
                  加入
                </Button>
              </div>
              {feedback && <FeedbackView feedback={feedback} />}
              {record.codes.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-sm text-slate-500">本月已輸入 {record.codes.length} 筆（點 × 可刪除打錯的）</p>
                  <div className="flex flex-wrap gap-2">
                    {record.codes.map((code) => {
                      const owner = codeIndex.get(code);
                      return (
                        <span
                          key={code}
                          className={`inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm ${
                            owner ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          <span className="font-mono">{code}</span>
                          <span className="text-xs opacity-70">{owner ? owner.unit : "未對應"}</span>
                          <button
                            type="button"
                            onClick={() => removeMonthCode(month, code)}
                            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                            aria-label={`刪除 ${code}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

            {unmatched.length > 0 && (
              <Card title={`對不到住戶的末五碼（${unmatched.length}）`}>
                <p className="mb-3 text-sm text-slate-500">
                  指定給住戶後，系統會記住這組末五碼，以後就會自動對應。
                </p>
                <ul className="space-y-2">
                  {unmatched.map((code) => (
                    <UnmatchedRow key={code} code={code} month={month} households={households} />
                  ))}
                </ul>
              </Card>
            )}

            <Card
              title="住戶繳費狀態"
              actions={
                <div className="flex gap-2">
                  <Button onClick={() => window.print()} disabled={unpaidList.length === 0}>
                    列印未繳名單
                  </Button>
                  <Button onClick={exportExcel} disabled={exporting}>
                    {exporting ? "匯出中…" : "匯出 Excel"}
                  </Button>
                </div>
              }
            >
              <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ["all", `全部 ${households.length}`],
                    ["unpaid", `未繳 ${households.length - paidCount}`],
                    ["paid", `已繳 ${paidCount}`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`flex-1 rounded-md py-2 text-sm font-medium ${
                      filter === key ? "bg-white shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {visible.length === 0 ? (
                <p className="py-6 text-center text-slate-400">
                  {filter === "unpaid" ? "全部都繳了 🎉" : "沒有符合的住戶"}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visible.map((h) => (
                    <HouseholdRow key={h.id} household={h} status={byHousehold.get(h.id)!} month={month} />
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      <PrintSheet title={`${data.communityName ? `${data.communityName} ` : ""}${formatMonth(month)} 管理費未繳名單`} list={unpaidList} />
    </>
  );
}

function Stats({ paid, total }: { paid: number; total: number }) {
  const percent = total ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatBox label="已繳" value={paid} className="text-emerald-600" />
      <StatBox label="未繳" value={total - paid} className="text-rose-600" />
      <StatBox label="完成率" value={`${percent}%`} className="text-slate-800" />
      <div className="col-span-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatBox({ label, value, className }: { label: string; value: number | string; className: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
    </div>
  );
}

function FeedbackView({ feedback }: { feedback: Feedback }) {
  return (
    <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
      {feedback.added.map(({ code, owner }) => (
        <p key={code}>
          <span className="font-mono">{code}</span>
          {owner ? (
            <span className="text-emerald-700"> → {householdLabel(owner)} ✓</span>
          ) : (
            <span className="text-amber-700"> → 找不到住戶，請在下方指定</span>
          )}
        </p>
      ))}
      {feedback.duplicated.length > 0 && (
        <p className="text-slate-500">本月已輸入過，略過：{feedback.duplicated.join("、")}</p>
      )}
      {feedback.invalid.length > 0 && (
        <p className="text-rose-600">不是 5 位數字，略過：{feedback.invalid.join("、")}</p>
      )}
    </div>
  );
}

function UnmatchedRow({ code, month, households }: { code: string; month: string; households: Household[] }) {
  const [target, setTarget] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-16 font-mono font-bold">{code}</span>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${inputClass} min-w-0 flex-1`}>
        <option value="">選擇住戶…</option>
        {households.map((h) => (
          <option key={h.id} value={h.id}>
            {householdLabel(h)}
          </option>
        ))}
      </select>
      <Button variant="primary" disabled={!target} onClick={() => bindCode(target, code)}>
        指定
      </Button>
      <Button variant="danger" onClick={() => removeMonthCode(month, code)}>
        刪除
      </Button>
    </li>
  );
}

function HouseholdRow({ household, status, month }: { household: Household; status: PayStatus; month: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{household.unit}</div>
        {household.name && <div className="truncate text-sm text-slate-500">{household.name}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status.codes.length > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
            轉帳 {status.codes.join("、")}
          </span>
        )}
        {status.cash && (
          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800">現金</span>
        )}
        {!status.paid && (
          <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">未繳</span>
        )}
        {(status.cash || status.codes.length === 0) && (
          <Button onClick={() => toggleCash(month, household.id)} className="text-xs">
            {status.cash ? "取消現金" : "現金已繳"}
          </Button>
        )}
      </div>
    </li>
  );
}

function PrintSheet({ title, list }: { title: string; list: Household[] }) {
  return (
    <div className="hidden print:block">
      <h1 className="mb-1 text-center text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-center text-sm">共 {list.length} 戶</p>
      <table className="w-full border-collapse text-lg">
        <thead>
          <tr>
            <th className="border border-black px-3 py-2 text-left">戶號</th>
            <th className="border border-black px-3 py-2 text-left">住戶姓名</th>
          </tr>
        </thead>
        <tbody>
          {list.map((h) => (
            <tr key={h.id}>
              <td className="border border-black px-3 py-2">{h.unit}</td>
              <td className="border border-black px-3 py-2">{h.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-right">請尚未繳納的住戶儘速繳交，謝謝配合。</p>
    </div>
  );
}
