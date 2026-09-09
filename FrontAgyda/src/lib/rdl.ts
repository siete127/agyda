// Parser de definiciones RDL / RDLC (SQL Server Reporting Services) del lado del
// navegador — usa DOMParser nativo, sin dependencias. Extrae lo que se puede
// representar en la vista previa de la Suite de Reportes: parámetros, datasets
// (con su query y campos) y los data regions tipo Tablix / Table / Matrix / List
// con sus columnas.
//
// "Compatible" aquí significa: el XML es un Report válido de alguno de los
// namespaces conocidos de RS (2005 / 2008 / 2010 / 2016) y pudimos leer su
// estructura. No ejecuta la query — para eso hace falta un servidor SSRS.

export interface RdlField {
  name: string
  dataField: string | null
  typeName: string | null
}

export interface RdlDataSet {
  name: string
  commandType: string | null
  commandText: string | null
  dataSourceName: string | null
  fields: RdlField[]
}

export interface RdlParameter {
  name: string
  prompt: string | null
  dataType: string | null
  nullable: boolean
  multiValue: boolean
  defaultValues: string[]
}

export interface RdlDataRegion {
  name: string
  type: 'Tablix' | 'Table' | 'Matrix' | 'List' | 'Chart' | 'Otro'
  dataSetName: string | null
  columns: string[]
}

export interface RdlDefinition {
  compatible: boolean
  reason?: string
  reportName: string | null
  namespace: string | null
  rdlVersion: string | null
  description: string | null
  author: string | null
  pageSize: { width: string | null; height: string | null }
  dataSources: string[]
  dataSets: RdlDataSet[]
  parameters: RdlParameter[]
  dataRegions: RdlDataRegion[]
}

const KNOWN_RS_NS = [
  'reportdefinition',        // .../reporting/YYYY/MM/reportdefinition
  'reportdesigner',
]

function localName(el: Element | null): string {
  if (!el) return ''
  return el.localName || el.nodeName.replace(/^.*:/, '')
}

// Devuelve hijos directos cuyo localName coincida (ignora prefijo de namespace).
function childrenByLocal(parent: Element, name: string): Element[] {
  const out: Element[] = []
  for (const c of Array.from(parent.children)) {
    if (localName(c) === name) out.push(c)
  }
  return out
}

function firstByLocal(parent: Element, name: string): Element | null {
  return childrenByLocal(parent, name)[0] ?? null
}

function textByLocal(parent: Element, name: string): string | null {
  const el = firstByLocal(parent, name)
  const t = el?.textContent?.trim()
  return t ? t : null
}

// Busca en profundidad todos los elementos con ese localName.
function deepByLocal(root: Element, name: string): Element[] {
  const out: Element[] = []
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (localName(c) === name) out.push(c)
      walk(c)
    }
  }
  walk(root)
  return out
}

