import { describe, it, expect, vi, afterEach } from "vitest";
import { InternetArchiveSource, LENDING_ONLY_MESSAGE } from "../src/lib/sources/InternetArchiveSource";
import { OpenLibrarySource } from "../src/lib/sources/OpenLibrarySource";
import { LibraryOfCongressSource } from "../src/lib/sources/LibraryOfCongressSource";
import { searchDpla } from "../src/lib/sources/DplaSearch";
import { parsePlainTextChapters } from "../src/lib/parsing/chapters";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const prose = "Call me Ishmael. Some years ago, never mind how long precisely, I went to sea. ".repeat(20);

function mockFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error("unmocked " + url);
    return routes[key]();
  }) as typeof fetch;
  return calls;
}
afterEach(() => vi.restoreAllMocks());

describe("Internet Archive", () => {
  it("searches only free (non-lending) texts", async () => {
    const calls = mockFetch({ advancedsearch: () => json({ response: { docs: [{ identifier: "moby00", title: "Moby Dick", creator: ["Melville"], year: "1851" }] } }) });
    const r = await new InternetArchiveSource().search("moby: dick", 5);
    expect(r[0]).toMatchObject({ id: "moby00", sourceId: "archive", author: "Melville", year: 1851 });
    const q = new URL(calls[0]).searchParams.get("q") ?? "";
    expect(q).toContain("NOT access-restricted-item:true");
    expect(q).not.toContain("moby:"); // user's colon stripped
  });

  it("refuses lending-only items with a clear message", async () => {
    mockFetch({ "/metadata/lent01": () => json({ metadata: { title: "X", "access-restricted-item": "true" }, files: [] }) });
    await expect(new InternetArchiveSource().getContent("lent01")).rejects.toThrow(LENDING_ONLY_MESSAGE);
  });

  it("reads the OCR text of a free item", async () => {
    mockFetch({
      "/metadata/free01": () => json({ metadata: { title: "Free" }, files: [{ name: "free01_djvu.txt", format: "DjVuTXT" }] }),
      "/download/free01/": () => new Response(`CHAPTER I\n\n${prose}\n\nCHAPTER II\n\n${prose}`),
    });
    const c = await new InternetArchiveSource().getContent("free01");
    expect(c.chapters.map((x) => x.title)).toEqual(["CHAPTER I", "CHAPTER II"]);
  });
});

describe("Open Library", () => {
  it("only returns books with free text and encodes where it lives", async () => {
    const calls = mockFetch({
      "search.json": () =>
        json({ docs: [
          { key: "/works/OL1W", title: "Has PG", id_project_gutenberg: ["2701"] },
          { key: "/works/OL2W", title: "Has IA", editions: { docs: [{ ia: ["scan01"], ebook_access: "public" }] } },
          { key: "/works/OL3W", title: "Nothing free" },
        ] }),
    });
    const r = await new OpenLibrarySource().search("whale", 10);
    expect(r.map((x) => x.id)).toEqual(["OL1W~pg-2701", "OL2W~ia-scan01"]);
    expect(new URL(calls[0]).searchParams.get("q")).toContain("ebook_access:public");
  });
});

describe("Library of Congress", () => {
  it("maps search results and backs off when rate-limited", async () => {
    mockFetch({ "selected-digitized-books": () => json({ results: [{ url: "https://www.loc.gov/item/04007587/", title: "Moby Dick", contributor: ["melville, herman"], date: "1892", image_url: ["//tile.loc.gov/x.jpg#h=1"] }] }) });
    const loc = new LibraryOfCongressSource();
    const r = await loc.search("moby dick", 5);
    expect(r[0]).toMatchObject({ id: "04007587", sourceId: "loc", year: 1892, coverUrl: "https://tile.loc.gov/x.jpg" });

    mockFetch({ "selected-digitized-books": () => new Response("<html>captcha</html>", { status: 429 }) });
    await expect(loc.search("another query", 5)).rejects.toThrow(/limiting requests/);
    // cool-down: no further network calls for a while
    const calls = mockFetch({});
    await expect(loc.search("third query", 5)).rejects.toThrow(/limiting requests/);
    expect(calls).toHaveLength(0);
  });
});

describe("DPLA", () => {
  it("keeps only results we can actually read, routed to that library", async () => {
    process.env.DPLA_API_KEY = "k";
    mockFetch({
      "api.dp.la": () =>
        json({ docs: [
          { isShownAt: "https://archive.org/details/scan02", sourceResource: { title: ["A"], creator: ["B"] } },
          { isShownAt: "https://catalog.hathitrust.org/Record/1", sourceResource: { title: "Hathi" } },
          { isShownAt: "https://www.loc.gov/item/2001/", sourceResource: { title: "L" } },
        ] }),
    });
    const r = await searchDpla("x", 10);
    expect(r.map((x) => `${x.sourceId}:${x.id}`)).toEqual(["archive:scan02", "loc:2001"]);
  });
});

describe("parsing scanned books", () => {
  it("ignores running page headers like 'MOBY DICK 23'", () => {
    const pages = Array.from({ length: 6 }, (_, i) => `\nMOBY DICK ${i + 10}\n\n${prose}`).join("\n");
    const text = `CHAPTER I\n\n${prose}\n${pages}\n\nCHAPTER II\n\n${prose}`;
    expect(parsePlainTextChapters(text, "t").map((c) => c.title)).toEqual(["CHAPTER I", "CHAPTER II"]);
  });

  it("splits a giant unstructured scan into parts", () => {
    const text = ("word ".repeat(200) + "\n\n").repeat(150); // 30k words, no headings
    const chapters = parsePlainTextChapters(text, "t");
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toBe("Part 1");
    chapters.forEach((c, i) => { expect(c.index).toBe(i); expect(c.wordCount).toBeLessThanOrEqual(12_000); });
  });
});
