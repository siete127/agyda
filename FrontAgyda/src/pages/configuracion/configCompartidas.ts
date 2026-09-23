// Impacto de las configuraciones compartidas entre módulos, por clave de
// pantalla (`screen` en configTree.ts). Dónde aparece cada una se calcula solo
// (UBICACIONES_POR_PANTALLA); aquí se describe a qué afecta un cambio, para
// avisar antes de modificarla.
//
// alcance:
//   'global'     → un solo valor para todos los módulos que la comparten.
//   'por-modulo' → cada módulo puede tener su propio valor; al guardar se elige
//                  si el cambio aplica solo a este módulo o a todos.
export interface ImpactoModulo {
  modulo: string
  que: string
}

export interface ImpactoConfig {
  resumen: string
  alcance: 'global' | 'por-modulo'
  afecta: ImpactoModulo[]
}

export const IMPACTO_POR_PANTALLA: Record<string, ImpactoConfig> = {
  facturacion: {
    resumen: 'Datos del emisor (RFC, razón social, régimen, CP), certificado CSD y proveedor de timbrado (PAC, serie y folio).',
    alcance: 'global',
    afecta: [
      { modulo: 'CRM › Oportunidades', que: 'Emisor, serie y folio de cada factura nueva timbrada desde una cotización.' },
      { modulo: 'Descarga y cancelación de facturas', que: 'El XML/PDF se descarga y se cancela a través del PAC configurado: si cambias de PAC o de credenciales, las facturas timbradas con el anterior pueden dejar de descargarse o cancelarse (también desde el Portal de clientes).' },
    ],
  },
  'pausa-tipos': {
    resumen: 'Tipos de pausa (baño, comida, capacitación, permiso y los que agregues): nombre, emoji, color, límite y en qué módulos cuenta cada uno.',
    alcance: 'por-modulo',
    afecta: [
      { modulo: 'Todos', que: 'Botones del menú de estado del perfil y el Reporte de pausas.' },
      { modulo: 'RH › Asistencia', que: 'Los tipos marcados para Asistencia se descuentan del tiempo disponible de la jornada.' },
      { modulo: 'RH › Nómina', que: 'Los tipos marcados para Nómina cuentan para el exceso de minutos de pausa.' },
      { modulo: 'Contact Center', que: 'Los tipos marcados para Contact Center dejan al agente fuera del enrutamiento, lo muestran "en pausa" al supervisor y cuentan para la alarma de pausa larga.' },
    ],
  },
}
// Nota: "Estatus de venta contados" (Metas / Comisiones / Incentivos) es
// 'por-modulo' y se edita dentro de cada pantalla con EstatusContadosCard, que
// pregunta el alcance al guardar (AlcanceCambioModal).
