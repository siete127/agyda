import { clsx } from 'clsx'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  ring?: 'white' | 'brand'
}

const sizeClasses = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }
const ringClasses = { white: 'ring-2 ring-white', brand: 'ring-2 ring-brand' }

function getColorFromName(name: string): string {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

export function Avatar({ src, name, size = 'md', ring = 'white' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx('rounded-full object-cover', ringClasses[ring], sizeClasses[size])}
      />
    )
  }

  return (
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
  )
}
