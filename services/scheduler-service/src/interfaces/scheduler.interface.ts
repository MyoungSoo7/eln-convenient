export interface IResource {
  id: string;
  name: string;
  type: 'equipment' | 'room';
  location?: string | null;
  description?: string | null;
  capacity?: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface IBooking {
  id: string;
  resourceId: string;
  userId: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvedBy?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
}
