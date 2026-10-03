import type { Workbook, Worksheet } from "exceljs";
import { downloadBlob } from "./download";
import { computePeriod, formatPeriod, hasRecord, shortPeriod, sortHouseholds } from "./logic";
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

export async function exportPeriodExcel(data: AppData, period: string) {
  const workbook = await createWorkbook();
  const { byHousehold, unmatched } = computePeriod(data, period);

  const sheet = workbook.addWorksheet(shortPeriod(period) + "半年");
  sheet.columns = [
    { header: "戶號", key: "unit", width: 14 },
    { header: "住戶姓名", key: "name", width: 16 },
    { header: "狀態", key: "status", width: 10 },
    { header: "繳費方式", key: "method", width: 14 },
    { header: "匯款末五碼", key: "codes", width: 20 },
  ];
  for (const h of sortHouseholds(data.households)) {
    const s = byHousehold.get(h.id)!;
    const methods = [s.codes.length ? "匯款" : "", s.cash ? "現金" : ""].filter(Boolean);
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

  await save(workbook, `管理費_${shortPeriod(period)}半年.xlsx`);
}

/** 匯出多期的繳費總表 */
export async function exportHistoryExcel(data: AppData, periods: string[]) {
  const workbook = await createWorkbook();
  const results = periods.map((p) => (hasRecord(data, p) ? computePeriod(data, p).byHousehold : null));

  const sheet = workbook.addWorksheet("繳費總表");
  sheet.columns = [
    { header: "戶號", key: "unit", width: 14 },
    { header: "住戶姓名", key: "name", width: 16 },
    ...periods.map((p, i) => ({ header: formatPeriod(p), key: `p${i}`, width: 22 })),
    { header: "未繳期數", key: "unpaid", width: 10 },
  ];
  for (const h of sortHouseholds(data.households)) {
    const values: Record<string, string | number> = { unit: h.unit, name: h.name };
    let unpaid = 0;
    results.forEach((byHousehold, i) => {
      const s = byHousehold?.get(h.id);
      if (!s) {
        values[`p${i}`] = "";
      } else if (!s.paid) {
        values[`p${i}`] = "未繳";
        unpaid++;
      } else {
        values[`p${i}`] = s.codes.length ? `匯款 ${s.codes.join("、")}` : "現金";
      }
    });
    values.unpaid = unpaid;
    const row = sheet.addRow(values);
    row.eachCell((cell) => {
      if (cell.value === "未繳") cell.font = { color: { argb: "FFDC2626" }, bold: true };
    });
  }
  styleHeader(sheet);

  await save(workbook, `管理費_繳費總表.xlsx`);
}
