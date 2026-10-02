import type { Book, BookContent, SearchResult } from "@/types";
import type { BookSource } from "./BookSource";
import { getUpload } from "../summarize/cache";

const NOT_FOUND = "Upload not found or expired. Please re-upload the file.";

export class UserUploadSource implements BookSource {
  readonly id = "upload" as const;
  readonly name = "My Upload";

  async search(): Promise<SearchResult[]> {
    // Uploads are not searchable
    return [];
  }

  async getBook(id: string): Promise<Book> {
    const upload = await getUpload(id);
    if (!upload) throw new Error(NOT_FOUND);
    return { id, sourceId: "upload", title: upload.title, author: "Unknown" };
  }

  async getContent(id: string): Promise<BookContent> {
    const upload = await getUpload(id);
    if (!upload) throw new Error(NOT_FOUND);
    return upload.content;
  }
}
