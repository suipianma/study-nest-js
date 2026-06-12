export interface ApiSuccessResponse<T = unknown> {
  data: T;
  message: string;
  code: number;
}

export interface ApiErrorResponse {
  data: null;
  message: string | string[];
  code: number;
}
