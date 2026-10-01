import type { BookSource } from "./BookSource";
import { GutenbergSource } from "./GutenbergSource";
import { OpenLibrarySource } from "./OpenLibrarySource";
import { StandardEbooksSource } from "./StandardEbooksSource";
import { UserUploadSource } from "./UserUploadSource";
import type { SourceId } from "@/types";

const sources: BookSource[] = [
  new GutenbergSource(),
  new OpenLibrarySource(),
  new StandardEbooksSource(),
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
