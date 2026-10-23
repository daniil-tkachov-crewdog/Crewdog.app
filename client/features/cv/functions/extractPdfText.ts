const PDFJS_CDN_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_CDN_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

type PdfTextItem = { str?: string };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfJsModule = {
  getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function getPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import(/* @vite-ignore */ PDFJS_CDN_URL) as Promise<PdfJsModule>;
  }
  const pdfJsModule = await pdfJsModulePromise;
  pdfJsModule.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
  return pdfJsModule;
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function extractTextFromBuffer(buffer: ArrayBuffer): Promise<string> {
  const pdfJsModule = await getPdfJsModule();
  const pdf = await pdfJsModule.getDocument({ data: buffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str ?? "").join(" ");
    fullText += `${pageText}\n`;
  }
  return fullText;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return extractTextFromBuffer(buffer);
}
