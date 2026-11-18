import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { APP } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import {
  REPORTS,
  type ReportFilters,
  type ReportSection,
  type ReportTipo,
} from "./types";

export { REPORTS, type ReportFilters, type ReportSection, type ReportTipo };

export function getReportDefinition(tipo: string) {
  return REPORTS.find((report) => report.tipo === (tipo === "contratos-vencimento" ? "contratos-cobertura" : tipo));
}

export function reportFileName(tipo: ReportTipo) {
  return `${tipo}.pdf`;
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return formatDateTime(value);
  return String(value);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  description?: string,
  filtersSummary?: string[],
) {
  const startX = doc.page.margins.left;
  const startY = doc.page.margins.top;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const logoPath = path.join(process.cwd(), "public", "raroclients-logo.jpeg");
  const hasLogo = fs.existsSync(logoPath);
  const logoSize = 40;

  let textX = startX;
  let textWidth = contentWidth;

  if (hasLogo) {
    try {
      doc.image(logoPath, startX, startY, { width: logoSize, height: logoSize });
      textX = startX + logoSize + 12;
      textWidth = contentWidth - (logoSize + 12);
    } catch {
      // Se falhar o carregamento da imagem, mantém sem quebrar
    }
  }

  doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("RAROCLIENTS  •  GESTÃO DE CLIENTES", textX, startY, {
    width: textWidth,
  });
  doc.moveDown(0.2);

  doc.fillColor("#0f172a").fontSize(16).font("Helvetica-Bold").text(title, textX, doc.y, {
    width: textWidth,
  });
  doc.moveDown(0.2);

  if (description) {
    doc.fillColor("#64748b").fontSize(8.5).font("Helvetica").text(description, textX, doc.y, {
      width: textWidth,
    });
    doc.moveDown(0.2);
  }

  const headerBottomY = Math.max(doc.y, startY + logoSize) + 8;
  doc
    .strokeColor("#e2e8f0")
    .lineWidth(0.75)
    .moveTo(startX, headerBottomY)
    .lineTo(startX + contentWidth, headerBottomY)
    .stroke();

  doc.y = headerBottomY + 8;

  if (filtersSummary && filtersSummary.length > 0) {
    doc.fillColor("#475569").fontSize(8).font("Helvetica-Bold").text("Filtros aplicados: ", startX, doc.y, {
      continued: true,
    });
    doc.fillColor("#64748b").font("Helvetica").text(filtersSummary.join("   |   "));
  } else {
    doc.fillColor("#64748b").fontSize(8).font("Helvetica").text("Filtros aplicados: Todos os registros", startX, doc.y);
  }

  doc.moveDown(0.8);
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  pageIndex: number,
  totalPages: number,
  issuedAt: string,
  filtersSummary?: string[],
) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineY = doc.page.height - 44;
  const textY1 = lineY + 6;
  const textY2 = lineY + 17;

  // Temporariamente zera a margem inferior para o PDFKit não criar páginas extras automaticamente
  const oldBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  // Linha horizontal separadora
  doc.strokeColor("#e2e8f0").lineWidth(0.6).moveTo(left, lineY).lineTo(left + width, lineY).stroke();

  // Linha 1: Mensagem institucional e data/hora de emissão (esquerda)
  doc
    .fillColor("#64748b")
    .fontSize(7.5)
    .font("Helvetica")
    .text(`Relatório gerado pelo Raroclients  •  Emitido em ${issuedAt}`, left, textY1, {
      width: width - 90,
      lineBreak: false,
    });

  // Linha 1: Paginação (direita)
  doc
    .fillColor("#64748b")
    .fontSize(7.5)
    .font("Helvetica")
    .text(`Página ${pageIndex + 1} de ${totalPages}`, left + width - 90, textY1, {
      width: 90,
      align: "right",
      lineBreak: false,
    });

  // Linha 2: Resumo dos filtros selecionados
  const filtersText =
    filtersSummary && filtersSummary.length > 0
      ? `Filtros: ${filtersSummary.join("  |  ")}`
      : "Filtros: Todos os registros";

  doc
    .fillColor("#94a3b8")
    .fontSize(7)
    .font("Helvetica")
    .text(filtersText, left, textY2, {
      width: width,
      ellipsis: true,
      lineBreak: false,
    });

  doc.page.margins.bottom = oldBottomMargin;
}

function drawSection(doc: PDFKit.PDFDocument, section: ReportSection) {
  ensureSpace(doc, 70);
  doc.x = doc.page.margins.left;
  doc.fillColor("#111827").fontSize(12).font("Helvetica-Bold").text(section.title, doc.page.margins.left);
  doc.moveDown(0.4);

  if (section.rows.length === 0) {
    doc.fillColor("#64748b").fontSize(9).font("Helvetica").text(section.empty ?? "Nenhum registro encontrado.", doc.page.margins.left);
    doc.moveDown(1);
    doc.x = doc.page.margins.left;
    return;
  }

  const headers = section.headers;
  const rows = headers ? [headers, ...section.rows] : section.rows;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = Math.max(...rows.map((row) => row.length));
  const colWidth = tableWidth / columns;

  rows.forEach((row, index) => {
    const isHeader = Boolean(headers && index === 0);
    const cells = Array.from({ length: columns }, (_, cellIndex) => text(row[cellIndex]));
    const heights = cells.map((cell) => doc.heightOfString(cell, { width: colWidth - 8 }));
    const rowHeight = Math.max(22, ...heights) + 8;
    ensureSpace(doc, rowHeight);

    const startY = doc.y;
    doc.rect(doc.page.margins.left, startY, tableWidth, rowHeight).fill(isHeader ? "#e5e7eb" : index % 2 === 0 ? "#f8fafc" : "#ffffff");
    cells.forEach((cell, cellIndex) => {
      doc
        .fillColor(isHeader ? "#111827" : "#374151")
        .fontSize(isHeader ? 8 : 7.5)
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .text(cell, doc.page.margins.left + cellIndex * colWidth + 4, startY + 5, {
          width: colWidth - 8,
          lineGap: 1,
        });
    });
    doc.y = startY + rowHeight;
  });
  doc.x = doc.page.margins.left;
  doc.moveDown(1);
}

function pdfToBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function generateReportPdf(tipo: ReportTipo, filters: ReportFilters = {}) {
  const definition = getReportDefinition(tipo);
  if (!definition) throw new Error("Relatorio nao encontrado.");

  const { loadReportDataAndSections } = await import("./loaders");
  const { sections, filtersSummary } = await loadReportDataAndSections(definition.tipo as ReportTipo, filters);
  const issuedAt = formatDateTime(new Date());

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 36, bottom: 50, left: 36, right: 36 },
    bufferPages: true,
  });

  drawHeader(doc, definition.title, definition.description, filtersSummary);

  if (sections.length === 0) {
    drawSection(doc, { title: definition.title, rows: [], empty: "Nenhum dado disponivel para este relatorio." });
  } else {
    sections.forEach((section) => drawSection(doc, section));
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    drawFooter(doc, i, pages.count, issuedAt, filtersSummary);
  }

  return pdfToBuffer(doc);
}

export function reportQueryString(filters: ReportFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val) params.set(key, String(val));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function reportLinks(filters: ReportFilters = {}) {
  const qs = reportQueryString(filters);
  return REPORTS.map((report) => ({
    ...report,
    href: `/api/relatorios/${report.tipo}/pdf${qs}`,
  }));
}
