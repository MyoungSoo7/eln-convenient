export type ResourceType = 'equipment' | 'room';
export type BookingStatusType = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface CreateResourceDto {
  name: string;
  type: ResourceType;
  location?: string;
  description?: string;
  capacity?: number;
}

export interface UpdateResourceDto {
  name?: string;
  type?: ResourceType;
  location?: string;
  description?: string;
  capacity?: number;
  isActive?: boolean;
}

export interface CreateBookingDto {
  resourceId: string;
  title: string;
  description?: string;
  startTime: string;   // ISO 8601
  endTime: string;     // ISO 8601
}

export interface UpdateBookingDto {
  title?: string;
  description?: string;
  startTime?: string;  // ISO 8601
  endTime?: string;    // ISO 8601
}

export interface RejectBookingDto {
  reason?: string;
}
