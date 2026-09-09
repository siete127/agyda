import { clsx } from 'clsx'

// Primer componente de tabs compartido del repo (Fase 7 del rediseño de
// Atención al Cliente). Extrae el patrón que cada página venía haciendo a
// mano: contenedor gris con "pills". Se usa tanto para tabs de nivel superior
// como para sub-tabs internos (variant="sub").
export interface TabItem<K extends string = string> {
  key: K
  label: string
  icon?: React.ElementType
  badge?: number | string
}

interface TabsProps<K extends string> {
  tabs: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  variant?: 'main' | 'sub'
  className?: string
}

export function Tabs<K extends string>({ tabs, value, onChange, variant = 'main', className }: TabsProps<K>) {
  const sub = variant === 'sub'
  return (
    <div
      className={clsx(
        'flex flex-wrap w-fit',
        sub ? 'gap-1 rounded-lg bg-gray-50 p-0.5' : 'gap-1 rounded-xl bg-gray-100 p-1',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={clsx(
              'flex items-center gap-1.5 font-semibold transition-all',
              sub ? 'rounded-md px-2.5 py-1 text-[0.7rem]' : 'rounded-lg px-3 py-1.5 text-[0.75rem]',
              active ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t.icon && <t.icon className={sub ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
            {t.label}
            {t.badge !== undefined && t.badge !== '' && t.badge !== 0 && (
              <span className={clsx(
                'rounded-full bg-gray-200 px-1.5 text-[0.6rem] font-bold text-gray-600',
                active && 'bg-brand/10 text-brand',
              )}>
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
