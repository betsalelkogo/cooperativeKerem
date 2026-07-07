import { unzipSync, strFromU8 } from "fflate";

/**
 * Minimal, tolerant .xlsx reader.
 *
 * Real-world exports (e.g. PayBox / .NET "loose" OPC packages) often use
 * namespaced XML (`<x:row>`, `<x:c>`) and non-standard package metadata that
 * strict libraries (exceljs) reject. This reader only needs the first sheet's
 * cell values as text, so it parses the few parts it cares about directly and
 * ignores everything else. All tag matching allows an optional namespace prefix.
 */

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (_match, code: string) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _match;
    }
    return XML_ENTITIES[code] ?? _match;
  });
}

/** Concatenate the text of all <t> nodes inside a chunk of shared-string XML. */
function extractTextNodes(chunk: string): string {
  const matches = chunk.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g);
  let out = "";
  for (const m of matches) out += decodeXml(m[1]);
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const items: string[] = [];
  const siRegex = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    items.push(extractTextNodes(m[1]));
  }
  return items;
}

/** Convert a cell reference like "AB12" to a zero-based column index. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]+/g, "").toUpperCase();
  let index = 0;
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
}

function getAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function pickFirstWorksheetPath(files: Record<string, Uint8Array>): string | undefined {
  const relsRaw = files["xl/_rels/workbook.xml.rels"];
  const workbookRaw = files["xl/workbook.xml"];
  if (relsRaw && workbookRaw) {
    const workbook = strFromU8(workbookRaw);
    const firstSheet = workbook.match(/<(?:\w+:)?sheet\b[^>]*>/);
    const rid = firstSheet
      ? getAttr(firstSheet[0], "r:id") ?? getAttr(firstSheet[0], "id")
      : undefined;
    if (rid) {
      const rels = strFromU8(relsRaw);
      const relRegex = /<Relationship\b[^>]*>/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRegex.exec(rels)) !== null) {
        if (getAttr(rm[0], "Id") === rid) {
          let target = getAttr(rm[0], "Target") ?? "";
          target = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
          const full = `xl/${target}`;
          if (files[full]) return full;
        }
      }
    }
  }
  return Object.keys(files).find(
    (name) => name.startsWith("xl/worksheets/") && name.endsWith(".xml")
  );
}

/**
 * Parse the first worksheet of an .xlsx buffer into a dense grid of trimmed
 * strings. Empty cells become "". Throws if the file isn't a readable xlsx.
 */
export function readXlsxRows(buffer: ArrayBuffer | Uint8Array): string[][] {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("הקובץ אינו קובץ Excel תקין");
  }

  const sheetPath = pickFirstWorksheetPath(files);
  if (!sheetPath || !files[sheetPath]) {
    throw new Error("לא נמצא גיליון בקובץ");
  }

  const sharedRaw = files["xl/sharedStrings.xml"];
  const sharedStrings = sharedRaw ? parseSharedStrings(strFromU8(sharedRaw)) : [];

  const sheetXml = strFromU8(files[sheetPath]);
  const rows: string[][] = [];

  const rowRegex = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  const cellRegex =
    /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowBody = rowMatch[1];
    const rowCells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    let autoCol = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const ref = getAttr(attrs, "r");
      const type = getAttr(attrs, "t");
      const col = ref ? columnIndex(ref) : autoCol;
      autoCol = col + 1;

      let value = "";
      if (type === "inlineStr") {
        value = extractTextNodes(inner);
      } else {
        const vMatch = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
        const raw = vMatch ? decodeXml(vMatch[1]) : "";
        if (type === "s") {
          const idx = Number.parseInt(raw, 10);
          value = Number.isFinite(idx) ? sharedStrings[idx] ?? "" : "";
        } else {
          value = raw;
        }
      }

      rowCells[col] = value.trim();
    }

    for (let i = 0; i < rowCells.length; i++) {
      if (rowCells[i] === undefined) rowCells[i] = "";
    }
    rows.push(rowCells);
  }

  return rows;
}
