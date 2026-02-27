/** 자원(장비/회의실) 인터페이스 */
export interface IResource {
  id: string;
  name: string;
  type: 'equipment' | 'room';
  location: string;
  isActive: boolean;
}

/** 예약 인터페이스 */
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
