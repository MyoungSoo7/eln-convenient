export interface FileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  uploadedBy: string;
  uploadedAt: string;
  linkedEntity?: {
    type: 'note' | 'protocol' | 'inventory';
    id: string;
  };
}
