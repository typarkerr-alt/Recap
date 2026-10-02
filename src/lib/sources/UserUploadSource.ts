import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { getUpload } from "../summarize/cache";

export class UserUploadSource implements BookSource {
  readonly id = "upload" as const;
  readonly name = "My Upload";

  async search(): Promise<SearchResult[]> {
    // Uploads are not searchable
    return [];
  }

  async getBook(id: string): Promise<Book> {
    const content = getUpload(id);
    if (!content) throw new Error("Upload not found. Please re-upload the file.");
    return {
      id,
      sourceId: "upload",
      title: `Uploaded Book`,
      author: "Unknown",
    };
  }

  async getContent(id: string): Promise<BookContent> {
    const content = getUpload(id);
    if (!content) throw new Error("Upload not found. Please re-upload the file.");
    return content;
  }
}
