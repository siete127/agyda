import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  activeRoute: string
  isMobileMenuOpen: boolean
  // Editor del dashboard.
  //  · armed: el topbar muestra el botón "Editar diseño" (se activa desde
  //    Configuración → Diseño del inicio → "Ir al Inicio").
  //  · mode:  el editor del dashboard está activo ahora mismo.
  dashboardEditArmed: boolean
  dashboardEditMode: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setActiveRoute: (route: string) => void
  setMobileMenuOpen: (v: boolean) => void
  setDashboardEditArmed: (v: boolean) => void
  setDashboardEditMode: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeRoute: '/dashboard',
      isMobileMenuOpen: false,
      dashboardEditArmed: false,
      dashboardEditMode: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setActiveRoute: (route) => set({ activeRoute: route }),
      setMobileMenuOpen: (v) => set({ isMobileMenuOpen: v }),
      setDashboardEditArmed: (v) => set({ dashboardEditArmed: v }),
      setDashboardEditMode: (v) => set({ dashboardEditMode: v }),
    }),
    {
      name: 'ui-store',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
)
