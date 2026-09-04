const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Catálogos SAT fijos y pequeños — se declaran aquí (no valen la pena en tabla).
// Fuente: Anexo 20 CFDI 4.0.
const REGIMEN_FISCAL = [
  { c: '601', d: 'General de Ley Personas Morales' },
  { c: '603', d: 'Personas Morales con Fines no Lucrativos' },
  { c: '605', d: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { c: '606', d: 'Arrendamiento' },
  { c: '607', d: 'Régimen de Enajenación o Adquisición de Bienes' },
  { c: '608', d: 'Demás ingresos' },
  { c: '610', d: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { c: '611', d: 'Ingresos por Dividendos (socios y accionistas)' },
  { c: '612', d: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { c: '614', d: 'Ingresos por intereses' },
  { c: '615', d: 'Régimen de los ingresos por obtención de premios' },
  { c: '616', d: 'Sin obligaciones fiscales' },
  { c: '620', d: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { c: '621', d: 'Incorporación Fiscal' },
  { c: '622', d: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { c: '623', d: 'Opcional para Grupos de Sociedades' },
  { c: '624', d: 'Coordinados' },
  { c: '625', d: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { c: '626', d: 'Régimen Simplificado de Confianza' },
];

const USO_CFDI = [
  { c: 'G01', d: 'Adquisición de mercancías' },
  { c: 'G02', d: 'Devoluciones, descuentos o bonificaciones' },
  { c: 'G03', d: 'Gastos en general' },
  { c: 'I01', d: 'Construcciones' },
  { c: 'I02', d: 'Mobiliario y equipo de oficina por inversiones' },
  { c: 'I03', d: 'Equipo de transporte' },
  { c: 'I04', d: 'Equipo de cómputo y accesorios' },
  { c: 'I05', d: 'Dados, troqueles, moldes, matrices y herramental' },
  { c: 'I06', d: 'Comunicaciones telefónicas' },
  { c: 'I07', d: 'Comunicaciones satelitales' },
  { c: 'I08', d: 'Otra maquinaria y equipo' },
  { c: 'D01', d: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { c: 'D02', d: 'Gastos médicos por incapacidad o discapacidad' },
  { c: 'D03', d: 'Gastos funerales' },
  { c: 'D04', d: 'Donativos' },
  { c: 'D05', d: 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)' },
  { c: 'D06', d: 'Aportaciones voluntarias al SAR' },
  { c: 'D07', d: 'Primas por seguros de gastos médicos' },
  { c: 'D08', d: 'Gastos de transportación escolar obligatoria' },
  { c: 'D09', d: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones' },
  { c: 'D10', d: 'Pagos por servicios educativos (colegiaturas)' },
  { c: 'S01', d: 'Sin efectos fiscales' },
  { c: 'CP01', d: 'Pagos' },
  { c: 'CN01', d: 'Nómina' },
];

const FORMA_PAGO = [
  { c: '01', d: 'Efectivo' },
  { c: '02', d: 'Cheque nominativo' },
  { c: '03', d: 'Transferencia electrónica de fondos' },
  { c: '04', d: 'Tarjeta de crédito' },
  { c: '05', d: 'Monedero electrónico' },
  { c: '06', d: 'Dinero electrónico' },
  { c: '08', d: 'Vales de despensa' },
  { c: '12', d: 'Dación en pago' },
  { c: '13', d: 'Pago por subrogación' },
  { c: '14', d: 'Pago por consignación' },
  { c: '15', d: 'Condonación' },
  { c: '17', d: 'Compensación' },
  { c: '23', d: 'Novación' },
  { c: '24', d: 'Confusión' },
  { c: '25', d: 'Remisión de deuda' },
  { c: '26', d: 'Prescripción o caducidad' },
  { c: '27', d: 'A satisfacción del acreedor' },
  { c: '28', d: 'Tarjeta de débito' },
  { c: '29', d: 'Tarjeta de servicios' },
  { c: '30', d: 'Aplicación de anticipos' },
  { c: '31', d: 'Intermediario pagos' },
  { c: '99', d: 'Por definir' },
];

const METODO_PAGO = [
  { c: 'PUE', d: 'Pago en una sola exhibición' },
  { c: 'PPD', d: 'Pago en parcialidades o diferido' },
];

exports.listRegimenFiscal = (_req, res) => res.json({ success: true, data: REGIMEN_FISCAL });
exports.listUsoCfdi = (_req, res) => res.json({ success: true, data: USO_CFDI });
exports.listFormaPago = (_req, res) => res.json({ success: true, data: FORMA_PAGO });
exports.listMetodoPago = (_req, res) => res.json({ success: true, data: METODO_PAGO });

async function buscar(req, res, tabla, colClave, colVal) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const pool = await databaseService.getPool(req.user?.empresa);
    // CI_AI = búsqueda insensible a mayúsculas y acentos.
    const r = await pool.request()
      .input('like', sql.NVarChar(210), `%${q}%`)
      .input('pref', sql.NVarChar(210), `${q}%`)
      .query(`SELECT TOP 50 ${colClave} AS clave, ${colVal} AS descripcion
              FROM dbo.${tabla}
              WHERE ${colClave} LIKE @pref
                 OR ${colVal} COLLATE Latin1_General_CI_AI LIKE @like COLLATE Latin1_General_CI_AI
              ORDER BY CASE WHEN ${colClave} LIKE @pref THEN 0 ELSE 1 END, ${colClave}`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('sat buscar:', e.message);
    res.status(500).json({ success: false, message: 'Error al consultar el catálogo SAT' });
  }
}

exports.buscarProdServ = (req, res) => buscar(req, res, 'SAT_CLAVE_PROD_SERV', 'SPS_CLAVE', 'SPS_DESCRIPCION');
exports.buscarUnidades = (req, res) => buscar(req, res, 'SAT_CLAVE_UNIDAD', 'SCU_CLAVE', 'SCU_NOMBRE');
