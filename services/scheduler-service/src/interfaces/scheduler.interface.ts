export interface IResource {
  id: string;
  name: string;
  type: 'equipment' | 'room';
  location?: string;
  isActive: boolean;
}

export interface IBooking {
  id: string;
  resourceId: string;
  userId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvedBy?: string;
  createdAt: string;
}
