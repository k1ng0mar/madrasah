import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { jsPDF } from "jspdf";

const safe = (s) => (s || "notes").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "notes";
const stamp = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportSubjectDocx(subjectName, notes) {
  const kids = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(subjectName)] }),
    new Paragraph({
      children: [new TextRun({ text: `Study notes · exported ${stamp()}`, color: "64748B", size: 20 })],
    }),
    new Paragraph({ text: "" }),
  ];
  for (const n of notes) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(n.title || "Untitled")] }));
    for (const para of String(n.text || "").split(/\n{2,}|\n/)) {
      if (para.trim()) kids.push(new Paragraph({ children: [new TextRun(para)] }));
    }
    kids.push(new Paragraph({ text: "" }));
  }
  const doc = new Document({
    creator: "Madrasah",
    title: `${subjectName} notes`,
    sections: [{ children: kids }],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `${safe(subjectName)} notes.docx`);
}

export async function exportSubjectPdf(subjectName, notes) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const M = 56;
  const maxW = W - M * 2;
  let y = 72;

  const need = (h) => {
    if (y + h > pdf.internal.pageSize.getHeight() - 56) {
      pdf.addPage();
      y = 72;
    }
  };

  pdf.setFont("times", "bold");
  pdf.setFontSize(22);
  pdf.text(subjectName, M, y);
  y += 22;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(120);
  pdf.text(`Study notes · exported ${stamp()}`, M, y);
  pdf.setTextColor(0);
  y += 30;

  for (const n of notes) {
    pdf.setFont("times", "bold");
    pdf.setFontSize(14);
    const titleLines = pdf.splitTextToSize(n.title || "Untitled", maxW);
    need(titleLines.length * 17 + 8);
    pdf.text(titleLines, M, y);
    y += titleLines.length * 17 + 6;

    pdf.setFont("times", "normal");
    pdf.setFontSize(11);
    const body = pdf.splitTextToSize(String(n.text || ""), maxW);
    const lh = 14.5;
    for (const line of body) {
      need(lh);
      pdf.text(line, M, y);
      y += lh;
    }
    y += 14;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(140);
    pdf.text(`${subjectName} · page ${i} of ${pages}`, M, pdf.internal.pageSize.getHeight() - 32, { align: "left" });
  }
  pdf.setTextColor(0);

  pdf.save(`${safe(subjectName)} notes.pdf`);
}
