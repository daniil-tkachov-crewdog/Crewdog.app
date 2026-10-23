// client/features/cv/functions/generateCvPdf.ts
//
// Lays out a tailored CV as a downloadable PDF with jsPDF.
//
// Everything is positioned by hand in millimetres on A4, because the result
// has to paginate predictably: the footer height is reserved up front and
// each block checks whether it still fits before drawing, so a section
// breaks onto a new page rather than over the footer.

import jsPDF from "jspdf";
import type { CvCustomiseResult } from "@/features/support/api/support";
import crewDogLogo from "@/assets/CrewDog-App-Logo.png";

// A4 dimensions in mm: 210 × 297
const MARGIN = 20;
const FOOTER_H = 14; // reserved mm at page bottom for footer

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// 1 pt = 0.352778 mm; multiply by 1.2 for comfortable line spacing
function lineH(fontSize: number): number {
  return fontSize * 0.352778 * 1.2;
}

export async function generateCvPdf(data: CvCustomiseResult): Promise<void> {
  const cv = data.CV_text_customised;

  const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = crewDogLogo;
  });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210;        // A4 width  in mm — hardcoded to avoid jsPDF unit quirks
  const PH = 297;        // A4 height in mm
  const CW = PW - MARGIN * 2; // 170mm content width

  // ─── Logo — top-right corner, page 1 only ─────────────────────────────────
  const logoH = 20;
  const logoW = 20;
  const logoGap = 3;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const brandW = doc.getTextWidth("CrewDog");
  const logoX = PW - MARGIN - logoW - logoGap - brandW;
  doc.addImage(logoImg, "PNG", logoX, MARGIN, logoW, logoH);
  doc.setTextColor(20, 20, 20);
  doc.text("CrewDog", logoX + logoW + logoGap, MARGIN + logoH * 0.62);

  let y = MARGIN;

  // ─── Page-break guard ──────────────────────────────────────────────────────
  function ensureSpace(needed: number): void {
    if (y + needed > PH - FOOTER_H) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // ─── Horizontal rule ───────────────────────────────────────────────────────
  function hRule(r: number, g: number, b: number, thick: number): void {
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(thick);
    doc.line(MARGIN, y, PW - MARGIN, y);
  }

  // ─── Section header ────────────────────────────────────────────────────────
  function sectionHeader(title: string): void {
    ensureSpace(20);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(59, 130, 246);
    doc.text(title.toUpperCase(), MARGIN, y);
    const tw = doc.getTextWidth(title.toUpperCase());
    y += 1.8;
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + tw, y);
    y += 5;
  }

  // ─── HEADER ────────────────────────────────────────────────────────────────

  // Name
  if (isNonEmpty(cv.Name)) {
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(cv.Name.trim(), MARGIN, y);
    y += lineH(22) + 2;
  }

  // Contact bar  — email  ·  phone  ·  linkedin
  const contacts: string[] = [];
  if (isNonEmpty(cv.Email))        contacts.push(cv.Email.trim());
  if (isNonEmpty(cv.Phone_number)) contacts.push(cv.Phone_number.trim());
  if (isNonEmpty(cv.LinkedIn))     contacts.push(cv.LinkedIn.trim());

  if (contacts.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text(contacts.join("   ·   "), MARGIN, y);
    y += lineH(9) + 5;
  }

  hRule(185, 185, 185, 0.4);
  y += 7;

  // ─── EXPERIENCE ────────────────────────────────────────────────────────────
  const exp = cv.Expirience_custom;
  if (exp) {
    const nonEmptyJobs = Object.values(exp).filter((job) =>
      Object.values(job).some((v) => isNonEmpty(v))
    );

    if (nonEmptyJobs.length > 0) {
      sectionHeader("Experience");

      for (const job of nonEmptyJobs) {
        const entries = Object.entries(job);
        const titleVal =
          entries.find(([k]) => k.toLowerCase().includes("title"))?.[1] ?? "";
        const timeVal =
          entries.find(([k]) => k.toLowerCase().includes("time"))?.[1] ?? "";
        const descVal =
          entries.find(([k]) =>
            k.toLowerCase().includes("description")
          )?.[1] ?? "";

        if (!isNonEmpty(titleVal) && !isNonEmpty(descVal)) continue;

        ensureSpace(16);

        // Job title (left) + timeframe (right) on the same baseline
        if (isNonEmpty(titleVal)) {
          doc.setFontSize(10.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(20, 20, 20);
          const titleMaxW = isNonEmpty(timeVal)
            ? CW - doc.getTextWidth(timeVal.trim()) - 6
            : CW;
          const titleLines = doc.splitTextToSize(titleVal.trim(), titleMaxW);
          doc.text(titleLines, MARGIN, y);

          if (isNonEmpty(timeVal)) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(130, 130, 130);
            const tw = doc.getTextWidth(timeVal.trim());
            doc.text(timeVal.trim(), PW - MARGIN - tw, y);
          }
          y += lineH(10.5) + 1.5;
        } else if (isNonEmpty(timeVal)) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(130, 130, 130);
          doc.text(timeVal.trim(), MARGIN, y);
          y += lineH(9) + 1.5;
        }

        // Description body
        if (isNonEmpty(descVal)) {
          const lines = doc.splitTextToSize(descVal.trim(), CW);
          const blockH = lines.length * lineH(9.5);
          ensureSpace(blockH + 5);
          doc.setFontSize(9.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
          doc.text(lines, MARGIN, y);
          y += blockH + 6;
        } else {
          y += 4;
        }
      }

      y += 2;
    }
  }

  // ─── SKILLS ────────────────────────────────────────────────────────────────
  if (isNonEmpty(cv.Skills_custom)) {
    sectionHeader("Skills");
    const lines = doc.splitTextToSize(cv.Skills_custom.trim(), CW);
    ensureSpace(lines.length * lineH(9.5) + 5);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(lines, MARGIN, y);
    y += lines.length * lineH(9.5) + 7;
  }

  // ─── EDUCATION ─────────────────────────────────────────────────────────────
  if (isNonEmpty(cv.Education)) {
    sectionHeader("Education");
    const lines = doc.splitTextToSize(cv.Education.trim(), CW);
    ensureSpace(lines.length * lineH(9.5) + 5);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(lines, MARGIN, y);
    y += lines.length * lineH(9.5) + 7;
  }

  // ─── CERTIFICATES ──────────────────────────────────────────────────────────
  if (isNonEmpty(cv.Certificates)) {
    sectionHeader("Certificates");
    const lines = doc.splitTextToSize(cv.Certificates.trim(), CW);
    ensureSpace(lines.length * lineH(9.5) + 5);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(lines, MARGIN, y);
  }

  // ─── FOOTER — stamped on every page ────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = PH - 7;

    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, fy - 3.5, PW - MARGIN, fy - 3.5);

    // Brand mark — left
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(150, 150, 150);
    doc.text("Crewdog.app", MARGIN, fy);

    // Page number — right
    doc.setFont("helvetica", "normal");
    doc.setTextColor(185, 185, 185);
    doc.text(`Page ${p} of ${totalPages}`, PW - MARGIN, fy, {
      align: "right",
    });
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  const safeName = isNonEmpty(cv.Name)
    ? cv.Name.trim().replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")
    : "Customised_CV";

  doc.save(`${safeName}_CV.pdf`);
}
