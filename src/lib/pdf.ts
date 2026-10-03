/**
 * 產生名單 PDF。
 * 中文字型檔動輒數 MB，不適合內嵌到 PDF，所以改用 canvas 以系統字型把每一頁畫成 A4 圖片，再放進 PDF。
 */

export type PdfColumn<T> = {
  header: string;
  width: number;
  value: (row: T, index: number) => string;
  /** 文字顏色，未指定為黑色 */
  color?: (row: T) => string | undefined;
};

// A4 @150dpi
const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 100;
const ROW_H = 60;
const TITLE_H = 170;
const FOOTER_H = 60;
const FONT_FAMILY = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result && ctx.measureText(result + "…").width > maxWidth) result = result.slice(0, -1);
  return result + "…";
}

function drawPage<T>(options: {
  title: string;
  subtitle: string;
  columns: PdfColumn<T>[];
  rows: T[];
  startIndex: number;
  showTitle: boolean;
  pageNumber: number;
  pageCount: number;
}): HTMLCanvasElement {
  const { title, subtitle, columns, rows, startIndex, showTitle, pageNumber, pageCount } = options;
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";

  let y = MARGIN;
  if (showTitle) {
    ctx.textAlign = "center";
    ctx.font = `bold 44px ${FONT_FAMILY}`;
    ctx.fillText(fitText(ctx, title, PAGE_W - MARGIN * 2), PAGE_W / 2, y + 30);
    ctx.font = `26px ${FONT_FAMILY}`;
    ctx.fillStyle = "#444444";
    ctx.fillText(subtitle, PAGE_W / 2, y + 95);
    ctx.fillStyle = "#000000";
    y += TITLE_H;
  }

  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const drawRow = (cells: { text: string; color?: string }[], header: boolean) => {
    if (header) {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(MARGIN, y, tableWidth, ROW_H);
      ctx.fillStyle = "#000000";
    }
    ctx.font = `${header ? "bold " : ""}28px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    let x = MARGIN;
    cells.forEach(({ text, color }, i) => {
      const width = columns[i].width;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, ROW_H);
      ctx.fillStyle = color ?? "#000000";
      ctx.fillText(fitText(ctx, text, width - 32), x + 16, y + ROW_H / 2);
      ctx.fillStyle = "#000000";
      x += width;
    });
    y += ROW_H;
  };

  drawRow(columns.map((c) => ({ text: c.header })), true);
  rows.forEach((row, i) =>
    drawRow(columns.map((c) => ({ text: c.value(row, startIndex + i), color: c.color?.(row) })), false),
  );

  ctx.font = `22px ${FONT_FAMILY}`;
  ctx.fillStyle = "#666666";
  ctx.textAlign = "center";
  ctx.fillText(`第 ${pageNumber} / ${pageCount} 頁`, PAGE_W / 2, PAGE_H - MARGIN / 2 - 10);
  return canvas;
}

export async function exportListPdf<T>(options: {
  title: string;
  subtitle: string;
  columns: PdfColumn<T>[];
  rows: T[];
  filename: string;
}) {
  const { jsPDF } = await import("jspdf");
  const { rows } = options;

  // 第一頁有標題，可放的列數比較少；每頁都要扣掉表頭一列
  const usable = PAGE_H - MARGIN * 2 - FOOTER_H;
  const firstPageRows = Math.floor((usable - TITLE_H) / ROW_H) - 1;
  const otherPageRows = Math.floor(usable / ROW_H) - 1;
  const pages: T[][] = [rows.slice(0, firstPageRows)];
  for (let i = firstPageRows; i < rows.length; i += otherPageRows) pages.push(rows.slice(i, i + otherPageRows));

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let startIndex = 0;
  pages.forEach((pageRows, i) => {
    if (i > 0) doc.addPage();
    const canvas = drawPage({
      ...options,
      rows: pageRows,
      startIndex,
      showTitle: i === 0,
      pageNumber: i + 1,
      pageCount: pages.length,
    });
    doc.addImage(canvas, "PNG", 0, 0, 210, 297);
    startIndex += pageRows.length;
  });
  doc.save(options.filename);
}
