export interface IFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  linkedNoteId?: string;
  createdAt: string;
}
