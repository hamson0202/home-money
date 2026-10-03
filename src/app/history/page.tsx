"use client";

import { useMemo, useState } from "react";
import { Button, Card, Loading } from "@/components/ui";
import { exportHistoryExcel } from "@/lib/excel";
import {
  computePeriod,
  formatPeriod,
  hasRecord,
  periodKey,
  periodRange,
  recordedPeriods,
  shortPeriod,
  sortHouseholds,
} from "@/lib/logic";
import { useAppData } from "@/lib/store";
import type { AppData } from "@/lib/types";

export default function HistoryPage() {
  const data = useAppData();
  if (!data) return <Loading />;
  return <History data={data} />;
}

function History({ data }: { data: AppData }) {
  const [exporting, setExporting] = useState(false);
  const households = useMemo(() => sortHouseholds(data.households), [data.households]);

  // 從第一次對帳的期別列到目前這一期
  const periods = useMemo(() => {
    const recorded = recordedPeriods(data);
    const current = periodKey();
    const first = recorded[0] && recorded[0] < current ? recorded[0] : current;
    const last = recorded.at(-1) && recorded.at(-1)! > current ? recorded.at(-1)! : current;
    return periodRange(first, last);
  }, [data]);

  const results = useMemo(
    () => periods.map((p) => (hasRecord(data, p) ? computePeriod(data, p).byHousehold : null)),
    [data, periods],
  );

  // 所有已對帳期別的累計未繳
  const arrears = useMemo(
    () =>
      households
        .map((h) => ({
          household: h,
          periods: periods.filter((_, i) => results[i] && !results[i].get(h.id)?.paid),
        }))
        .filter((a) => a.periods.length > 0)
        .sort((a, b) => b.periods.length - a.periods.length),
    [households, periods, results],
  );

  async function exportExcel() {
    setExporting(true);
    try {
      await exportHistoryExcel(data, periods);
    } finally {
      setExporting(false);
    }
  }

  if (households.length === 0) {
    return <p className="py-20 text-center text-slate-400">尚無住戶資料</p>;
  }

  return (
    <div className="space-y-4">
      <Card title="累計欠費住戶">
        {arrears.length === 0 ? (
          <p className="text-slate-500">目前沒有欠費住戶 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {arrears.map(({ household, periods }) => (
              <li key={household.id} className="flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{household.unit}</span>
                  {household.name && <span className="ml-2 text-slate-500">{household.name}</span>}
                  <div className="text-xs text-slate-500">{periods.map(formatPeriod).join("、")}</div>
                </div>
                <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                  欠 {periods.length} 期
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="歷年繳費總表"
        actions={
          <Button onClick={exportExcel} disabled={exporting}>
            {exporting ? "匯出中…" : "匯出 Excel"}
          </Button>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          <span className="text-emerald-600">✓</span> 匯款　<span className="text-sky-600">現</span> 現金
          <span className="text-rose-600">✗</span> 未繳　<span className="text-slate-300">—</span> 該期尚未對帳
          <br />
          「上」為上半年（1 月繳），「下」為下半年（7 月繳）
        </p>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium">戶號</th>
                {periods.map((p) => (
                  <th key={p} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                    {shortPeriod(p)}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">未繳</th>
              </tr>
            </thead>
            <tbody>
              {households.map((h) => {
                let unpaid = 0;
                const cells = results.map((byHousehold, i) => {
                  const s = byHousehold?.get(h.id);
                  if (!s) return <td key={i} className="text-center text-slate-300">—</td>;
                  if (!s.paid) {
                    unpaid++;
                    return <td key={i} className="text-center font-bold text-rose-600">✗</td>;
                  }
                  return s.codes.length ? (
                    <td key={i} className="text-center text-emerald-600">✓</td>
                  ) : (
                    <td key={i} className="text-center text-sky-600">現</td>
                  );
                });
                return (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="sticky left-0 bg-white py-2 pr-3 font-medium whitespace-nowrap">{h.unit}</td>
                    {cells}
                    <td className={`text-center font-medium ${unpaid ? "text-rose-600" : "text-slate-400"}`}>
                      {unpaid}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