function rdlVersionFromNs(ns: string | null): string | null {
  if (!ns) return null
  // .../reporting/2016/01/reportdefinition  → "2016-01"
  const m = ns.match(/reporting\/(\d{4})\/(\d{2})\//)
  if (m) return `${m[1]}-${m[2]}`
  if (/2008\/01/.test(ns)) return '2008-01'
  if (/2005/.test(ns)) return '2005'
  return null
}

function parseFields(dataSetEl: Element): RdlField[] {
  const fieldsWrap = firstByLocal(dataSetEl, 'Fields')
  if (!fieldsWrap) return []
  return childrenByLocal(fieldsWrap, 'Field').map((f) => {
    const dataField = textByLocal(f, 'DataField')
    // <rd:TypeName> vive en un namespace distinto (reportdesigner) pero
    // localName sigue siendo "TypeName".
    const typeName = textByLocal(f, 'TypeName')
    return {
      name: f.getAttribute('Name') || dataField || '(campo)',
      dataField,
      typeName,
    }
  })
}

function parseDataSets(report: Element): RdlDataSet[] {
  const wrap = firstByLocal(report, 'DataSets')
  if (!wrap) return []
  return childrenByLocal(wrap, 'DataSet').map((ds) => {
    const query = firstByLocal(ds, 'Query')
    return {
      name: ds.getAttribute('Name') || '(dataset)',
      commandType: query ? textByLocal(query, 'CommandType') : null,
      commandText: query ? textByLocal(query, 'CommandText') : null,
      dataSourceName: query ? textByLocal(query, 'DataSourceName') : null,
      fields: parseFields(ds),
    }
  })
}

function parseDataSources(report: Element): string[] {
  const wrap = firstByLocal(report, 'DataSources')
  if (!wrap) return []
  return childrenByLocal(wrap, 'DataSource').map((d) => d.getAttribute('Name') || '(origen)')
}

function parseParameters(report: Element): RdlParameter[] {
  const wrap = firstByLocal(report, 'ReportParameters')
  if (!wrap) return []
  return childrenByLocal(wrap, 'ReportParameter').map((p) => {
    const dv = firstByLocal(p, 'DefaultValue')
    const values = dv ? firstByLocal(dv, 'Values') : null
    const defaultValues = values
      ? childrenByLocal(values, 'Value').map((v) => v.textContent?.trim() || '').filter(Boolean)
      : []
    return {
      name: p.getAttribute('Name') || '(parámetro)',
      prompt: textByLocal(p, 'Prompt'),
      dataType: textByLocal(p, 'DataType'),
      nullable: (textByLocal(p, 'Nullable') || '').toLowerCase() === 'true',
      multiValue: (textByLocal(p, 'MultiValue') || '').toLowerCase() === 'true',
      defaultValues,
    }
  })
}

// Columnas de un Tablix: se leen de <TablixHeader><CellContents>…<TextRun><Value>.
function tablixColumns(tablix: Element): string[] {
  const body = firstByLocal(tablix, 'TablixBody')
  const cols: string[] = []
  // Ruta moderna (2008+): TablixHeader dentro de TablixMember de la columna
  const corner = firstByLocal(tablix, 'TablixColumnHierarchy')
  if (corner) {
    for (const member of deepByLocal(corner, 'TablixMember')) {
      const header = firstByLocal(member, 'TablixHeader')
      if (!header) continue
      const value = deepByLocal(header, 'Value')[0]?.textContent?.trim()
      if (value) cols.push(cleanExpr(value))
    }
  }
  if (cols.length > 0) return cols

  // Fallback: primera fila del cuerpo → texto de cada celda
  if (body) {
    const rows = deepByLocal(body, 'TablixRow')
    if (rows.length > 0) {
      for (const cell of deepByLocal(rows[0], 'TextRun')) {
        const v = firstByLocal(cell, 'Value')?.textContent?.trim()
        if (v) cols.push(cleanExpr(v))
      }
    }
  }
  return cols
}

// Table clásica (2005): <Table><Header><TableRows><TableRow><TableCells>…
function tableColumns(table: Element): string[] {
  const header = firstByLocal(table, 'Header')
  const cols: string[] = []
  const scope = header || table
  for (const tr of deepByLocal(scope, 'TableRow')) {
    for (const val of deepByLocal(tr, 'Value')) {
      const v = val.textContent?.trim()
      if (v) cols.push(cleanExpr(v))
    }
    if (cols.length > 0) break
  }
  return cols
}

function cleanExpr(raw: string): string {
  // "=Fields!Nombre.Value" → "Nombre";  "=Parameters!X.Value" → "X"
  const m = raw.match(/=?\s*Fields!([A-Za-z0-9_]+)\.Value/)
  if (m) return m[1]
  return raw.replace(/^=/, '')
}

function parseDataRegions(report: Element): RdlDataRegion[] {
  const out: RdlDataRegion[] = []
  const seen = new Set<Element>()

  for (const tablix of deepByLocal(report, 'Tablix')) {
    if (seen.has(tablix)) continue
    seen.add(tablix)
    out.push({
      name: tablix.getAttribute('Name') || 'Tablix',
      type: 'Tablix',
      dataSetName: textByLocal(tablix, 'DataSetName'),
      columns: tablixColumns(tablix),
    })
  }
  for (const table of deepByLocal(report, 'Table')) {
    if (seen.has(table)) continue
    seen.add(table)
    out.push({
      name: table.getAttribute('Name') || 'Table',
      type: 'Table',
      dataSetName: textByLocal(table, 'DataSetName'),
      columns: tableColumns(table),
    })
  }
  for (const matrix of deepByLocal(report, 'Matrix')) {
    if (seen.has(matrix)) continue
    seen.add(matrix)
    out.push({
      name: matrix.getAttribute('Name') || 'Matrix',
      type: 'Matrix',
      dataSetName: textByLocal(matrix, 'DataSetName'),
      columns: [],
    })
  }
  for (const chart of deepByLocal(report, 'Chart')) {
    if (seen.has(chart)) continue
    seen.add(chart)
    out.push({
      name: chart.getAttribute('Name') || 'Chart',
      type: 'Chart',
      dataSetName: textByLocal(chart, 'DataSetName'),
      columns: [],
    })
  }
  return out
}

const EMPTY: RdlDefinition = {
  compatible: false,
  reportName: null,
  namespace: null,
  rdlVersion: null,
  description: null,
  author: null,
  pageSize: { width: null, height: null },
  dataSources: [],
  dataSets: [],
  parameters: [],
  dataRegions: [],
}

export function parseRdl(xmlText: string): RdlDefinition {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  } catch {
    return { ...EMPTY, reason: 'No se pudo leer el XML del archivo.' }
  }

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return { ...EMPTY, reason: 'El archivo no es un XML válido.' }
  }

  const report = doc.documentElement
  if (!report || localName(report) !== 'Report') {
    return { ...EMPTY, reason: 'El archivo no tiene un elemento raíz <Report> — no parece un RDL.' }
  }

  const ns = report.namespaceURI
  const nsOk = !ns || KNOWN_RS_NS.some((k) => ns.toLowerCase().includes(k))

  const def: RdlDefinition = {
    compatible: true,
    reportName: textByLocal(report, 'ReportName') || report.getAttribute('Name'),
    namespace: ns,
    rdlVersion: rdlVersionFromNs(ns),
    description: textByLocal(report, 'Description'),
    author: textByLocal(report, 'Author'),
    pageSize: {
      width: textByLocal(report, 'PageWidth') || textByLocal(report, 'Width'),
      height: textByLocal(report, 'PageHeight') || textByLocal(report, 'Height'),
    },
    dataSources: parseDataSources(report),
    dataSets: parseDataSets(report),
    parameters: parseParameters(report),
    dataRegions: parseDataRegions(report),
  }

  if (!nsOk) {
    def.compatible = false
    def.reason = 'El namespace del Report no corresponde a una versión conocida de Reporting Services. Se leyó lo que se pudo.'
  }

  return def
}
