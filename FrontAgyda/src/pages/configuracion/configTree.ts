import { NAV_GROUPS } from '@/router/navGroups'

// Mapa de navegación completo de Configuración.
//
// Estructura: Sección → Módulo → configuraciones del módulo. Las secciones son
// las mismas del sidebar (router/navGroups.ts), más una sección "General" para
// lo que no pertenece a un módulo (apariencia, usuarios, sistema…).
//
// CATALOGO (abajo) es el inventario de todas las configuraciones, reales y
// planeadas. CONFIG_TREE (al final del archivo) lo reacomoda por sección y
// módulo. Solo los nodos con `screen` abren una pantalla funcional real; el
// resto son "próximamente" y siguen visibles.
export interface ConfigNode {
  key: string
  label: string
  description?: string
  screen?: string // clave de pantalla real registrada en ConfiguracionPage, si existe
  moduleKey?: string // módulo del sidebar al que pertenece (filtra por módulos activos de la empresa)
  // Módulos adicionales que la empresa/usuario debe tener para ver este nodo,
  // en cualquiera de sus ubicaciones (p. ej. tipos de pausa → 'reports').
  requiere?: string[]
  // La pantalla existe pero este módulo todavía no usa la configuración (queda
  // aquí para cuando se conecte). Aparece en la lista de pendientes.
  pendiente?: string
  children?: ConfigNode[]
}

