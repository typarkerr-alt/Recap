import type { Book, BookContent, SearchResult, SourceId } from "@/types";

export interface BookSource {
  readonly id: SourceId;
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  getBook(id: string): Promise<Book>;
  getContent(id: string): Promise<BookContent>;
}
