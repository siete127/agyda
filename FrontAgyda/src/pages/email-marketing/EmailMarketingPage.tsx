import { useState } from 'react'
import { Mail, FileText, Megaphone } from 'lucide-react'
import { clsx } from 'clsx'
import { PlantillasEmailTab } from './PlantillasEmailTab'
import { CampaniasEmailTab } from './CampaniasEmailTab'

type Tab = 'campanias' | 'plantillas'

export function EmailMarketingPage() {
  const [tab, setTab] = useState<Tab>('campanias')

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">Email Marketing</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {([
          { key: 'campanias' as const, label: 'Campañas', icon: Megaphone },
          { key: 'plantillas' as const, label: 'Plantillas', icon: FileText },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-200 p-5">
        {tab === 'campanias' ? <CampaniasEmailTab /> : <PlantillasEmailTab />}
      </div>
    </div>
  )
}
