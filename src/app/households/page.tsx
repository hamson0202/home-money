"use client";

import { useMemo, useState } from "react";
import { Button, Card, Loading, inputClass } from "@/components/ui";
import { buildCodeIndex, parseCodes, sortHouseholds } from "@/lib/logic";
import { addHousehold, deleteHousehold, updateHousehold, useAppData } from "@/lib/store";
import type { AppData, Household } from "@/lib/types";

export default function HouseholdsPage() {
  const data = useAppData();
  if (!data) return <Loading />;
  return <Households data={data} />;
}

const EMPTY_FORM = { unit: "", name: "", codes: "" };

function Households({ data }: { data: AppData }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const households = useMemo(() => sortHouseholds(data.households), [data.households]);
  const codeIndex = useMemo(() => buildCodeIndex(data.households), [data.households]);

  function reset() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
  }

  function startEdit(h: Household) {
    setForm({ unit: h.unit, name: h.name, codes: h.codes.join(" ") });
    setEditingId(h.id);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    const unit = form.unit.trim();
    if (!unit) return setError("請輸入戶號");
    if (data.households.some((h) => h.unit === unit && h.id !== editingId)) {
      return setError(`戶號「${unit}」已經存在`);
    }
    const { codes, invalid } = parseCodes(form.codes);
    if (invalid.length) return setError(`末五碼必須是 5 位數字：${invalid.join("、")}`);
    for (const code of codes) {
      const owner = codeIndex.get(code);
      if (owner && owner.id !== editingId) return setError(`末五碼 ${code} 已經屬於「${owner.unit}」`);
    }
    const input = { unit, name: form.name.trim(), codes: [...new Set(codes)] };
    if (editingId) updateHousehold(editingId, input);
    else addHousehold(input);
    reset();
  }

  function remove(h: Household) {
    if (confirm(`確定要刪除「${h.unit}」嗎？這一戶過去的現金繳費紀錄也會一併刪除。`)) {
      deleteHousehold(h.id);
      if (editingId === h.id) reset();
    }
  }

  return (
    <div className="space-y-4">
      <Card title={editingId ? "編輯住戶" : "新增住戶"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">戶號 *</span>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="例如：3F-1、12號5樓"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">住戶姓名</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：王先生"
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">帳號末五碼（可多組，用空白或逗號分開）</span>
            <input
              value={form.codes}
              onChange={(e) => setForm({ ...form, codes: e.target.value })}
              inputMode="numeric"
              placeholder="例如：12345 67890"
              className={`${inputClass} font-mono`}
            />
            {editingId && (
              <span className="mt-1 block text-xs text-slate-500">
                注意：移除末五碼後，過去各期用這組末五碼繳的紀錄也會變成「對不到住戶」。
              </span>
            )}
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            {editingId && <Button onClick={reset}>取消</Button>}
            <Button type="submit" variant="primary">
              {editingId ? "儲存" : "新增"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={`住戶列表（${households.length} 戶）`}>
        {households.length === 0 ? (
          <p className="py-6 text-center text-slate-400">尚無住戶，請在上方新增</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {households.map((h) => (
              <li
                key={h.id}
                className={`flex items-center gap-3 py-3 ${editingId === h.id ? "bg-emerald-50/50" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {h.unit}
                    {h.name && <span className="ml-2 font-normal text-slate-500">{h.name}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {h.codes.length ? (
                      h.codes.map((c) => (
                        <span key={c} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">尚未設定末五碼</span>
                    )}
                  </div>
                </div>
                <Button onClick={() => startEdit(h)}>編輯</Button>
                <Button variant="danger" onClick={() => remove(h)}>
                  刪除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
