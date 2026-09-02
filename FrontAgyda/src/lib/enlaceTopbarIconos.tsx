import {
  Link2, Phone, Headset, MonitorCog, BarChart3, LifeBuoy, Mail, Globe,
  Rocket, LayoutGrid, Bell, Calendar, Folder, Shield, Zap, type LucideIcon,
} from 'lucide-react'
import type { EnlaceTopbarIcono } from '@/services/personalizacion.service'

export const ENLACE_ICONOS: Record<EnlaceTopbarIcono, LucideIcon> = {
  link: Link2, phone: Phone, headset: Headset, monitor: MonitorCog, chart: BarChart3,
  ticket: LifeBuoy, mail: Mail, globe: Globe, rocket: Rocket, grid: LayoutGrid,
  bell: Bell, calendar: Calendar, folder: Folder, shield: Shield, zap: Zap,
}

export const ENLACE_ICONO_KEYS = Object.keys(ENLACE_ICONOS) as EnlaceTopbarIcono[]
