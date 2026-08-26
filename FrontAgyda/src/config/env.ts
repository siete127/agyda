export const ENV = {
  BACKEND_URL: (import.meta.env.VITE_BACKEND_URL as string) ?? 'http://localhost:8444',
  SOCKET_URL: (import.meta.env.VITE_SOCKET_URL as string) ?? 'http://localhost:8444',
  IS_PROD: import.meta.env.PROD,
} as const
