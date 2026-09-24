// Catálogos oficiales del SAT (vigentes al momento de escribir esto) usados
// por el formulario público de datos fiscales. Solo se listan las claves más
// usadas en operación normal — el SAT tiene variantes de nicho (ej. régimen
// de "Enajenación de acciones en bolsa") que no aplican a un cliente típico
// de AGYDA; si algún cliente real las necesita, se agregan aquí.

const REGIMENES_FISCALES = [
  { clave: '601', descripcion: 'General de Ley Personas Morales' },
  { clave: '603', descripcion: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', descripcion: 'Arrendamiento' },
  { clave: '607', descripcion: 'Régimen de Enajenación o Adquisición de Bienes' },
  { clave: '608', descripcion: 'Demás ingresos' },
  { clave: '610', descripcion: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { clave: '611', descripcion: 'Ingresos por Dividendos (socios y accionistas)' },
  { clave: '612', descripcion: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '614', descripcion: 'Ingresos por intereses' },
  { clave: '615', descripcion: 'Régimen de los ingresos por obtención de premios' },
  { clave: '616', descripcion: 'Sin obligaciones fiscales' },
  { clave: '620', descripcion: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { clave: '621', descripcion: 'Incorporación Fiscal' },
  { clave: '622', descripcion: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { clave: '623', descripcion: 'Opcional para Grupos de Sociedades' },
  { clave: '624', descripcion: 'Coordinados' },
  { clave: '625', descripcion: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { clave: '626', descripcion: 'Régimen Simplificado de Confianza' },
];

const USOS_CFDI = [
  { clave: 'G01', descripcion: 'Adquisición de mercancías' },
  { clave: 'G02', descripcion: 'Devoluciones, descuentos o bonificaciones' },
  { clave: 'G03', descripcion: 'Gastos en general' },
  { clave: 'I01', descripcion: 'Construcciones' },
  { clave: 'I02', descripcion: 'Mobiliario y equipo de oficina por inversiones' },
  { clave: 'I03', descripcion: 'Equipo de transporte' },
  { clave: 'I04', descripcion: 'Equipo de cómputo y accesorios' },
  { clave: 'I05', descripcion: 'Dados, troqueles, moldes, matrices y otros activos' },
  { clave: 'I06', descripcion: 'Comunicaciones telefónicas' },
  { clave: 'I07', descripcion: 'Comunicaciones satelitales' },
  { clave: 'I08', descripcion: 'Otra maquinaria y equipo' },
  { clave: 'D01', descripcion: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { clave: 'D02', descripcion: 'Gastos médicos por incapacidad o discapacidad' },
  { clave: 'D03', descripcion: 'Gastos funerales' },
  { clave: 'D04', descripcion: 'Donativos' },
  { clave: 'D05', descripcion: 'Intereses reales por créditos hipotecarios (casa habitación)' },
  { clave: 'D06', descripcion: 'Aportaciones voluntarias al SAR' },
  { clave: 'D07', descripcion: 'Primas por seguros de gastos médicos' },
  { clave: 'D08', descripcion: 'Gastos de transportación escolar obligatoria' },
  { clave: 'D09', descripcion: 'Depósitos en cuentas para el ahorro, pensiones' },
  { clave: 'D10', descripcion: 'Pagos por servicios educativos (colegiaturas)' },
  { clave: 'S01', descripcion: 'Sin efectos fiscales' },
  { clave: 'CP01', descripcion: 'Pagos' },
  { clave: 'CN01', descripcion: 'Nómina' },
];

module.exports = { REGIMENES_FISCALES, USOS_CFDI };