const CATALOGO: ConfigNode[] = [
  {
    key: 'modulos-empresa', label: 'Módulos por Empresa',
    description: 'Activa o desactiva qué módulos ve cada empresa',
    screen: 'modulos-empresa',
  },
  {
    key: 'apariencia', label: 'Apariencia',
    description: 'Identidad visual: marca, tema, encabezado y página de inicio',
    children: [
      { key: 'pers-branding', label: 'Marca (logo, colores, nombre)', screen: 'pers-branding' },
      { key: 'pers-mascota', label: 'Mascota', screen: 'pers-mascota' },
      { key: 'pers-institucional', label: 'Misión, visión y valores', screen: 'pers-institucional' },
      { key: 'tema', label: 'Tema (modo y plantillas)', screen: 'tema' },
      { key: 'pers-botones', label: 'Botones del encabezado', screen: 'pers-botones' },
      { key: 'pers-enlaces', label: 'Enlaces del encabezado', screen: 'pers-enlaces' },
      { key: 'pers-dashboard', label: 'Diseño del inicio', screen: 'pers-dashboard' },
    ],
  },
  {
    key: 'organizacion', label: 'Organización',
    description: 'Empresas, sucursales, estructura y calendarios corporativos',
    children: [
      { key: 'empresas', label: 'Empresas', screen: 'empresas' },
      { key: 'sucursales', label: 'Sucursales' },
      { key: 'unidades-negocio', label: 'Unidades de negocio' },
      { key: 'departamentos', label: 'Departamentos' },
      { key: 'areas', label: 'Áreas' },
      { key: 'puestos', label: 'Puestos' },
      { key: 'centros-costo-org', label: 'Centros de costo' },
      { key: 'centros-beneficio', label: 'Centros de beneficio' },
      { key: 'regiones', label: 'Regiones' },
      { key: 'zonas-org', label: 'Zonas' },
      { key: 'organigrama', label: 'Organigrama' },
      { key: 'calendarios', label: 'Calendarios' },
      { key: 'horarios-laborales', label: 'Horarios laborales' },
      { key: 'dias-festivos', label: 'Días festivos' },
      { key: 'dias-inhabiles', label: 'Días inhábiles' },
      {
        key: 'multicompany', label: 'Configuración multicompany',
        children: [
          { key: 'empresas-disponibles', label: 'Empresas disponibles' },
          { key: 'empresa-por-usuario', label: 'Empresa por usuario' },
          { key: 'cambio-empresa', label: 'Cambio de empresa' },
          { key: 'datos-compartidos', label: 'Datos compartidos' },
          { key: 'datos-privados', label: 'Datos privados' },
          { key: 'herencia-config', label: 'Herencia de configuración' },
          { key: 'aislamiento-empresa', label: 'Aislamiento por empresa' },
        ],
      },
    ],
  },
  {
    key: 'usuarios-seguridad', label: 'Usuarios y Seguridad',
    description: 'Cuentas, roles, permisos y políticas de acceso',
    children: [
      { key: 'usuarios', label: 'Usuarios', screen: 'usuarios' },
      { key: 'roles', label: 'Roles', screen: 'roles' },
      { key: 'permisos', label: 'Permisos', screen: 'permisos' },
      { key: 'permisos-modulo', label: 'Permisos por módulo' },
      { key: 'permisos-empresa', label: 'Permisos por empresa' },
      { key: 'permisos-sucursal', label: 'Permisos por sucursal' },
      { key: 'permisos-departamento', label: 'Permisos por departamento' },
      { key: 'permisos-registro', label: 'Permisos por registro' },
      { key: 'grupos', label: 'Grupos' },
      { key: 'perfiles', label: 'Perfiles', screen: 'perfiles' },
      { key: 'delegacion-permisos', label: 'Delegación de permisos' },
      { key: 'roles-temporales', label: 'Roles temporales' },
      { key: 'segregacion-funciones', label: 'Segregación de funciones' },
      {
        key: 'politicas-password', label: 'Políticas de contraseña',
        children: [
          { key: 'pw-longitud', label: 'Longitud mínima' },
          { key: 'pw-complejidad', label: 'Complejidad' },
          { key: 'pw-expiracion', label: 'Expiración' },
          { key: 'pw-historial', label: 'Historial' },
          { key: 'pw-intentos', label: 'Intentos permitidos' },
          { key: 'pw-bloqueo', label: 'Bloqueo' },
        ],
      },
      { key: 'mfa', label: 'MFA' },
      { key: 'ad-ldap', label: 'Active Directory / LDAP' },
      { key: 'sso', label: 'SSO' },
      { key: 'restriccion-ip', label: 'Restricción por IP' },
      { key: 'restriccion-horario', label: 'Restricción por horario' },
      { key: 'sesiones-activas', label: 'Sesiones activas' },
      { key: 'cierre-remoto-sesion', label: 'Cierre remoto de sesión' },
      { key: 'recuperacion-password', label: 'Recuperación de contraseña' },
      { key: 'api-keys-seg', label: 'API Keys' },
      { key: 'tokens-seg', label: 'Tokens' },
      { key: 'auditoria-accesos', label: 'Auditoría de accesos' },
    ],
  },
  {
    key: 'erp', label: 'ERP',
    description: 'Finanzas, fiscal, ventas, compras, inventario y más',
    children: [
      {
        key: 'finanzas', label: '3.1 Finanzas',
        children: [
          { key: 'ejercicios-fiscales', label: 'Ejercicios fiscales' },
          { key: 'periodos-contables', label: 'Periodos contables' },
          { key: 'apertura-periodos', label: 'Apertura de periodos' },
          { key: 'cierre-periodos', label: 'Cierre de periodos' },
          { key: 'bloqueo-periodos', label: 'Bloqueo de periodos' },
          { key: 'reapertura', label: 'Reapertura' },
          { key: 'monedas-fin', label: 'Monedas' },
          { key: 'tipos-cambio', label: 'Tipos de cambio' },
          { key: 'catalogo-cuentas', label: 'Catálogo de cuentas' },
          { key: 'cuenta-mayor', label: 'Cuenta mayor' },
          { key: 'subcuentas', label: 'Subcuentas' },
          { key: 'naturaleza-cuentas', label: 'Naturaleza de cuentas' },
          { key: 'grupos-contables', label: 'Grupos contables' },
          { key: 'cuentas-auxiliares', label: 'Cuentas auxiliares' },
          { key: 'centros-costo-fin', label: 'Centros de costo' },
          { key: 'centros-beneficio-fin', label: 'Centros de beneficio' },
          { key: 'dimensiones-financieras', label: 'Dimensiones financieras' },
          { key: 'tipos-poliza', label: 'Tipos de póliza' },
          { key: 'series-contables', label: 'Series contables' },
          { key: 'reglas-contables', label: 'Reglas contables' },
          { key: 'cuentas-automaticas', label: 'Cuentas automáticas' },
          { key: 'cuentas-puente', label: 'Cuentas puente' },
          { key: 'cuentas-redondeo', label: 'Cuentas de redondeo' },
          { key: 'politicas-financieras', label: 'Políticas financieras' },
          { key: 'autorizaciones-financieras', label: 'Autorizaciones financieras' },
        ],
      },
      {
        key: 'fiscal', label: '3.2 Fiscal',
        children: [
          { key: 'razones-sociales', label: 'Razones sociales' },
          { key: 'rfc', label: 'RFC' },
          { key: 'regimen-fiscal', label: 'Régimen fiscal' },
          { key: 'domicilio-fiscal', label: 'Domicilio fiscal' },
          { key: 'cp-fiscal', label: 'Código postal fiscal' },
          {
            key: 'cfdi', label: 'CFDI',
            children: [
              { key: 'cfdi-version', label: 'Versión' },
              { key: 'cfdi-uso', label: 'Uso CFDI' },
              { key: 'cfdi-tipo-comprobante', label: 'Tipo de comprobante' },
              { key: 'cfdi-tipo-relacion', label: 'Tipo de relación' },
              { key: 'cfdi-exportacion', label: 'Exportación' },
            ],
          },
          { key: 'formas-pago', label: 'Formas de pago' },
          { key: 'metodos-pago', label: 'Métodos de pago' },
          {
            key: 'impuestos', label: 'Impuestos',
            children: [
              { key: 'iva', label: 'IVA' },
              { key: 'isr', label: 'ISR' },
              { key: 'ieps', label: 'IEPS' },
              { key: 'otros-impuestos', label: 'Otros' },
            ],
          },
          { key: 'retenciones', label: 'Retenciones' },
          { key: 'csd', label: 'CSD' },
          { key: 'certificados', label: 'Certificados' },
          { key: 'pac', label: 'PAC' },
          { key: 'series-fiscales', label: 'Series fiscales' },
          { key: 'folios', label: 'Folios' },
          { key: 'complementos-pago', label: 'Complementos de pago' },
          { key: 'notas-credito', label: 'Notas de crédito' },
          { key: 'cancelaciones-fiscal', label: 'Cancelaciones' },
          { key: 'plantillas-fiscales', label: 'Plantillas fiscales' },
        ],
      },
      {
        key: 'ventas-erp', label: '3.3 Ventas',
        children: [
          { key: 'tipos-venta', label: 'Tipos de venta' },
          { key: 'canales-venta', label: 'Canales de venta' },
          { key: 'listas-precios', label: 'Listas de precios' },
          { key: 'tarifas', label: 'Tarifas' },
          { key: 'monedas-permitidas', label: 'Monedas permitidas' },
          { key: 'condiciones-comerciales', label: 'Condiciones comerciales' },
          { key: 'condiciones-pago-venta', label: 'Condiciones de pago' },
          { key: 'plazos-credito', label: 'Plazos de crédito' },
          { key: 'limites-credito', label: 'Límites de crédito' },
          { key: 'descuentos', label: 'Descuentos' },
          { key: 'promociones', label: 'Promociones' },
          { key: 'bonificaciones', label: 'Bonificaciones' },
          { key: 'comisiones', label: 'Comisiones' },
          { key: 'vendedores', label: 'Vendedores' },
          { key: 'equipos-comerciales', label: 'Equipos comerciales' },
          { key: 'territorios', label: 'Territorios' },
          { key: 'zonas-venta', label: 'Zonas' },
          { key: 'metas', label: 'Metas' },
          { key: 'series-cotizacion', label: 'Series de cotización' },
          { key: 'series-pedido', label: 'Series de pedido' },
          { key: 'series-venta', label: 'Series de venta' },
          { key: 'vigencia-cotizaciones', label: 'Vigencia de cotizaciones' },
          { key: 'motivos-cancelacion-venta', label: 'Motivos de cancelación' },
          { key: 'motivos-perdida', label: 'Motivos de pérdida' },
          { key: 'autorizacion-descuento', label: 'Autorización por descuento' },
          { key: 'autorizacion-margen', label: 'Autorización por margen' },
          { key: 'autorizacion-monto-venta', label: 'Autorización por monto' },
          { key: 'autorizacion-credito', label: 'Autorización por crédito' },
        ],
      },
      {
        key: 'compras', label: '3.4 Compras',
        children: [
          { key: 'tipos-compra', label: 'Tipos de compra' },
          { key: 'categorias-compra', label: 'Categorías de compra' },
          { key: 'tipos-proveedor', label: 'Tipos de proveedor' },
          { key: 'condiciones-compra', label: 'Condiciones de compra' },
          { key: 'condiciones-pago-compra', label: 'Condiciones de pago' },
          { key: 'monedas-compra', label: 'Monedas' },
          { key: 'impuestos-compra', label: 'Impuestos' },
          { key: 'compradores', label: 'Compradores' },
          { key: 'grupos-compra', label: 'Grupos de compra' },
          { key: 'series-solicitud', label: 'Series de solicitud' },
          { key: 'series-orden', label: 'Series de orden' },
          { key: 'estados-solicitud', label: 'Estados de solicitud' },
          { key: 'estados-orden', label: 'Estados de orden' },
          { key: 'recepcion-parcial', label: 'Recepción parcial' },
          { key: 'tolerancias-compra', label: 'Tolerancias' },
          { key: 'sobrerecepcion', label: 'Sobrerrecepción' },
          { key: 'evaluacion-proveedor', label: 'Evaluación de proveedor' },
          { key: 'autorizacion-monto-compra', label: 'Autorización por monto' },
          { key: 'autorizacion-departamento-compra', label: 'Autorización por departamento' },
          { key: 'autorizacion-categoria-compra', label: 'Autorización por categoría' },
          { key: 'autorizacion-centro-costo-compra', label: 'Autorización por centro de costo' },
        ],
      },
      {
        key: 'inventario', label: '3.5 Inventario',
        children: [
          { key: 'almacenes', label: 'Almacenes' },
          { key: 'ubicaciones', label: 'Ubicaciones' },
          { key: 'zonas-inv', label: 'Zonas' },
          { key: 'pasillos', label: 'Pasillos' },
          { key: 'estantes', label: 'Estantes' },
          { key: 'posiciones', label: 'Posiciones' },
          { key: 'unidades-medida', label: 'Unidades de medida' },
          { key: 'conversiones', label: 'Conversiones' },
          { key: 'lotes', label: 'Lotes' },
          { key: 'series-inv', label: 'Series' },
          { key: 'caducidades', label: 'Caducidades' },
          { key: 'stock-minimo', label: 'Stock mínimo' },
          { key: 'stock-maximo', label: 'Stock máximo' },
          { key: 'stock-seguridad', label: 'Stock de seguridad' },
          { key: 'punto-reorden', label: 'Punto de reorden' },
          { key: 'inventario-negativo', label: 'Inventario negativo' },
          { key: 'reservas', label: 'Reservas' },
          { key: 'metodo-valuacion', label: 'Método de valuación' },
          { key: 'costeo-promedio', label: 'Costeo promedio' },
          { key: 'fifo', label: 'FIFO' },
          { key: 'costo-estandar', label: 'Costo estándar' },
          { key: 'tipos-movimiento', label: 'Tipos de movimiento' },
          { key: 'ajustes-inv', label: 'Ajustes' },
          { key: 'transferencias-inv', label: 'Transferencias' },
          { key: 'conteos-ciclicos', label: 'Conteos cíclicos' },
          { key: 'inventario-fisico', label: 'Inventario físico' },
        ],
      },
      {
        key: 'productos', label: '3.6 Productos',
        children: [
          { key: 'tipos-producto', label: 'Tipos de producto' },
          { key: 'servicios-prod', label: 'Servicios' },
          { key: 'consumibles', label: 'Consumibles' },
          { key: 'activos-prod', label: 'Activos' },
          { key: 'categorias-prod', label: 'Categorías' },
          { key: 'familias', label: 'Familias' },
          { key: 'subfamilias', label: 'Subfamilias' },
          { key: 'marcas', label: 'Marcas' },
          { key: 'modelos', label: 'Modelos' },
          { key: 'fabricantes', label: 'Fabricantes' },
          { key: 'sku', label: 'SKU' },
          { key: 'codigo-barras', label: 'Código de barras' },
          { key: 'unidades-prod', label: 'Unidades' },
          { key: 'atributos', label: 'Atributos' },
          { key: 'variantes', label: 'Variantes' },
          { key: 'precios-prod', label: 'Precios' },
          { key: 'costos-prod', label: 'Costos' },
          { key: 'impuestos-prod', label: 'Impuestos' },
          { key: 'proveedores-preferentes', label: 'Proveedores preferentes' },
          { key: 'almacenes-permitidos', label: 'Almacenes permitidos' },
          { key: 'garantias-prod', label: 'Garantías' },
          { key: 'estados-prod', label: 'Estados' },
        ],
      },
      {
        key: 'clientes-erp', label: '3.7 Clientes',
        children: [
          { key: 'tipos-cliente', label: 'Tipos' },
          { key: 'segmentos-cliente', label: 'Segmentos' },
          { key: 'categorias-cliente', label: 'Categorías' },
          { key: 'clasificaciones-cliente', label: 'Clasificaciones' },
          { key: 'industrias', label: 'Industrias' },
          { key: 'zonas-cliente', label: 'Zonas' },
          { key: 'vendedores-asignados', label: 'Vendedores asignados' },
          { key: 'grupos-empresariales', label: 'Grupos empresariales' },
          { key: 'nivel-riesgo', label: 'Nivel de riesgo' },
          { key: 'limite-credito-cliente', label: 'Límite de crédito' },
          { key: 'dias-credito', label: 'Días de crédito' },
          { key: 'bloqueos-cliente', label: 'Bloqueos' },
          { key: 'listas-precios-cliente', label: 'Listas de precios' },
          { key: 'descuentos-cliente', label: 'Descuentos' },
          { key: 'condiciones-pago-cliente', label: 'Condiciones de pago' },
          { key: 'monedas-cliente', label: 'Monedas' },
          { key: 'documentos-requeridos', label: 'Documentos requeridos' },
          { key: 'campos-obligatorios', label: 'Campos obligatorios' },
        ],
      },
      {
        key: 'proveedores', label: '3.8 Proveedores',
        children: [
          { key: 'tipos-proveedor2', label: 'Tipos' },
          { key: 'categorias-proveedor', label: 'Categorías' },
          { key: 'clasificacion-proveedor', label: 'Clasificación' },
          { key: 'productos-autorizados', label: 'Productos autorizados' },
          { key: 'servicios-autorizados', label: 'Servicios autorizados' },
          { key: 'condiciones-pago-proveedor', label: 'Condiciones de pago' },
          { key: 'dias-credito-proveedor', label: 'Días de crédito' },
          { key: 'monedas-proveedor', label: 'Monedas' },
          { key: 'bancos-proveedor', label: 'Bancos' },
          { key: 'cuentas-bancarias-proveedor', label: 'Cuentas bancarias' },
          { key: 'documentacion-proveedor', label: 'Documentación' },
          { key: 'certificaciones', label: 'Certificaciones' },
          { key: 'evaluaciones-proveedor', label: 'Evaluaciones' },
          { key: 'sla-proveedor', label: 'SLA' },
          { key: 'riesgo-proveedor', label: 'Riesgo' },
          { key: 'preferente', label: 'Preferente' },
          { key: 'bloqueos-proveedor', label: 'Bloqueos' },
        ],
      },
      {
        key: 'cxc', label: '3.9 Cuentas por Cobrar',
        children: [
          { key: 'condiciones-credito', label: 'Condiciones de crédito' },
          { key: 'plazos-cxc', label: 'Plazos' },
          { key: 'vencimientos', label: 'Vencimientos' },
          { key: 'tolerancias-cxc', label: 'Tolerancias' },
          { key: 'intereses-moratorios', label: 'Intereses moratorios' },
          { key: 'recargos', label: 'Recargos' },
          { key: 'promesas-pago', label: 'Promesas de pago' },
          { key: 'convenios', label: 'Convenios' },
          { key: 'niveles-mora', label: 'Niveles de mora' },
          { key: 'estrategias-cobranza', label: 'Estrategias de cobranza' },
          { key: 'cobranza-preventiva', label: 'Cobranza preventiva' },
          { key: 'cobranza-administrativa', label: 'Cobranza administrativa' },
          { key: 'cobranza-extrajudicial', label: 'Cobranza extrajudicial' },
          { key: 'cobranza-juridica', label: 'Cobranza jurídica' },
          { key: 'asignacion-cartera', label: 'Asignación de cartera' },
          { key: 'bloqueo-automatico', label: 'Bloqueo automático' },
          { key: 'recordatorios-cxc', label: 'Recordatorios' },
          { key: 'alertas-cxc', label: 'Alertas' },
        ],
      },
      {
        key: 'cxp', label: '3.10 Cuentas por Pagar',
        children: [
          { key: 'condiciones-pago-cxp', label: 'Condiciones de pago' },
          { key: 'calendarios-cxp', label: 'Calendarios' },
          { key: 'dias-pago', label: 'Días de pago' },
          { key: 'prioridades-cxp', label: 'Prioridades' },
          { key: 'tipos-factura', label: 'Tipos de factura' },
          { key: 'retenciones-cxp', label: 'Retenciones' },
          { key: 'anticipos-cxp', label: 'Anticipos' },
          { key: 'pagos-parciales', label: 'Pagos parciales' },
          { key: 'programacion-pagos', label: 'Programación de pagos' },
          { key: 'autorizacion-monto-cxp', label: 'Autorización por monto' },
          { key: 'autorizacion-departamento-cxp', label: 'Autorización por departamento' },
          { key: 'autorizacion-centro-costo-cxp', label: 'Autorización por centro de costo' },
          { key: 'alertas-cxp', label: 'Alertas' },
          { key: 'bloqueos-cxp', label: 'Bloqueos' },
        ],
      },
      {
        key: 'bancos', label: '3.11 Bancos',
        children: [
          { key: 'instituciones-bancarias', label: 'Instituciones bancarias' },
          { key: 'cuentas-bancarias', label: 'Cuentas bancarias' },
          { key: 'tipos-cuenta', label: 'Tipos de cuenta' },
          { key: 'monedas-bancos', label: 'Monedas' },
          { key: 'clabe', label: 'CLABE' },
          { key: 'swift', label: 'SWIFT' },
          { key: 'metodos-pago-bancos', label: 'Métodos de pago' },
          { key: 'referencias-bancos', label: 'Referencias' },
          { key: 'conciliacion-manual', label: 'Conciliación manual' },
          { key: 'conciliacion-automatica', label: 'Conciliación automática' },
          { key: 'reglas-conciliacion', label: 'Reglas de conciliación' },
          { key: 'layouts-bancarios', label: 'Layouts bancarios' },
          { key: 'importacion-movimientos', label: 'Importación de movimientos' },
        ],
      },
      {
        key: 'tesoreria', label: '3.12 Tesorería',
        children: [
          { key: 'cajas', label: 'Cajas' },
          { key: 'fondos', label: 'Fondos' },
          { key: 'cuentas-tesoreria', label: 'Cuentas' },
          { key: 'flujo-efectivo', label: 'Flujo de efectivo' },
          { key: 'pronosticos', label: 'Pronósticos' },
          { key: 'limites-tesoreria', label: 'Límites' },
          { key: 'transferencias-tesoreria', label: 'Transferencias' },
          { key: 'autorizadores', label: 'Autorizadores' },
          { key: 'movimientos-permitidos', label: 'Movimientos permitidos' },
          { key: 'disponibilidad', label: 'Disponibilidad' },
          { key: 'alertas-tesoreria', label: 'Alertas' },
        ],
      },
      {
        key: 'presupuestos', label: '3.13 Presupuestos',
        children: [
          { key: 'ejercicios-presupuesto', label: 'Ejercicios' },
          { key: 'versiones-presupuesto', label: 'Versiones' },
          { key: 'tipos-presupuesto', label: 'Tipos' },
          { key: 'centros-costo-presupuesto', label: 'Centros de costo' },
          { key: 'departamentos-presupuesto', label: 'Departamentos' },
          { key: 'cuentas-presupuesto', label: 'Cuentas' },
          { key: 'partidas', label: 'Partidas' },
          { key: 'proyectos-presupuesto', label: 'Proyectos' },
          { key: 'control-informativo', label: 'Control informativo' },
          { key: 'control-advertencia', label: 'Control con advertencia' },
          { key: 'bloqueo-exceso', label: 'Bloqueo por exceso' },
          { key: 'tolerancias-presupuesto', label: 'Tolerancias' },
          { key: 'transferencias-presupuesto', label: 'Transferencias' },
          { key: 'ampliaciones', label: 'Ampliaciones' },
          { key: 'reducciones', label: 'Reducciones' },
          { key: 'aprobaciones-presupuesto', label: 'Aprobaciones' },
        ],
      },
      {
        key: 'activos-erp', label: '3.14 Activos',
        children: [
          { key: 'tipos-activo', label: 'Tipos' },
          { key: 'categorias-activo', label: 'Categorías' },
          { key: 'subcategorias-activo', label: 'Subcategorías' },
          { key: 'ubicaciones-activo', label: 'Ubicaciones' },
          { key: 'responsables-activo', label: 'Responsables' },
          { key: 'centros-costo-activo', label: 'Centros de costo' },
          { key: 'metodo-depreciacion', label: 'Método de depreciación' },
          { key: 'vida-util', label: 'Vida útil' },
          { key: 'valor-residual', label: 'Valor residual' },
          { key: 'periodicidad', label: 'Periodicidad' },
          { key: 'cuentas-contables-activo', label: 'Cuentas contables' },
          { key: 'asignaciones-activo', label: 'Asignaciones' },
          { key: 'transferencias-activo', label: 'Transferencias' },
          { key: 'bajas-activo', label: 'Bajas' },
          { key: 'garantias-activo', label: 'Garantías' },
          { key: 'seguros', label: 'Seguros' },
          { key: 'etiquetado', label: 'Etiquetado' },
        ],
      },
      {
        key: 'gastos-erp', label: '3.15 Gastos',
        children: [
          { key: 'tipos-gasto', label: 'Tipos' },
          { key: 'categorias-gasto', label: 'Categorías' },
          { key: 'subcategorias-gasto', label: 'Subcategorías' },
          { key: 'centros-costo-gasto', label: 'Centros de costo' },
          { key: 'limites-gasto', label: 'Límites' },
          { key: 'viaticos', label: 'Viáticos' },
          { key: 'anticipos-gasto', label: 'Anticipos' },
          { key: 'reembolsos', label: 'Reembolsos' },
          { key: 'comprobaciones', label: 'Comprobaciones' },
          { key: 'documentacion-obligatoria', label: 'Documentación obligatoria' },
          { key: 'politicas-gasto', label: 'Políticas' },
          { key: 'autorizacion-monto-gasto', label: 'Autorización por monto' },
          { key: 'autorizacion-puesto-gasto', label: 'Autorización por puesto' },
          { key: 'autorizacion-departamento-gasto', label: 'Autorización por departamento' },
        ],
      },
      {
        key: 'proyectos-erp', label: '3.16 Proyectos',
        children: [
          { key: 'tipos-proyecto', label: 'Tipos' },
          { key: 'categorias-proyecto', label: 'Categorías' },
          { key: 'estados-proyecto', label: 'Estados' },
          { key: 'prioridades-proyecto', label: 'Prioridades' },
          { key: 'plantillas-proyecto', label: 'Plantillas' },
          { key: 'fases', label: 'Fases' },
          { key: 'hitos', label: 'Hitos' },
          { key: 'centros-costo-proyecto', label: 'Centros de costo' },
          { key: 'presupuestos-proyecto', label: 'Presupuestos' },
          { key: 'recursos-proyecto', label: 'Recursos' },
          { key: 'tarifas-proyecto', label: 'Tarifas' },
          { key: 'horas-proyecto', label: 'Horas' },
          { key: 'costos-proyecto', label: 'Costos' },
          { key: 'gastos-proyecto', label: 'Gastos' },
          { key: 'reglas-facturacion', label: 'Reglas de facturación' },
        ],
      },
      {
        key: 'contratos-erp', label: '3.17 Contratos',
        children: [
          { key: 'tipos-contrato', label: 'Tipos' },
          { key: 'categorias-contrato', label: 'Categorías' },
          { key: 'plantillas-contrato', label: 'Plantillas' },
          { key: 'estados-contrato', label: 'Estados' },
          { key: 'vigencias-contrato', label: 'Vigencias' },
          { key: 'renovaciones', label: 'Renovaciones' },
          { key: 'prorrogas', label: 'Prórrogas' },
          { key: 'cancelaciones-contrato', label: 'Cancelaciones' },
          { key: 'clausulas', label: 'Cláusulas' },
          { key: 'firmas', label: 'Firmas' },
          { key: 'versiones-contrato', label: 'Versiones' },
          { key: 'responsables-contrato', label: 'Responsables' },
          { key: 'alertas-contrato', label: 'Alertas' },
          { key: 'aprobaciones-contrato', label: 'Aprobaciones' },
        ],
      },
      {
        key: 'rrhh-nomina', label: '3.18 RRHH / Nómina',
        children: [
          { key: 'tipos-empleado', label: 'Tipos de empleado' },
          { key: 'tipos-contrato-rrhh', label: 'Tipos de contrato' },
          { key: 'puestos-rrhh', label: 'Puestos' },
          { key: 'niveles', label: 'Niveles' },
          { key: 'departamentos-rrhh', label: 'Departamentos' },
          { key: 'centros-costo-rrhh', label: 'Centros de costo' },
          { key: 'jornadas', label: 'Jornadas' },
          { key: 'turnos', label: 'Turnos' },
          { key: 'horarios-rrhh', label: 'Horarios' },
          { key: 'periodos-nomina', label: 'Periodos de nómina' },
          { key: 'frecuencias', label: 'Frecuencias' },
          { key: 'percepciones', label: 'Percepciones' },
          { key: 'deducciones', label: 'Deducciones' },
          { key: 'prestaciones', label: 'Prestaciones' },
          { key: 'bonos', label: 'Bonos' },
          { key: 'comisiones-rrhh', label: 'Comisiones' },
          { key: 'vacaciones-rrhh', label: 'Vacaciones' },
          { key: 'faltas', label: 'Faltas' },
          { key: 'retardos', label: 'Retardos' },
          { key: 'incidencias', label: 'Incidencias' },
          { key: 'permisos-rrhh', label: 'Permisos' },
          { key: 'horas-extra', label: 'Horas extra' },
          { key: 'politicas-laborales', label: 'Políticas laborales' },
        ],
      },
      {
        key: 'mantenimiento-erp', label: '3.19 Mantenimiento',
        children: [
          {
            key: 'tipos-mantenimiento', label: 'Tipos',
            children: [
              { key: 'preventivo', label: 'Preventivo' },
              { key: 'correctivo', label: 'Correctivo' },
              { key: 'predictivo', label: 'Predictivo' },
            ],
          },
          { key: 'categorias-mantenimiento', label: 'Categorías' },
          { key: 'equipos-mantenimiento', label: 'Equipos' },
          { key: 'frecuencias-mantenimiento', label: 'Frecuencias' },
          { key: 'calendarios-mantenimiento', label: 'Calendarios' },
          { key: 'checklist', label: 'Checklist' },
          { key: 'refacciones', label: 'Refacciones' },
          { key: 'tecnicos', label: 'Técnicos' },
          { key: 'proveedores-mantenimiento', label: 'Proveedores' },
          { key: 'sla-mantenimiento', label: 'SLA' },
          { key: 'prioridades-mantenimiento', label: 'Prioridades' },
          { key: 'criticidad', label: 'Criticidad' },
          { key: 'alertas-mantenimiento', label: 'Alertas' },
        ],
      },
    ],
  },
  {
    key: 'crm', label: 'CRM',
    description: 'Clientes, prospectos, pipeline y automatizaciones comerciales',
    children: [
      {
        key: 'clientes-crm', label: 'Clientes', screen: 'clientes-crm-resumen',
      },
      { key: 'prospectos', label: 'Prospectos' },
      { key: 'fuentes-lead', label: 'Fuentes de lead' },
      { key: 'campanas-comerciales', label: 'Campañas comerciales' },
      {
        key: 'cotizaciones-facturacion', label: 'Cotizaciones y facturación',
        children: [
          { key: 'ventas', label: 'Margen e IVA', screen: 'ventas' },
          { key: 'facturacion', label: 'Facturación (emisor, CSD, PAC)', screen: 'facturacion' },
        ],
      },
      {
        key: 'comercial-config', label: 'Metas, comisiones e incentivos',
        children: [
          { key: 'metas-config', label: 'Metas', screen: 'metas-config' },
          { key: 'comisiones-config', label: 'Comisiones', screen: 'comisiones-config' },
          { key: 'incentivos-config', label: 'Incentivos', screen: 'incentivos-config' },
          { key: 'prospeccion-config', label: 'Prospección', screen: 'prospeccion-config' },
          { key: 'email-marketing-config', label: 'Email Marketing', screen: 'email-marketing-config' },
        ],
      },
      {
        key: 'pipeline', label: 'Pipeline',
        children: [
          { key: 'pipelines', label: 'Pipelines' },
          { key: 'etapas', label: 'Etapas' },
          { key: 'probabilidades', label: 'Probabilidades' },
          { key: 'orden-pipeline', label: 'Orden' },
          { key: 'etapas-obligatorias', label: 'Etapas obligatorias' },
        ],
      },
      {
        key: 'oportunidades', label: 'Oportunidades',
        children: [
          { key: 'estados-oportunidad', label: 'Estados' },
          { key: 'prioridades-oportunidad', label: 'Prioridades' },
          { key: 'probabilidades-oportunidad', label: 'Probabilidades' },
          { key: 'tipos-oportunidad', label: 'Tipos' },
        ],
      },
      {
        key: 'actividades-crm', label: 'Actividades',
        children: [
          { key: 'act-llamada', label: 'Llamada' },
          { key: 'act-correo', label: 'Correo' },
          { key: 'act-whatsapp', label: 'WhatsApp' },
          { key: 'act-reunion', label: 'Reunión' },
          { key: 'act-visita', label: 'Visita' },
          { key: 'act-tarea', label: 'Tarea' },
        ],
      },
      { key: 'motivos-perdida-crm', label: 'Motivos de pérdida' },
      { key: 'motivos-cierre-crm', label: 'Motivos de cierre' },
      { key: 'sla-seguimiento', label: 'SLA de seguimiento' },
      { key: 'reglas-asignacion-crm', label: 'Reglas de asignación' },
      { key: 'campos-personalizados-crm', label: 'Campos personalizados' },
      { key: 'formularios-crm', label: 'Formularios' },
      { key: 'etiquetas-crm', label: 'Etiquetas' },
      { key: 'automatizaciones-crm', label: 'Automatizaciones' },
      { key: 'recordatorios-crm', label: 'Recordatorios' },
      { key: 'alertas-crm', label: 'Alertas' },
      { key: 'duplicados', label: 'Duplicados' },
    ],
  },
  {
    key: 'contact-center', label: 'Contact Center',
    description: 'Campañas, agentes, telefonía y enrutamiento de llamadas',
    children: [
      {
        // Canales, Asignación de agentes y Tipificaciones ya NO son entradas
        // sueltas: viven dentro del detalle de cada campaña (CampaniaDetalle,
        // en cc-skills) porque en la BD dependen de una campaña
        // (CN_CAMPANIA_ID / CGA_.../CG_CAMPANIA_ID / CT_CAMPANIA_ID) — antes
        // eran 3 pantallas hermanas sin relación visual con la campaña.
        key: 'omnicanal', label: 'Configuraciones del módulo de Asesor',
        children: [
          { key: 'cc-skills', label: 'Campañas y skills', screen: 'cc-skills' },
          { key: 'cc-formularios', label: 'Formularios de Atención', screen: 'cc-formularios' },
          { key: 'cc-postulantes', label: 'Gestión de postulantes', screen: 'cc-postulantes' },
          { key: 'cc-config', label: 'SLA, ACW y horario', screen: 'cc-config' },
          { key: 'cc-simulador', label: 'Simulador de prueba', screen: 'cc-simulador' },
        ],
      },
      { key: 'qr-generator', label: 'Generador de QR', screen: 'qr-generator' },
      {
        key: 'campanas-cc', label: 'Campañas',
        children: [
          { key: 'inbound', label: 'Inbound' },
          { key: 'outbound', label: 'Outbound' },
          { key: 'blended', label: 'Blended' },
          { key: 'manual', label: 'Manual' },
          { key: 'preview', label: 'Preview' },
          { key: 'progressive', label: 'Progressive' },
          { key: 'predictive', label: 'Predictive' },
        ],
      },
      { key: 'colas', label: 'Colas' },
      { key: 'skills', label: 'Skills' },
      { key: 'equipos-cc', label: 'Equipos' },
      { key: 'agentes', label: 'Agentes' },
      { key: 'supervisores', label: 'Supervisores' },
      { key: 'grupos-cc', label: 'Grupos' },
      {
        key: 'estados-agente', label: 'Estados de agente',
        children: [
          { key: 'disponible', label: 'Disponible' },
          { key: 'ocupado', label: 'Ocupado' },
          { key: 'pausa', label: 'Pausa' },
          { key: 'break', label: 'Break' },
          { key: 'capacitacion-estado', label: 'Capacitación' },
          { key: 'bano', label: 'Baño' },
          { key: 'backoffice', label: 'Backoffice' },
          { key: 'acw', label: 'ACW' },
        ],
      },
      { key: 'pausas', label: 'Tipos de pausa', screen: 'pausa-tipos', requiere: ['reports'] },
      { key: 'tipificaciones', label: 'Tipificaciones' },
      { key: 'sla-cc', label: 'SLA' },
      { key: 'prioridades-cc', label: 'Prioridades' },
      { key: 'routing', label: 'Routing' },
      { key: 'overflow', label: 'Overflow' },
      { key: 'reglas-distribucion', label: 'Reglas de distribución' },
      { key: 'maximo-espera', label: 'Máximo de espera' },
      { key: 'abandono', label: 'Abandono' },
      { key: 'callback', label: 'Callback' },
      { key: 'reintentos-cc', label: 'Reintentos' },
      { key: 'reciclado-leads', label: 'Reciclado de leads' },
      {
        key: 'telefonia', label: 'Telefonía',
        children: [
          { key: 'troncales-sip', label: 'Troncales SIP' },
          { key: 'proveedores-telefonia', label: 'Proveedores' },
          { key: 'did', label: 'DID' },
          { key: 'extensiones', label: 'Extensiones' },
          { key: 'caller-id', label: 'Caller ID' },
          { key: 'prefijos', label: 'Prefijos' },
          { key: 'rutas-entrantes', label: 'Rutas entrantes' },
          { key: 'rutas-salientes', label: 'Rutas salientes' },
          { key: 'codecs', label: 'Codecs' },
          { key: 'webrtc', label: 'WebRTC' },
          { key: 'buzones', label: 'Buzones' },
          { key: 'vistas-webphone', label: 'Vistas Webphone', screen: 'webphone-vistas' },
          { key: 'credenciales-vicidial', label: 'Credenciales VICIdial', screen: 'webphone-credenciales' },
          { key: 'asignacion-vistas-webphone', label: 'Asignación de Vistas', screen: 'webphone-asignaciones' },
        ],
      },
      { key: 'ivr', label: 'IVR' },
      { key: 'flujos-llamada', label: 'Flujos de llamada' },
      { key: 'horarios-cc', label: 'Horarios' },
      { key: 'festivos-cc', label: 'Festivos' },
      {
        key: 'grabaciones', label: 'Grabaciones',
        children: [
          { key: 'grab-activacion', label: 'Activación' },
          { key: 'grab-formato', label: 'Formato' },
          { key: 'grab-retencion', label: 'Retención' },
          { key: 'grab-almacenamiento', label: 'Almacenamiento' },
          { key: 'grab-cifrado', label: 'Cifrado' },
          { key: 'grab-permisos', label: 'Permisos' },
        ],
      },
      { key: 'audios', label: 'Audios' },
      { key: 'musica-espera', label: 'Música en espera' },
      { key: 'whatsapp-cc', label: 'WhatsApp' },
      { key: 'chat-cc', label: 'Chat' },
      { key: 'email-cc', label: 'Email' },
      { key: 'sms-cc', label: 'SMS' },
      { key: 'limites-concurrencia', label: 'Límites de concurrencia' },
    ],
  },
  {
    key: 'ti', label: 'TI',
    description: 'Soporte TI, mesa de servicio, técnicos y reglas de asignación',
    children: [
      // ── Soporte TI (módulo funcional — Fases 7/8/9) ──
      { key: 'ti-general',          label: 'General',                 screen: 'ti-general' },
      { key: 'ti-mesa-servicio',    label: 'Mesa de Servicio',        screen: 'ti-mesa-servicio' },
      { key: 'ti-categorias',       label: 'Categorías y subcategorías', screen: 'ti-categorias' },
      { key: 'ti-campos-personalizados', label: 'Campos personalizados', screen: 'ti-campos-personalizados' },
      { key: 'ti-tecnicos',         label: 'Técnicos',                screen: 'ti-tecnicos' },
      { key: 'ti-catalogos',        label: 'Catálogos',               screen: 'ti-catalogos' },
      { key: 'ti-grupos-soporte',   label: 'Grupos de soporte',       screen: 'ti-grupos-soporte' },
      { key: 'ti-reglas',           label: 'Reglas de asignación',    screen: 'ti-reglas' },
      { key: 'ti-sla',              label: 'SLA',                     screen: 'ti-sla' },
      { key: 'ti-kpis',             label: 'KPIs de Tickets',         screen: 'ti-kpis' },
      { key: 'ti-escalamientos',    label: 'Escalamientos',           screen: 'ti-escalamientos' },
      { key: 'ti-automatizaciones', label: 'Automatizaciones',        screen: 'ti-automatizaciones' },
      { key: 'ti-campania-soporte', label: 'Campaña de chat Soporte TI', screen: 'ti-campania-soporte' },
      { key: 'ti-chat-vivo',        label: 'Chat en vivo',            screen: 'ti-chat-vivo' },
      { key: 'ti-chatbot',          label: 'Chatbot de diagnóstico',  screen: 'ti-chatbot' },
      { key: 'ti-kb',               label: 'ArdaWiki',                screen: 'ti-kb' },
      { key: 'ti-encuestas',        label: 'Encuestas de satisfacción', screen: 'ti-encuestas' },
      { key: 'ti-plantillas',       label: 'Plantillas',              screen: 'ti-plantillas' },
      { key: 'ti-notificaciones',   label: 'Notificaciones de TI',    screen: 'ti-notificaciones' },
      { key: 'ti-seguridad',        label: 'Seguridad y accesos',     screen: 'ti-seguridad' },
      { key: 'ti-integraciones',    label: 'Integraciones',           screen: 'ti-integraciones' },
      // ── Catálogos avanzados (placeholders — mapa a futuro) ──
      {
        key: 'mesa-servicio', label: 'Mesa de Servicio (avanzado)',
        children: [
          { key: 'tipos-ticket', label: 'Tipos de ticket' },
          { key: 'categorias-ticket', label: 'Categorías' },
          { key: 'subcategorias-ticket', label: 'Subcategorías' },
          { key: 'prioridades-ticket', label: 'Prioridades' },
          { key: 'impacto', label: 'Impacto' },
          { key: 'urgencia', label: 'Urgencia' },
          { key: 'estados-ticket', label: 'Estados' },
          { key: 'motivos-cierre-ticket', label: 'Motivos de cierre' },
          { key: 'sla-ticket', label: 'SLA' },
        ],
      },
      { key: 'grupos-soporte', label: 'Grupos de soporte' },
      { key: 'tecnicos-ti', label: 'Técnicos' },
      { key: 'especialidades', label: 'Especialidades' },
      { key: 'reglas-asignacion-ti', label: 'Reglas de asignación' },
      { key: 'escalamientos', label: 'Escalamientos' },
      { key: 'calendarios-soporte', label: 'Calendarios de soporte' },
      { key: 'horarios-ti', label: 'Horarios' },
      {
        key: 'inventario-ti', label: 'Inventario TI',
        children: [
          { key: 'tipos-equipo', label: 'Tipos de equipo' },
          { key: 'categorias-equipo', label: 'Categorías' },
          { key: 'marcas-ti', label: 'Marcas' },
          { key: 'modelos-ti', label: 'Modelos' },
          { key: 'estados-equipo', label: 'Estados' },
          { key: 'ubicaciones-ti', label: 'Ubicaciones' },
          { key: 'garantias-ti', label: 'Garantías' },
        ],
      },
      {
        key: 'cambios-ti', label: 'Cambios',
        children: [
          { key: 'tipos-cambio-ti', label: 'Tipos' },
          { key: 'riesgos', label: 'Riesgos' },
          { key: 'impactos-cambio', label: 'Impactos' },
          { key: 'prioridades-cambio', label: 'Prioridades' },
          { key: 'aprobaciones-cambio', label: 'Aprobaciones' },
        ],
      },
      { key: 'incidentes', label: 'Incidentes' },
      { key: 'problemas', label: 'Problemas' },
      { key: 'solicitudes-ti', label: 'Solicitudes' },
      { key: 'mantenimiento-ti', label: 'Mantenimiento' },
      { key: 'contratos-ti', label: 'Contratos' },
      { key: 'proveedores-ti', label: 'Proveedores' },
      { key: 'licencias', label: 'Licencias' },
      { key: 'alertas-ti', label: 'Alertas' },
      { key: 'monitoreo', label: 'Monitoreo' },
      { key: 'base-conocimiento', label: 'ArdaWiki' },
    ],
  },
  {
    key: 'integraciones', label: 'Integraciones',
    description: 'APIs, webhooks y conexiones con sistemas externos',
    children: [
      {
        key: 'apis', label: 'APIs',
        children: [
          { key: 'rest', label: 'REST' },
          { key: 'soap', label: 'SOAP' },
          { key: 'graphql', label: 'GraphQL' },
          { key: 'apis-internas', label: 'APIs internas' },
        ],
      },
      { key: 'webhooks', label: 'Webhooks' },
      { key: 'oauth', label: 'OAuth' },
      { key: 'api-keys-int', label: 'API Keys' },
      { key: 'tokens-int', label: 'Tokens' },
      { key: 'basic-auth', label: 'Basic Auth' },
      {
        key: 'bases-datos', label: 'Bases de datos',
        children: [
          { key: 'sql-server', label: 'SQL Server' },
          { key: 'mysql-mariadb', label: 'MySQL / MariaDB' },
          { key: 'postgresql', label: 'PostgreSQL' },
          { key: 'oracle', label: 'Oracle' },
        ],
      },
      { key: 'ad-ldap-int', label: 'Active Directory / LDAP' },
      { key: 'vicidial-int', label: 'VICIdial' },
      { key: 'asterisk', label: 'Asterisk' },
      { key: 'bancos-int', label: 'Bancos' },
      { key: 'pac-int', label: 'PAC' },
      { key: 'whatsapp-int', label: 'WhatsApp' },
      { key: 'email-int', label: 'Email' },
      { key: 'sms-int', label: 'SMS' },
      { key: 'sftp', label: 'SFTP' },
      { key: 'ftp', label: 'FTP' },
      { key: 'mapeo-campos', label: 'Mapeo de campos' },
      { key: 'transformaciones', label: 'Transformaciones' },
      { key: 'reglas-sincronizacion', label: 'Reglas de sincronización' },
      { key: 'frecuencia-int', label: 'Frecuencia' },
      { key: 'reintentos-int', label: 'Reintentos' },
      { key: 'timeout-int', label: 'Timeout' },
      { key: 'rate-limit-int', label: 'Rate Limit' },
      { key: 'health-check-int', label: 'Health Check' },
      { key: 'logs-int', label: 'Logs' },
      { key: 'credenciales-cifradas', label: 'Credenciales cifradas' },
    ],
  },
  {
    key: 'catalogos', label: 'Catálogos',
    description: 'Ubicaciones geográficas, idiomas y monedas de referencia',
    children: [
      { key: 'paises', label: 'Países' },
      { key: 'estados-geo', label: 'Estados' },
      { key: 'municipios', label: 'Municipios' },
      { key: 'ciudades', label: 'Ciudades' },
      { key: 'colonias', label: 'Colonias' },
      { key: 'codigos-postales', label: 'Códigos postales' },
      { key: 'idiomas', label: 'Idiomas' },
      { key: 'zonas-horarias', label: 'Zonas horarias' },
      { key: 'monedas-cat', label: 'Monedas' },
    ],
  },
  {
    key: 'notificaciones-root', label: 'Notificaciones',
    description: 'Canales, plantillas y reglas de aviso del sistema',
    children: [
      {
        key: 'canales-notif', label: 'Canales',
        children: [
          { key: 'canal-sistema', label: 'Sistema' },
          { key: 'canal-email', label: 'Email', screen: 'notificaciones' },
          { key: 'canal-sms', label: 'SMS' },
          { key: 'canal-whatsapp', label: 'WhatsApp' },
          { key: 'canal-push', label: 'Push' },
        ],
      },
      { key: 'eventos-notif', label: 'Eventos' },
      { key: 'plantillas-notif', label: 'Plantillas' },
      { key: 'variables-notif', label: 'Variables' },
      { key: 'destinatarios-notif', label: 'Destinatarios' },
      { key: 'reglas-notif', label: 'Reglas' },
      { key: 'prioridades-notif', label: 'Prioridades' },
      { key: 'frecuencia-notif', label: 'Frecuencia' },
      { key: 'horarios-notif', label: 'Horarios' },
      { key: 'agrupamiento', label: 'Agrupamiento' },
      { key: 'recordatorios-notif', label: 'Recordatorios' },
      { key: 'escalamientos-notif', label: 'Escalamientos' },
      { key: 'reintentos-notif', label: 'Reintentos' },
      { key: 'historial-notif', label: 'Historial' },
      { key: 'preferencias-usuario', label: 'Preferencias por usuario' },
      { key: 'mensajeria-interna', label: 'Mensajería', screen: 'mensajeria' },
    ],
  },
  {
    key: 'auditoria', label: 'Auditoría',
    description: 'Bitácora de accesos, cambios y eventos de seguridad',
    children: [
      { key: 'accesos-aud', label: 'Accesos' },
      { key: 'inicios-sesion', label: 'Inicios de sesión' },
      { key: 'cierres-sesion', label: 'Cierres de sesión' },
      { key: 'intentos-fallidos', label: 'Intentos fallidos' },
      {
        key: 'cambios-aud', label: 'Cambios',
        children: [
          { key: 'cambio-usuario', label: 'Usuario' },
          { key: 'cambio-empresa-aud', label: 'Empresa' },
          { key: 'cambio-modulo', label: 'Módulo' },
          { key: 'cambio-entidad', label: 'Entidad' },
          { key: 'cambio-registro', label: 'Registro' },
          { key: 'cambio-campo', label: 'Campo' },
          { key: 'cambio-valor-anterior', label: 'Valor anterior' },
          { key: 'cambio-valor-nuevo', label: 'Valor nuevo' },
          { key: 'cambio-fecha', label: 'Fecha' },
          { key: 'cambio-ip', label: 'IP' },
        ],
      },
      { key: 'eliminaciones', label: 'Eliminaciones' },
      { key: 'restauraciones', label: 'Restauraciones' },
      { key: 'aprobaciones-aud', label: 'Aprobaciones' },
      { key: 'rechazos', label: 'Rechazos' },
      { key: 'cancelaciones-aud', label: 'Cancelaciones' },
      { key: 'exportaciones', label: 'Exportaciones' },
      { key: 'importaciones', label: 'Importaciones' },
      { key: 'descargas', label: 'Descargas' },
      { key: 'cambios-permisos-aud', label: 'Cambios de permisos' },
      { key: 'cambios-config-aud', label: 'Cambios de configuración' },
      { key: 'apis-aud', label: 'APIs' },
      { key: 'integraciones-aud', label: 'Integraciones' },
      { key: 'eventos-seguridad', label: 'Eventos de seguridad' },
      { key: 'retencion-auditoria', label: 'Retención de auditoría' },
      { key: 'exportacion-auditoria', label: 'Exportación de auditoría' },
    ],
  },
  {
    key: 'sistema', label: 'Sistema',
    description: 'Correo, sesiones, logs y parámetros globales',
    children: [
      {
        key: 'general-sistema', label: 'General',
        children: [
          { key: 'nombre-sistema', label: 'Nombre del sistema' },
          { key: 'logo-sistema', label: 'Logo' },
          { key: 'favicon', label: 'Favicon' },
          { key: 'dominio', label: 'Dominio' },
          { key: 'url-publica', label: 'URL pública' },
          { key: 'idioma-sistema', label: 'Idioma' },
          { key: 'moneda-sistema', label: 'Moneda' },
          { key: 'zona-horaria-sistema', label: 'Zona horaria' },
          { key: 'formato-fecha', label: 'Formato de fecha' },
          { key: 'formato-hora', label: 'Formato de hora' },
        ],
      },
      {
        key: 'sesiones-sistema', label: 'Sesiones',
        children: [
          { key: 'timeout-sesion', label: 'Timeout' },
          { key: 'sesiones-concurrentes', label: 'Sesiones concurrentes' },
          { key: 'expiracion-sesion', label: 'Expiración' },
          { key: 'cierre-inactividad', label: 'Cierre por inactividad' },
          { key: 'recordar-sesion', label: 'Recordar sesión' },
        ],
      },
      {
        key: 'correo-sistema', label: 'Correo',
        children: [
          { key: 'smtp', label: 'SMTP' },
          { key: 'imap', label: 'IMAP' },
          { key: 'puerto-correo', label: 'Puerto' },
          { key: 'ssl-tls', label: 'SSL/TLS' },
          { key: 'usuario-correo', label: 'Usuario' },
          { key: 'password-correo', label: 'Contraseña' },
          { key: 'remitente', label: 'Remitente' },
          { key: 'firma-correo', label: 'Firma' },
          { key: 'prueba-conexion', label: 'Prueba de conexión' },
        ],
      },
      {
        key: 'archivos-sistema', label: 'Archivos',
        children: [
          { key: 'tamano-maximo', label: 'Tamaño máximo' },
          { key: 'extensiones-permitidas', label: 'Extensiones permitidas' },
          { key: 'extensiones-bloqueadas', label: 'Extensiones bloqueadas' },
          { key: 'antivirus', label: 'Antivirus' },
          { key: 'compresion', label: 'Compresión' },
          { key: 'cifrado-archivos', label: 'Cifrado' },
        ],
      },
      {
        key: 'jobs-scheduler', label: 'Jobs / Scheduler',
        children: [
          { key: 'procesos-programados', label: 'Procesos programados' },
          { key: 'frecuencia-jobs', label: 'Frecuencia' },
          { key: 'estado-jobs', label: 'Estado' },
          { key: 'reintentos-jobs', label: 'Reintentos' },
          { key: 'historial-jobs', label: 'Historial' },
        ],
      },
      {
        key: 'tiempo-real', label: 'Tiempo real',
        children: [
          { key: 'socket-io', label: 'Socket.IO' },
          { key: 'websocket', label: 'WebSocket' },
          { key: 'timeout-rt', label: 'Timeout' },
          { key: 'reconexion', label: 'Reconexión' },
        ],
      },
      {
        key: 'api-sistema', label: 'API',
        children: [
          { key: 'url-base', label: 'URL base' },
          { key: 'versionado', label: 'Versionado' },
          { key: 'rate-limit-api', label: 'Rate Limit' },
          { key: 'timeout-api', label: 'Timeout' },
          { key: 'cors', label: 'CORS' },
          { key: 'tokens-api', label: 'Tokens' },
          { key: 'logs-api', label: 'Logs' },
        ],
      },
      {
        key: 'logs-sistema', label: 'Logs',
        children: [
          { key: 'logs-aplicacion', label: 'Aplicación' },
          { key: 'logs-seguridad', label: 'Seguridad' },
          { key: 'logs-bd', label: 'Base de datos' },
          { key: 'logs-integraciones', label: 'Integraciones' },
          { key: 'logs-apis', label: 'APIs' },
          { key: 'logs-errores', label: 'Errores' },
          { key: 'nivel-log', label: 'Nivel de log' },
          { key: 'retencion-logs', label: 'Retención' },
        ],
      },
      {
        key: 'health-checks', label: 'Health Checks',
        children: [
          { key: 'health-backend', label: 'Backend' },
          { key: 'health-bd', label: 'Base de datos' },
          { key: 'health-telefonia', label: 'Telefonía' },
          { key: 'health-apis-externas', label: 'APIs externas' },
          { key: 'health-almacenamiento', label: 'Almacenamiento' },
          { key: 'health-servicios', label: 'Servicios' },
        ],
      },
      {
        key: 'mantenimiento-sistema', label: 'Mantenimiento',
        children: [
          { key: 'modo-mantenimiento', label: 'Modo mantenimiento' },
          { key: 'mensaje-mantenimiento', label: 'Mensaje' },
          { key: 'usuarios-permitidos-mant', label: 'Usuarios permitidos' },
          { key: 'ventana-mantenimiento', label: 'Ventana de mantenimiento' },
        ],
      },
      {
        key: 'import-export', label: 'Importación / Exportación',
        children: [
          { key: 'excel', label: 'Excel' },
          { key: 'csv', label: 'CSV' },
          { key: 'json', label: 'JSON' },
          { key: 'plantillas-ie', label: 'Plantillas' },
          { key: 'mapeo-campos-ie', label: 'Mapeo de campos' },
          { key: 'validaciones-ie', label: 'Validaciones' },
          { key: 'historial-ie', label: 'Historial' },
        ],
      },
      {
        key: 'licenciamiento', label: 'Licenciamiento',
        children: [
          { key: 'tipo-licencia', label: 'Tipo de licencia' },
          { key: 'modulos-habilitados', label: 'Módulos habilitados' },
          { key: 'usuarios-permitidos-lic', label: 'Usuarios permitidos' },
          { key: 'vigencia-licencia', label: 'Vigencia' },
          { key: 'estado-licencia', label: 'Estado' },
        ],
      },
      {
        key: 'parametros-avanzados', label: 'Parámetros avanzados',
        children: [
          { key: 'variables-globales', label: 'Variables globales' },
          { key: 'parametros-empresa', label: 'Parámetros por empresa' },
          { key: 'parametros-modulo', label: 'Parámetros por módulo' },
          { key: 'parametros-sucursal', label: 'Parámetros por sucursal' },
          { key: 'valores-predeterminados', label: 'Valores predeterminados' },
          { key: 'herencia-parametros', label: 'Herencia' },
          { key: 'sobrescritura', label: 'Sobrescritura' },
          { key: 'cifrado-parametros', label: 'Cifrado' },
          { key: 'historial-cambios-parametros', label: 'Historial de cambios' },
        ],
      },
    ],
  },
]

