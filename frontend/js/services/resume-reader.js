/* Reading a resume in the browser: text from a PDF, Word (.docx) or .txt file, then the skills in it.
   Nothing is sent anywhere to read it. PDFs use pdf.js from cdnjs, loaded only when a PDF is picked,
   with integrity hashes so a changed file is refused. Word files are zip files: unzipped here. */
const RESUME_MAX = 2 * 1024 * 1024;
const RESUME_KINDS = { pdf: "PDF", docx: "Word", txt: "Text" };
const resumeKind = name => {
  const x = String(name || "")
    .toLowerCase()
    .match(/\.([a-z]+)$/)?.[1];
  return RESUME_KINDS[x] ? x : null;
};
const fileSize = n =>
  n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";

// Why a file can't be used, or "" when it is fine
function resumeProblem(file) {
  if (/\.doc$/i.test(file.name))
    return "Old Word (.doc) files can't be read. In Word, use Save as → PDF or .docx, then upload that.";
  if (!resumeKind(file.name)) return "Upload a PDF or Word (.docx) file.";
  if (!file.size) return "This file is empty.";
  if (file.size > RESUME_MAX) return `This file is ${fileSize(file.size)}. The limit is 2 MB.`;
  return "";
}

async function resumeText(file) {
  const kind = resumeKind(file.name);
  if (kind === "txt") return await file.text();
  if (kind === "docx") return docxText(await file.arrayBuffer());
  if (kind === "pdf") return pdfText(await file.arrayBuffer());
  throw new Error("Upload a PDF or Word (.docx) file.");
}

/* PDF: pdf.js 3.11.174, worker run on the page (a resume is small), both checked by integrity hash */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const PDFJS_SRI = {
  "pdf.min.js":
    "sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==",
  "pdf.worker.min.js":
    "sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==",
};
let pdfjsReady = null;
function loadScript(name) {
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = PDFJS + name;
    s.integrity = PDFJS_SRI[name];
    s.crossOrigin = "anonymous";
    s.onload = ok;
    s.onerror = () => fail(new Error("Couldn't load the PDF reader. Check your internet and try again."));
    document.head.appendChild(s);
  });
}
function loadPdfjs() {
  return (pdfjsReady ||= loadScript("pdf.min.js")
    .then(() => loadScript("pdf.worker.min.js"))
    .then(() => window.pdfjsLib)
    .catch(e => {
      pdfjsReady = null;
      throw e;
    }));
}
async function pdfText(buf) {
  const lib = await loadPdfjs();
  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  } catch (e) {
    throw new Error(
      e?.name === "PasswordException"
        ? "This PDF has a password. Upload one without a password."
        : "This PDF couldn't be opened. Try saving it again as PDF."
    );
  }
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map(t => t.str + (t.hasEOL ? "\n" : " ")).join(""));
  }
  doc.destroy();
  return pages.join("\n");
}

/* Word (.docx): find word/document.xml in the zip, inflate it, keep the text of each paragraph */
async function docxText(buf) {
  const xml = await unzipFile(buf, "word/document.xml");
  if (xml == null) throw new Error("This Word file couldn't be read. Try saving it again as .docx or PDF.");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
async function unzipFile(buf, want) {
  const v = new DataView(buf),
    u8 = new Uint8Array(buf);
  let end = -1; // "end of central directory" record, near the end of the file
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return null;
  let p = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n > 0; n--) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true),
      size = v.getUint32(p + 20, true),
      nameLen = v.getUint16(p + 28, true);
    const skip = nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true),
      local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === want) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true),
        raw = u8.subarray(start, start + size);
      if (method === 0) return new TextDecoder().decode(raw);
      if (method !== 8) return null;
      const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(out).text();
    }
    p += 46 + skip;
  }
  return null;
}

// Skills in the text, the most mentioned first: ["java", "selenium", ...]
function findSkills(text) {
  const t =
    " " +
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ") +
    " ";
  return RESUME_SKILLS.map(([skill, words]) => [
    skill,
    words.reduce((n, w) => n + (hasWord(t, w) ? t.split(w).length - 1 : 0), 0),
  ])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
}
