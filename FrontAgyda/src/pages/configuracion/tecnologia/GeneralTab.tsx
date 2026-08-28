import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Info, Clock, CalendarOff, ArrowRight, Globe, Save } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { catalogosTiService } from '@/services/catalogosTi.service'

const DIAS_LABELS: Record<string, string> = {
  '1': 'Lun', '2': 'Mar', '3': 'Mié', '4': 'Jue', '5': 'Vie', '6': 'Sáb', '7': 'Dom',
}

export function GeneralTab() {
  const qc = useQueryClient()
  const [, setSearchParams] = useSearchParams()
  const irA = (tab: string) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    next.set('tab', tab)
    return next
  })

  const { data: config } = useQuery({
    queryKey: ['livechat-config'],
    queryFn: () => livechatService.getConfig(),
  })
  const { data: diasFestivos = [] } = useQuery({
    queryKey: ['dias-festivos'],
    queryFn: () => catalogosTiService.getDiasFestivos(),
  })
  const { data: configGeneral } = useQuery({
    queryKey: ['ti-config-general'],
    queryFn: () => catalogosTiService.getConfigGeneral(),
  })
  const [zonaHoraria, setZonaHoraria] = useState('')
  useEffect(() => {
    if (configGeneral) setZonaHoraria(configGeneral.zonaHoraria)
  }, [configGeneral])

  const guardarZona = useMutation({
    mutationFn: () => catalogosTiService.updateConfigGeneral(zonaHoraria),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ti-config-general'] })
      toast.success('Zona horaria guardada')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const proximosFestivos = diasFestivos
    .filter((d) => new Date(d.fecha) >= new Date(new Date().toDateString()))
    .slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-ink">Configuración de Tecnología/TI</p>
            <p className="mt-1 text-sm text-ink-tertiary">
              Este módulo centraliza la administración del flujo de soporte de Tecnología/TI: catálogos,
              técnicos, reglas de asignación, canales de contacto (chat en vivo, chatbot) y el ciclo de
              vida de los tickets. Usa el menú lateral para navegar entre secciones.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-ink">Horario de atención</p>
          </div>
          {config ? (
            <div className="space-y-1 text-xs text-ink-secondary">
              <p>Lun–Vie: {config.horarioInicio ?? '—'} a {config.horarioFin ?? '—'}</p>
              {config.sabadoHorarioInicio && (
                <p>Sábado: {config.sabadoHorarioInicio} a {config.sabadoHorarioFin ?? '—'}</p>
              )}
              {config.diasSemana && (
                <p className="text-ink-tertiary">
                  Días activos: {config.diasSemana.split(',').map((d) => DIAS_LABELS[d.trim()] ?? d).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-tertiary">Cargando...</p>
          )}
          <button
            onClick={() => irA('chat-vivo')}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            Editar en Chat en Vivo <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-ink">Próximos días festivos</p>
          </div>
          {proximosFestivos.length === 0 ? (
            <p className="text-xs text-ink-tertiary">Sin días festivos próximos configurados.</p>
          ) : (
            <div className="space-y-1 text-xs text-ink-secondary">
              {proximosFestivos.map((d) => (
                <p key={d.id}>{d.fecha} — {d.descripcion || 'Sin descripción'}</p>
              ))}
            </div>
          )}
          <button
            onClick={() => irA('sla')}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            Administrar en SLA <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Globe className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Zona horaria</p>
        </div>
        <p className="mb-3 text-xs text-ink-tertiary">
          Solo informativa — el sistema siempre calcula SLA, crons y horarios con la hora del servidor.
          Cambiar este valor no afecta ningún cálculo, es solo para documentar en qué zona opera la mesa
          de servicio.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={zonaHoraria}
            onChange={(e) => setZonaHoraria(e.target.value)}
            className="field flex-1 py-1.5 text-xs"
            placeholder="Ej. America/Mexico_City"
          />
          <button
            className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!zonaHoraria.trim() || guardarZona.isPending}
            onClick={() => guardarZona.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
