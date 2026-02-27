export interface CreateBookingDto {
  resourceId: string;
  title: string;
  start: string;  // ISO 8601
  end: string;
  description?: string;
}

export interface UpdateBookingDto {
  title?: string;
  start?: string;
  end?: string;
  description?: string;
}
