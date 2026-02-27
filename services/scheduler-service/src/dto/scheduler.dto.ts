export interface CreateBookingDto {
  resourceId: string;
  title: string;
  startTime: string;
  endTime: string;
}

export interface UpdateBookingDto {
  title?: string;
  startTime?: string;
  endTime?: string;
}
