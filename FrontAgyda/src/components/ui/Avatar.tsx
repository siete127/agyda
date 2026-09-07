import { clsx } from 'clsx'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  ring?: 'white' | 'brand'
  /** Punto de estado (ej. disponibilidad) sobre la esquina inferior derecha. */
  statusDot?: 'online' | 'offline'
}

const sizeClasses = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }
const ringClasses = { white: 'ring-2 ring-white', brand: 'ring-2 ring-brand' }
const dotSizeClasses = { sm: 'h-2 w-2', md: 'h-2.5 w-2.5', lg: 'h-3 w-3' }

function getColorFromName(name: string): string {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

export function Avatar({ src, name, size = 'md', ring = 'white', statusDot }: AvatarProps) {
  const dot = statusDot && (
    <span
      className={clsx(
        'absolute bottom-0 right-0 rounded-full ring-2 ring-white',
        dotSizeClasses[size],
        statusDot === 'online' ? 'bg-emerald-500' : 'bg-gray-300'
      )}
    />
  )

  if (src) {
    return (
      <span className="relative inline-block">
        <img
          src={src}
          alt={name}
          className={clsx('rounded-full object-cover', ringClasses[ring], sizeClasses[size])}
        />
        {dot}
      </span>
    )
  }

  return (
    <span className="relative inline-block">
      <div
        className={clsx(
          'flex items-center justify-center rounded-full font-semibold text-white',
          getColorFromName(name),
          ringClasses[ring],
          sizeClasses[size]
        )}
      >
        {getInitials(name)}
      </div>
      {dot}
    </span>
  )
}
