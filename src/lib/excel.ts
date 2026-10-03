import type { Workbook, Worksheet } from "exceljs";
import { downloadBlob } from "./download";
import { computeMonth, formatMonth, hasRecord, sortHouseholds } from "./logic";
import type { AppData } from "./types";

async function createWorkbook(): Promise<Workbook> {
  // 動態載入，避免 exceljs 拖慢一般頁面
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}

function styleHeader(sheet: Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function save(workbook: Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}

export async function exportMonthExcel(data: AppData, month: string) {
  const workbook = await createWorkbook();
  const { byHousehold, unmatched } = computeMonth(data, month);

  const sheet = workbook.addWorksheet(formatMonth(month));
  sheet.columns = [
    { header: "戶號", key: "unit", width: 14 },
    { header: "住戶姓名", key: "name", width: 16 },
    { header: "狀態", key: "status", width: 10 },
    { header: "繳費方式", key: "method", width: 14 },
    { header: "轉帳末五碼", key: "codes", width: 20 },
  ];
  for (const h of sortHouseholds(data.households)) {
    const s = byHousehold.get(h.id)!;
    const methods = [s.codes.length ? "轉帳" : "", s.cash ? "現金" : ""].filter(Boolean);
    const row = sheet.addRow({
      unit: h.unit,
      name: h.name,
      status: s.paid ? "已繳" : "未繳",
      method: methods.join("、"),
      codes: s.codes.join("、"),
    });
    if (!s.paid) row.getCell("status").font = { color: { argb: "FFDC2626" }, bold: true };
  }
  styleHeader(sheet);

  if (unmatched.length) {
    const other = workbook.addWorksheet("對不到住戶的末五碼");
    other.columns = [{ header: "末五碼", key: "code", width: 14 }];
    unmatched.forEach((code) => other.addRow({ code }));
    styleHeader(other);
  }

  await save(workbook, `管理費_${month}.xlsx`);
}

export async function exportYearExcel(data: AppData, year: number) {
  const workbook = await createWorkbook();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const results = months.map((m) => (hasRecord(data, m) ? computeMonth(data, m).byHousehold : null));

  const sheet = workbook.addWorksheet(`${year} 年`);
  sheet.columns = [
    { header: "戶號", key: "unit", width: 14 },
    { header: "住戶姓名", key: "name", width: 16 },
    ...months.map((_, i) => ({ header: `${i + 1} 月`, key: `m${i}`, width: 8 })),
    { header: "未繳月數", key: "unpaid", width: 10 },
  ];
  for (const h of sortHouseholds(data.households)) {
    const values: Record<string, string | number> = { unit: h.unit, name: h.name };
    let unpaid = 0;
    results.forEach((byHousehold, i) => {
      const s = byHousehold?.get(h.id);
      if (!s) {
        values[`m${i}`] = "";
      } else if (!s.paid) {
        values[`m${i}`] = "未繳";
        unpaid++;
      } else {
        values[`m${i}`] = s.codes.length ? "已繳" : "現金";
      }
    });
    values.unpaid = unpaid;
    const row = sheet.addRow(values);
    row.eachCell((cell) => {
      if (cell.value === "未繳") cell.font = { color: { argb: "FFDC2626" }, bold: true };
    });
  }
  styleHeader(sheet);

  await save(workbook, `管理費_${year}年.xlsx`);
}