/* ─────────────────────── Reacomodo: Sección → Módulo ─────────────────────── */

// Índice plano key -> nodo. Avisa si una key se repite (las apariciones
// compartidas usan keys prefijadas justamente para no chocar).
function indexar(nodes: ConfigNode[]): Record<string, ConfigNode> {
  const idx: Record<string, ConfigNode> = {}
  const walk = (ns: ConfigNode[]) => {
    for (const n of ns) {
      if (idx[n.key]) console.warn(`configTree: key duplicada '${n.key}'`)
      idx[n.key] = n
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return idx
}

const CATALOGO_INDEX = indexar(CATALOGO)

// Nodo del catálogo por key, con etiqueta opcional. Una key inexistente no
// rompe la pantalla: se avisa en consola y queda como "próximamente".
function nodo(key: string, label?: string): ConfigNode {
  const n = CATALOGO_INDEX[key]
  if (!n) {
    console.warn(`configTree: la key '${key}' no existe en CATALOGO`)
    return { key, label: label ?? key }
  }
  return label ? { ...n, label } : n
}

function nodos(...keys: string[]): ConfigNode[] {
  return keys.map((k) => nodo(k))
}

// Hijos de un contenedor del catálogo, para aplanarlo dentro de un módulo.
function hijosDe(key: string): ConfigNode[] {
  return nodo(key).children ?? []
}

// Contenedor del catálogo sin el prefijo numérico ("3.2 Fiscal" → "Fiscal").
function grupo(key: string, label?: string): ConfigNode {
  const n = nodo(key)
  return { ...n, label: label ?? n.label.replace(/^\d+(\.\d+)*\s+/, '') }
}

function modulo(key: string, label: string, moduleKey: string | undefined, children: ConfigNode[]): ConfigNode {
  return { key, label, moduleKey, children }
}

// Una configuración compartida aparece en cada módulo que la usa. La aparición
// extra es un clon con keys prefijadas (las keys deben ser únicas en el índice)
// pero con la misma `screen`: es la misma configuración, no una copia.
function compartida(key: string, en: string): ConfigNode {
  const clonar = (n: ConfigNode): ConfigNode => ({
    ...n,
    key: `${en}:${n.key}`,
    children: n.children?.map(clonar),
  })
  return clonar(nodo(key))
}

// Lo que no pertenece a un módulo del sidebar.
const GENERAL: ConfigNode = {
  key: 'sec-general', label: 'General',
  description: 'Empresa, apariencia, usuarios, notificaciones, integraciones y sistema',
  children: [
    nodo('modulos-empresa'),
    nodo('apariencia'),
    nodo('organizacion'),
    nodo('usuarios-seguridad'),
    // Mensajería interna vive en Principal → Mensajería.
    { ...nodo('notificaciones-root'), children: hijosDe('notificaciones-root').filter((c) => c.key !== 'mensajeria-interna') },
    nodo('integraciones'),
    nodo('catalogos'),
    nodo('sistema'),
    { key: 'herramientas', label: 'Herramientas', children: [nodo('qr-generator')] },
  ],
}

// Módulos de cada sección del sidebar (key de NAV_GROUPS). Las secciones sin
// módulos configurables no se muestran.
const MODULOS_POR_SECCION: Record<string, ConfigNode[]> = {
  principal: [
    modulo('mod-mensajeria', 'Mensajería', 'mensajeria', [nodo('mensajeria-interna', 'Mensajería interna')]),
  ],
  'recursos-humanos': [
    // Tipos de pausa: compartida con Nómina y Contact Center (cada tipo indica en qué módulos cuenta).
    modulo('mod-asistencia', 'Asistencia', 'asistencia', [compartida('pausas', 'asistencia')]),
    modulo('mod-nomina', 'Nómina', 'nomina', [compartida('pausas', 'nomina'), ...hijosDe('rrhh-nomina')]),
  ],
  'finanzas-administracion': [
    modulo('mod-finanzas', 'Finanzas', 'finanzas', [
      {
        ...compartida('facturacion', 'finanzas'),
        pendiente: 'Finanzas todavía no usa esta configuración; hoy solo la usa CRM → Oportunidades para timbrar.',
      },
      grupo('finanzas', 'Contabilidad'),
      grupo('fiscal'),
      grupo('cxc'),
      grupo('cxp'),
      grupo('bancos'),
      grupo('tesoreria'),
      grupo('presupuestos'),
    ]),
    modulo('mod-gastos', 'Gastos', 'gastos', hijosDe('gastos-erp')),
    // Sin módulo en el sidebar todavía — solo configuración planeada.
    modulo('mod-compras', 'Compras', undefined, hijosDe('compras')),
    modulo('mod-inventario', 'Inventario', undefined, hijosDe('inventario')),
    modulo('mod-proveedores', 'Proveedores', undefined, hijosDe('proveedores')),
  ],
  crm: [
    modulo('mod-ventas-area', 'Ventas (Área)', 'ventas-area', [
      ...nodos('metas-config', 'comisiones-config', 'incentivos-config', 'prospeccion-config'),
      grupo('ventas-erp', 'Ventas (ERP)'),
    ]),
    modulo('mod-clientes', 'Clientes', 'clientes', [
      nodo('clientes-crm', 'Catálogos de clientes'),
      grupo('clientes-erp', 'Clientes (ERP)'),
    ]),
    modulo('mod-productos-servicios', 'Productos y Servicios', 'productos-servicios', hijosDe('productos')),
    modulo('mod-oportunidades', 'Oportunidades', 'crm', [
      nodo('cotizaciones-facturacion'),
      ...nodos(
        'prospectos', 'fuentes-lead', 'campanas-comerciales', 'pipeline', 'oportunidades', 'actividades-crm',
        'motivos-perdida-crm', 'motivos-cierre-crm', 'sla-seguimiento', 'reglas-asignacion-crm',
        'campos-personalizados-crm', 'formularios-crm', 'etiquetas-crm', 'automatizaciones-crm',
        'recordatorios-crm', 'alertas-crm', 'duplicados',
      ),
    ]),
    modulo('mod-email-marketing', 'Email Marketing', 'email-marketing', [
      nodo('email-marketing-config', 'Configuración de Email Marketing'),
    ]),
  ],
  'contact-center': [
    modulo('mod-operaciones', 'Asesores y operación', 'operaciones', [
      ...nodos('cc-skills', 'cc-formularios', 'cc-config', 'pausas', 'cc-simulador'),
      ...nodos(
        'campanas-cc', 'colas', 'skills', 'equipos-cc', 'agentes', 'supervisores', 'grupos-cc',
        'estados-agente', 'tipificaciones', 'sla-cc', 'prioridades-cc', 'routing', 'overflow',
        'reglas-distribucion', 'maximo-espera', 'abandono', 'callback', 'reintentos-cc',
        'reciclado-leads', 'horarios-cc', 'festivos-cc', 'limites-concurrencia',
      ),
    ]),
    modulo('mod-postulantes', 'Postulantes', 'postulantes', [nodo('cc-postulantes')]),
    modulo('mod-webphone', 'Marcador', 'webphone', [
      ...hijosDe('telefonia'),
      ...nodos('ivr', 'flujos-llamada', 'grabaciones', 'audios', 'musica-espera'),
    ]),
    modulo('mod-livechat', 'Canales digitales', 'livechat', nodos('whatsapp-cc', 'chat-cc', 'email-cc', 'sms-cc')),
  ],
  calidad: [
    modulo('mod-auditoria', 'Auditoría', 'auditoria', hijosDe('auditoria')),
  ],
  'tecnologia-ti': [
    modulo('mod-tickets', 'Tickets y Mesa de servicio', 'tickets', [
      ...nodos(
        'ti-general', 'ti-mesa-servicio', 'ti-categorias', 'ti-campos-personalizados', 'ti-catalogos',
        'ti-reglas', 'ti-sla', 'ti-kpis', 'ti-escalamientos', 'ti-automatizaciones', 'ti-plantillas',
        'ti-notificaciones', 'ti-encuestas', 'ti-campania-soporte', 'ti-chat-vivo', 'ti-chatbot',
        'ti-kb', 'ti-seguridad', 'ti-integraciones',
      ),
      ...nodos(
        'mesa-servicio', 'especialidades', 'reglas-asignacion-ti', 'escalamientos', 'calendarios-soporte',
        'horarios-ti', 'incidentes', 'problemas', 'solicitudes-ti', 'alertas-ti', 'base-conocimiento',
      ),
    ]),
    modulo('mod-staff-ti', 'Staff TI', 'staff-ti', nodos('ti-tecnicos', 'ti-grupos-soporte', 'grupos-soporte', 'tecnicos-ti')),
    modulo('mod-activos', 'Activos', 'activos', [
      grupo('activos-erp', 'Activos fijos'),
      ...nodos('inventario-ti', 'licencias', 'contratos-ti', 'proveedores-ti'),
    ]),
    modulo('mod-tecnologia', 'Tecnología', 'tecnologia', [
      ...nodos('cambios-ti', 'mantenimiento-ti', 'monitoreo'),
      grupo('mantenimiento-erp', 'Mantenimiento de equipos'),
    ]),
  ],
  'legal-cumplimiento': [
    modulo('mod-legal', 'Legal', 'legal', [grupo('contratos-erp', 'Contratos')]),
  ],
  otros: [
    modulo('mod-proyectos', 'Proyectos', 'proyectos', hijosDe('proyectos-erp')),
  ],
}

const DESCRIPCION_SECCION: Record<string, string> = {
  principal: 'Mensajería interna',
  'recursos-humanos': 'Asistencia, tipos de pausa, nómina y políticas de personal',
  'finanzas-administracion': 'Facturación, contabilidad, fiscal, bancos, gastos y compras',
  crm: 'Ventas, clientes, productos, oportunidades y email marketing',
  'contact-center': 'Asesores, campañas, postulantes, marcador y canales',
  calidad: 'Auditoría de accesos, cambios y eventos',
  'tecnologia-ti': 'Mesa de servicio, staff TI, activos y tecnología',
  'legal-cumplimiento': 'Contratos y cumplimiento',
  otros: 'Proyectos',
}

const ARBOL: ConfigNode[] = [
  GENERAL,
  ...NAV_GROUPS
    .filter((g) => MODULOS_POR_SECCION[g.key]?.length)
    .map((g) => ({
      key: `sec-${g.key}`,
      label: g.label,
      description: DESCRIPCION_SECCION[g.key],
      children: MODULOS_POR_SECCION[g.key],
    })),
]

// Red de seguridad: toda hoja del catálogo que no quedó ubicada en ARBOL va a
// "Por clasificar", para que ninguna configuración desaparezca del mapa.
const POR_CLASIFICAR: ConfigNode[] = (() => {
  const ubicadas = indexar(ARBOL)
  const fuera: ConfigNode[] = []
  const walk = (ns: ConfigNode[]) => {
    for (const n of ns) {
      if (n.children?.length) walk(n.children)
      else if (!ubicadas[n.key]) fuera.push(n)
    }
  }
  walk(CATALOGO)
  if (fuera.length) console.warn('configTree: configuraciones sin ubicar →', fuera.map((n) => n.key))
  return fuera
})()

export const CONFIG_TREE: ConfigNode[] = POR_CLASIFICAR.length
  ? ARBOL.map((s) => (s.key === 'sec-general'
    ? { ...s, children: [...(s.children ?? []), { key: 'por-clasificar', label: 'Por clasificar', children: POR_CLASIFICAR }] }
    : s))
  : ARBOL

// Índice plano key -> nodo, para lookup O(1) al seleccionar.
export const CONFIG_NODE_INDEX: Record<string, ConfigNode> = indexar(CONFIG_TREE)

export interface UbicacionConfig {
  key: string
  ruta: string[] // etiquetas desde la sección hasta el nodo (inclusive)
}

// Rutas de todas las apariciones de cada nodo del árbol.
function recorrer(nodes: ConfigNode[], visita: (n: ConfigNode, ruta: string[]) => void, trail: string[] = []) {
  for (const n of nodes) {
    const ruta = [...trail, n.label]
    visita(n, ruta)
    if (n.children) recorrer(n.children, visita, ruta)
  }
}

// Todas las apariciones de cada pantalla real. Una pantalla con más de una
// aparición es una configuración compartida entre módulos.
export const UBICACIONES_POR_PANTALLA: Record<string, UbicacionConfig[]> = (() => {
  const out: Record<string, UbicacionConfig[]> = {}
  recorrer(CONFIG_TREE, (n, ruta) => {
    if (n.screen) (out[n.screen] ??= []).push({ key: n.key, ruta })
  })
  return out
})()

// Configuraciones pendientes, con su ubicación: las "próximamente" (hojas sin
// pantalla) y las que existen pero su módulo aún no usa (`pendiente`).
export const PENDIENTES: UbicacionConfig[] = (() => {
  const out: UbicacionConfig[] = []
  recorrer(CONFIG_TREE, (n, ruta) => {
    if ((!n.screen && !n.children?.length) || n.pendiente) out.push({ key: n.key, ruta })
  })
  return out
})()
