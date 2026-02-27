/** 전자서명 인터페이스 */
export interface ISignature {
  id: string;
  noteId: string;
  signerId: string;
  signatureHash: string;
  timestamp: string;
  status: 'valid' | 'revoked';
}

/** 감사로그 인터페이스 */
export interface IAuditLog {
  id: string;
  entityType: 'note' | 'inventory' | 'booking' | 'user';
  entityId: string;
  action: 'created' | 'updated' | 'signed' | 'exported' | 'deleted';
  actorId: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

/** 내보내기 작업 인터페이스 */
export interface IExportJob {
  id: string;
  noteId: string;
  format: 'pdf' | 'zip';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  requestedBy: string;
  createdAt: string;
}
