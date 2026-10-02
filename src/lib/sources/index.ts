import type { BookSource } from "./BookSource";
import { GutenbergSource } from "./GutenbergSource";
import { OpenLibrarySource } from "./OpenLibrarySource";
import { InternetArchiveSource } from "./InternetArchiveSource";
import { LibraryOfCongressSource } from "./LibraryOfCongressSource";
import { UserUploadSource } from "./UserUploadSource";
import type { SourceId } from "@/types";

export { searchDpla, dplaEnabled } from "./DplaSearch";

// Order = priority in search results (cleanest text first)
const sources: BookSource[] = [
  new GutenbergSource(),
  new OpenLibrarySource(),
  new InternetArchiveSource(),
  new LibraryOfCongressSource(),
  new UserUploadSource(),
];

const sourceMap = new Map<SourceId, BookSource>(sources.map((s) => [s.id, s]));

export function getSource(id: SourceId): BookSource {
  const source = sourceMap.get(id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}

export function getAllSources(): BookSource[] {
  return sources;
}

/** Sources that support search (uploads don't) */
export function getSearchableSources(): BookSource[] {
  return sources.filter((s) => s.id !== "upload");
}
