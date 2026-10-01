import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Chapter } from "@/types";
import { stripHtml, countWords, createVirtualPages } from "./chapters";
import type { BookContent } from "@/types";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export async function parseEpub(buffer: Buffer, bookId: string): Promise<BookContent> {
  const zip = await JSZip.loadAsync(buffer);

  // Find OPF path from META-INF/container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const container = xmlParser.parse(containerXml);
  const rootfile =
    container?.container?.rootfiles?.rootfile?.["@_full-path"] ||
    container?.container?.rootfiles?.rootfile?.[0]?.["@_full-path"];

  if (!rootfile) throw new Error("Invalid EPUB: cannot find OPF path");

  const opfDir = rootfile.includes("/") ? rootfile.substring(0, rootfile.lastIndexOf("/") + 1) : "";

  const opfXml = await zip.file(rootfile)?.async("string");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  const opf = xmlParser.parse(opfXml);
  const pkg = opf?.package;

  // Build manifest: id -> href
  const manifestItems: Record<string, string> = {};
  const rawManifest = pkg?.manifest?.item;
  const manifestArr = Array.isArray(rawManifest) ? rawManifest : rawManifest ? [rawManifest] : [];
  for (const item of manifestArr) {
    const id = item["@_id"];
    const href = item["@_href"];
    const mt = item["@_media-type"] ?? "";
    if (id && href && (mt.includes("html") || mt.includes("xhtml"))) {
      manifestItems[id] = href;
    }
  }

  // Spine: reading order
  const rawSpine = pkg?.spine?.itemref;
  const spineArr = Array.isArray(rawSpine) ? rawSpine : rawSpine ? [rawSpine] : [];
  const spineIds: string[] = spineArr.map((s: Record<string, string>) => s["@_idref"]).filter(Boolean);

  // Try to get chapter titles from NCX or nav document
  const chapterTitles = await extractTocTitles(zip, opfDir, pkg);

  // Read each spine item
  const chapters: Chapter[] = [];
  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const href = manifestItems[id];
    if (!href) continue;

    const fullPath = opfDir + href;
    const html = await zip.file(fullPath)?.async("string");
    if (!html) continue;

    const content = stripHtml(html).trim();
    if (content.length < 100) continue;

    const title = chapterTitles[i] || inferTitleFromHtml(html) || `Chapter ${chapters.length + 1}`;

    chapters.push({
      id: `${bookId}-ch${chapters.length}`,
      index: chapters.length,
      title,
      content,
      wordCount: countWords(content),
    });
  }

  if (chapters.length === 0) throw new Error("Could not extract chapters from EPUB");

  return {
    bookId,
    sourceId: "upload",
    chapters,
    virtualPages: createVirtualPages(chapters),
    totalWordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
  };
}

async function extractTocTitles(zip: JSZip, opfDir: string, pkg: Record<string, unknown>): Promise<string[]> {
  try {
    // Try EPUB3 nav doc
    const nav = await findNavDoc(zip, opfDir, pkg);
    if (nav) return nav;

    // Try NCX
    const ncxFile = Object.keys(zip.files).find((f) => f.endsWith(".ncx"));
    if (!ncxFile) return [];
    const ncxXml = await zip.file(ncxFile)?.async("string");
    if (!ncxXml) return [];
    const ncx = xmlParser.parse(ncxXml);
    const navPoints = ncx?.ncx?.navMap?.navPoint;
    const arr = Array.isArray(navPoints) ? navPoints : navPoints ? [navPoints] : [];
    return arr.map((np: Record<string, unknown>) => {
      const label = (np as Record<string, unknown>)?.navLabel;
      if (typeof label === "object" && label && "text" in label) {
        return String((label as Record<string, unknown>).text);
      }
      return "";
    });
  } catch {
    return [];
  }
}

async function findNavDoc(zip: JSZip, opfDir: string, pkg: Record<string, unknown>): Promise<string[] | null> {
  try {
    const manifest = (pkg as Record<string, unknown>)?.manifest as Record<string, unknown>;
    const items = (manifest?.item as unknown[]) ?? [];
    const itemArr = Array.isArray(items) ? items : [items];
    const navItem = itemArr.find(
      (i) =>
        typeof i === "object" &&
        i !== null &&
        (i as Record<string, string>)["@_properties"] === "nav"
    ) as Record<string, string> | undefined;
    if (!navItem) return null;

    const navPath = opfDir + navItem["@_href"];
    const navHtml = await zip.file(navPath)?.async("string");
    if (!navHtml) return null;

    const matches = [...navHtml.matchAll(/<li[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi)];
    return matches.map((m) => stripHtml(m[1]).trim());
  } catch {
    return null;
  }
}

function inferTitleFromHtml(html: string): string {
  const h = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
  if (h) return stripHtml(h[1]).trim();
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (title) return stripHtml(title[1]).trim();
  return "";
}
