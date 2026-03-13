export interface ISignature {
  id: string;
  noteId: string;
  signerId: string;
  signatureHash: string;
  timestamp: string;
  status: 'valid' | 'revoked';
}

export interface IAuditLog {
  id: string;
  entityType: 'note' | 'inventory' | 'booking' | 'user';
  entityId: string;
  action: 'created' | 'updated' | 'signed' | 'exported' | 'deleted' | 'admin_unlock';
  actorId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface IExportJob {
  id: string;
  noteId: string;
  format: 'pdf' | 'zip';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  createdAt: string;
  completedAt?: string;
}
