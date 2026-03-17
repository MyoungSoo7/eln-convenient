export interface IFileMeta {
  id: string;
  key: string;                    // MinIO object key (uuid.ext)
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  linkedEntityType?: 'note' | 'protocol' | 'inventory' | null;
  linkedEntityId?: string | null;
  createdAt: string;
}
