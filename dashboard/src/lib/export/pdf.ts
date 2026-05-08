/**
 * PDF Generation Utility
 * Server-side PDF generation using pdfkit for tabular reports.
 * Runs in Next.js API routes (server environment only).
 */

// Note: pdfkit is a Node.js library used server-side only
// This runs in Next.js API route (server environment)

export async function generatePDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][],
  options?: {
    orientation?: "portrait" | "landscape";
    footerText?: string;
  }
): Promise<Buffer> {
  // Dynamic import for server-side only
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: options?.orientation || "landscape",
      margin: 40,
      info: {
        Title: title,
        Author: "Helix Industrial Gases Pvt Ltd",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Colors (print-friendly: light background, copper accents)
    const copper = "#c87941";
    const darkText = "#1a1c21";
    const lightGray = "#f5f5f5";

    // Header bar
    doc.rect(0, 0, doc.page.width, 60).fill(copper);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#ffffff")
      .text("HELIX INDUSTRIAL GASES PVT LTD", 40, 15);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#ffffff")
      .text(title, 40, 38);

    // Subtitle + date
    doc
      .fillColor(darkText)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `${subtitle} | Generated: ${new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        40,
        75
      );

    // Table
    const tableTop = 100;
    const colWidth = (doc.page.width - 80) / headers.length;

    // Header row
    doc.rect(40, tableTop, doc.page.width - 80, 22).fill(copper);
    headers.forEach((header, i) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#ffffff")
        .text(header, 44 + i * colWidth, tableTop + 6, {
          width: colWidth - 8,
          align: "left",
        });
    });

    // Data rows
    let y = tableTop + 22;
    rows.forEach((row, rowIdx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }

      if (rowIdx % 2 === 0) {
        doc.rect(40, y, doc.page.width - 80, 18).fill(lightGray);
      }

      row.forEach((cell, colIdx) => {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(darkText)
          .text(String(cell), 44 + colIdx * colWidth, y + 4, {
            width: colWidth - 8,
            align: "left",
          });
      });

      y += 18;
    });

    // Footer
    const footerText =
      options?.footerText ||
      "Confidential - Helix Industrial Gases Private Limited";
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#999999")
      .text(footerText, 40, doc.page.height - 30, {
        align: "center",
        width: doc.page.width - 80,
      });

    doc.end();
  });
}
