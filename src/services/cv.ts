// Uploads a CV (PDF) to the backend and gets back its decoded plain text,
// which the chat can attach to the user's prompt.

export type AttachedCv = { name: string; text: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export async function extractCv(file: File): Promise<AttachedCv> {
  if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    throw new Error("Only PDF files are supported.");
  }
  const dataBase64 = await fileToBase64(file);
  const res = await fetch("/api/extract-cv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataBase64, filename: file.name }),
  });
  if (!res.ok) {
    let msg = "Couldn't read the PDF.";
    try {
      const d = await res.json();
      msg = d?.error || msg;
    } catch {
      /* non-JSON */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return { name: data?.filename || file.name, text: String(data?.text || "") };
}
