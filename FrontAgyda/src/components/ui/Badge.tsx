import { clsx } from 'clsx'

interface BadgeProps {
  count: number
  max?: number
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ count, max = 99, size = 'sm', className }: BadgeProps) {
  if (count <= 0) return null
  const display = count > max ? `${max}+` : String(count)

  return (
    <span
      className={clsx(
        'absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-brand font-bold text-white ring-2 ring-white',
        size === 'md' ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-4 min-w-4 px-1 text-[10px]',
        className
      )}
    >
      {display}
    </span>
  )
}
