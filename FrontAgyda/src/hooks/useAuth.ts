import { useAuthStore } from '@/stores/auth.store'

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}

export function useIsAuthenticated() {
  return useAuthStore((s) => s.isAuthenticated)
}

export function useIsAdmin() {
  return useAuthStore((s) => s.isAdmin())
}

export function useIsADorTI() {
  return useAuthStore((s) => s.isADorTI())
}

export function useAuthLoading() {
  return useAuthStore((s) => s.isLoading)
}

export function useAuthError() {
  return useAuthStore((s) => s.error)
}
