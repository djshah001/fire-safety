import axios from 'axios';

export type ApiEnvelope<T> = {
  data: T;
  requestId: string;
  meta?: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Array<{ path: string; message: string }>;
  };
  requestId: string;
};

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function readCookie(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : undefined;
}

apiClient.interceptors.request.use((config) => {
  if (!safeMethods.has((config.method ?? 'GET').toUpperCase())) {
    const csrfToken = readCookie('fs_csrf');
    if (csrfToken) config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});

export function getApiErrorMessage(error: unknown, fallback = 'The request could not be completed.') {
  if (axios.isAxiosError<ApiErrorEnvelope>(error)) {
    return error.response?.data.error.message ?? fallback;
  }
  return fallback;
}
