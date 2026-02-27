/** 파일 메타데이터 인터페이스 */
export interface IFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;   // MinIO 경로
  uploadedBy: string;
  createdAt: string;
}
