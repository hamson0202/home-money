"use client";

import { useRef, useState } from "react";
import { Button, Card, Loading, inputClass } from "@/components/ui";
import { downloadBlob, todayString } from "@/lib/download";
import { recordedPeriods } from "@/lib/logic";
import { markBackedUp, parseAppData, replaceAllData, setCommunityName, useAppData } from "@/lib/store";
import type { AppData } from "@/lib/types";

export default function SettingsPage() {
  const data = useAppData();
  if (!data) return <Loading />;
  return <Settings data={data} />;
}

function Settings({ data }: { data: AppData }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function exportBackup() {
    const backup = { ...data, lastBackupAt: new Date().toISOString() };
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `管理費備份_${todayString()}.json`,
    );
    markBackedUp();
    setMessage({ ok: true, text: "備份檔已下載，請妥善保存（可存到雲端硬碟或寄給自己）。" });
  }

  async function importBackup(file: File) {
    try {
      const imported = parseAppData(JSON.parse(await file.text()));
      const summary = `${imported.households.length} 戶、${recordedPeriods(imported).length} 期的紀錄`;
      if (!confirm(`備份檔內有 ${summary}。\n還原後會「覆蓋」目前這個瀏覽器裡的所有資料，確定要還原嗎？`)) return;
      replaceAllData(imported);
      setMessage({ ok: true, text: `還原完成：${summary}。` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof SyntaxError ? "檔案無法讀取，不是有效的備份檔。" : String((e as Error).message) });
    }
  }

  return (
    <div className="space-y-4">
      <Card title="社區名稱">
        <input
          key={data.communityName}
          defaultValue={data.communityName}
          onBlur={(e) => setCommunityName(e.target.value.trim())}
          placeholder="例如：幸福花園社區（會顯示在列印的未繳名單標題）"
          className={inputClass}
        />
      </Card>

      <Card title="資料備份與還原">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            所有資料只存在<strong>這個瀏覽器</strong>裡。清除瀏覽器資料、換電腦或換手機時資料不會跟著走，請定期備份。
          </p>
          <p>
            上次備份：
            <strong>{data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("zh-TW") : "從未備份"}</strong>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={exportBackup}>
            下載備份檔
          </Button>
          <Button onClick={() => fileRef.current?.click()}>從備份檔還原</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importBackup(file);
            }}
          />
        </div>
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p>
        )}
      </Card>
    </div>
  );
}
