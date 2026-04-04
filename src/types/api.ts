export interface SuccessResponse<T> {
  message: string;
  data: T;
}

export interface ErrorResponse {
  message: string;
}
