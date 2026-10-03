"use client";

import { useMemo, useState } from "react";
import { Button, Card, Loading, MonthSwitcher } from "@/components/ui";
import { exportYearExcel } from "@/lib/excel";
import { computeMonth, hasRecord, recordedMonths, sortHouseholds } from "@/lib/logic";
import { useAppData } from "@/lib/store";
import type { AppData } from "@/lib/types";

export default function HistoryPage() {
  const data = useAppData();
  const [year, setYear] = useState(() => new Date().getFullYear());
  if (!data) return <Loading />;
  return <History data={data} year={year} onYearChange={setYear} />;
}

function History({ data, year, onYearChange }: { data: AppData; year: number; onYearChange: (y: number) => void }) {
  const [exporting, setExporting] = useState(false);
  const households = useMemo(() => sortHouseholds(data.households), [data.households]);

  const yearResults = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, "0")}`;
        return hasRecord(data, m) ? computeMonth(data, m).byHousehold : null;
      }),
    [data, year],
  );

  // 所有已對帳月份的累計未繳
  const arrears = useMemo(() => {
    const all = recordedMonths(data).map((m) => ({ month: m, byHousehold: computeMonth(data, m).byHousehold }));
    return households
      .map((h) => ({
        household: h,
        months: all.filter((r) => !r.byHousehold.get(h.id)?.paid).map((r) => r.month),
      }))
      .filter((a) => a.months.length > 0)
      .sort((a, b) => b.months.length - a.months.length);
  }, [data, households]);

  async function exportExcel() {
    setExporting(true);
    try {
      await exportYearExcel(data, year);
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
            {arrears.map(({ household, months }) => (
              <li key={household.id} className="flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{household.unit}</span>
                  {household.name && <span className="ml-2 text-slate-500">{household.name}</span>}
                  <div className="text-xs text-slate-500">
                    {months.map((m) => m.replace("-", "/")).join("、")}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                  欠 {months.length} 個月
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MonthSwitcher label={`${year} 年`} onPrev={() => onYearChange(year - 1)} onNext={() => onYearChange(year + 1)} />

      <Card
        title="年度繳費總表"
        actions={
          <Button onClick={exportExcel} disabled={exporting}>
            {exporting ? "匯出中…" : "匯出 Excel"}
          </Button>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          <span className="text-emerald-600">✓</span> 轉帳　<span className="text-sky-600">現</span> 現金
          <span className="text-rose-600">✗</span> 未繳　<span className="text-slate-300">—</span> 該月尚未對帳
        </p>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium">戶號</th>
                {yearResults.map((_, i) => (
                  <th key={i} className="min-w-8 px-1 py-2 text-center font-medium">
                    {i + 1}月
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">未繳</th>
              </tr>
            </thead>
            <tbody>
              {households.map((h) => {
                let unpaid = 0;
                const cells = yearResults.map((byHousehold, i) => {
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
