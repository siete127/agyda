import { useParams, Navigate } from 'react-router-dom'
import { SubModuloPlaceholder } from '@/components/ui/SubModuloPlaceholder'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'
import { AREA_LABELS, type AreaKey } from '@/config/areas'

const AREA_PATH_BY_KEY: Record<AreaKey, string> = {
  'direccion-general': '/direccion-general',
  rh: '/rh',
  finanzas: '/finanzas',
  ventas: '/ventas-area',
  operaciones: '/operaciones',
  calidad: '/calidad',
  marketing: '/marketing',
  ti: '/tecnologia',
  'atencion-cliente': '/atencion-cliente',
  legal: '/legal',
}

interface AreaSubModuloPageProps {
  areaKey: AreaKey
}

export function AreaSubModuloPage({ areaKey }: AreaSubModuloPageProps) {
  const { subSlug } = useParams<{ subSlug: string }>()
  const item = AREA_SUB_ITEMS[areaKey]?.find((i) => i.slug === subSlug)

  if (!item || item.kind !== 'placeholder') {
    return <Navigate to={AREA_PATH_BY_KEY[areaKey]} replace />
  }

  return (
    <SubModuloPlaceholder
      areaLabel={AREA_LABELS[areaKey]}
      areaPath={AREA_PATH_BY_KEY[areaKey]}
      itemLabel={item.label}
      description={item.description}
    />
  )
}
