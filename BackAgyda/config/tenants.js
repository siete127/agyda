// Catálogo de empresas (tenants). Las dos empresas originales (Ardaby Tec y
// Demo) siguen fijas — son las que ya existían antes de que este catálogo
// fuera dinámico. Las empresas creadas después desde el módulo de Accesos
// viven en la tabla INTRANET_EMPRESAS de la BD maestra ('agyda'/intranet) y
// se cargan a un caché en memoria (ver loadDynamicTenants/registerTenant).
//
// getTenantConfig/getPool siguen siendo síncronos a propósito: se llaman
// desde decenas de puntos del código existente sin await. Por eso el catálogo
// dinámico se carga una vez al boot (databaseService.initialize) y se
// actualiza en memoria inmediatamente tras crear una empresa nueva —dbFile
// nunca se lee on-demand en medio de un request.
const STATIC_TENANTS = {
  agyda: {
    nombre: 'Ardaby Tec',
    database: process.env.DB_NAME || 'intranet',
  },
  demo: {
    nombre: 'Demo',
    database: process.env.DB_NAME_DEMO || 'intranet_AGYDA_QA',
  },
};

// tenantKey -> { nombre, database }. Empieza como copia de STATIC_TENANTS;
// loadDynamicTenants() la completa con lo que haya en INTRANET_EMPRESAS.
const TENANTS = { ...STATIC_TENANTS };

const DEFAULT_TENANT = 'agyda';

function getTenantConfig(tenantKey) {
  const key = (tenantKey || DEFAULT_TENANT).toLowerCase();
  const tenant = TENANTS[key];
  if (!tenant) throw new Error(`Empresa desconocida: ${tenantKey}`);
  return { key, ...tenant };
}

function listTenants() {
  return Object.entries(TENANTS).map(([key, t]) => ({ key, nombre: t.nombre }));
}

// Agrega o reemplaza un tenant en el caché en memoria — usado al crear una
// empresa nueva, para que quede disponible sin reiniciar el proceso.
function registerTenant(key, nombre, database) {
  const k = String(key).toLowerCase();
  TENANTS[k] = { nombre, database };
}

module.exports = { TENANTS, DEFAULT_TENANT, getTenantConfig, listTenants, registerTenant };
