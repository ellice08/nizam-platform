export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export const ApiResponse = {
  success<T>(data: T, message = 'Success'): ApiSuccessResponse<T> {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
    };
  },

  error(error: string, message = 'An error occurred'): ApiErrorResponse {
    return {
      success: false,
      error,
      message,
      timestamp: new Date().toISOString(),
    };
  },
};
