const $ = (id) => document.getElementById(id);
let autoRefreshState = null;
let autoRefreshInitialized = false;
let lastObservedRefresh = null;
let lastFocusBeforeLoader = null;
let decisionDashboardLoaded = false;
let decisionDashboardLoading = false;
let decisionDashboardData = null;
let decisionRetryTimer = null;
let decisionSourceBatchIds = [];
let decisionSourceBatchPolicy = null;
let universePriorityLoaded = false;
let universePriorityLoading = false;
let universePriorityData = null;
let universePriorityRetryTimer = null;

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function showMessage(text, error = false) {
  const message = $('message');
  const messageText = $('messageText');
  if (!message || !messageText) return;
  messageText.textContent = text;
  message.classList.remove('hidden', 'error');
  message.setAttribute('aria-hidden', 'false');
  message.setAttribute('role', error ? 'alert' : 'status');
  message.setAttribute('aria-live', error ? 'assertive' : 'polite');
  if (error) message.classList.add('error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function hideMessage() {
  const message = $('message');
  if (message) {
    message.classList.add('hidden');
    message.setAttribute('aria-hidden', 'true');
  }
}
function showLoading(text = 'Procesando información...') {
  const loader = $('globalLoader');
  const loaderText = $('globalLoaderText');
  if (loaderText) loaderText.textContent = text;
  const progress = $('globalLoaderProgress');
  const detail = $('globalLoaderProgressDetail');
  const cancel = $('globalLoaderCancel');
  if (progress) progress.classList.add('hidden');
  if (detail) detail.classList.add('hidden');
  if (cancel) {
    cancel.classList.add('hidden');
    cancel.disabled = false;
    cancel.onclick = null;
  }
  if (loader) {
    if (loader.classList.contains('hidden')) lastFocusBeforeLoader = document.activeElement;
    loader.classList.remove('hidden');
    loader.focus({ preventScroll: true });
  }
  document.body.classList.add('loading-active');
}
function updateLoadingProgress(job, onCancel = null) {
  const percent = Math.max(0, Math.min(100, Number(job.progress_percent) || 0));
  const loaderText = $('globalLoaderText');
  const progress = $('globalLoaderProgress');
  const detail = $('globalLoaderProgressDetail');
  const cancel = $('globalLoaderCancel');
  if (loaderText) loaderText.textContent = job.phase || 'Revisando lote...';
  if (progress) {
    progress.classList.remove('hidden');
    progress.querySelector('span').style.width = `${percent}%`;
  }
  if (detail) detail.classList.remove('hidden');
  if ($('globalLoaderPercent')) $('globalLoaderPercent').textContent = `${Math.round(percent)}%`;
  if ($('globalLoaderStage')) $('globalLoaderStage').textContent = `Lote ${job.batch_id}`;
  if (cancel) {
    cancel.classList.toggle('hidden', !job.can_cancel);
    cancel.disabled = Boolean(job.cancel_requested);
    cancel.textContent = job.cancel_requested ? 'Deteniendo...' : 'Detener proceso';
    cancel.onclick = job.can_cancel && onCancel ? onCancel : null;
  }
}
function hideLoading() {
  const loader = $('globalLoader');
  if (loader) loader.classList.add('hidden');
  document.body.classList.remove('loading-active');
  if (lastFocusBeforeLoader && typeof lastFocusBeforeLoader.focus === 'function') {
    lastFocusBeforeLoader.focus({ preventScroll: true });
  }
  lastFocusBeforeLoader = null;
}

async function fetchJson(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.detail || `Error HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La consulta excedió 3 minutos. Se cerró la pantalla de carga; revisa el log del servidor o intenta nuevamente.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  return value ? new Date(String(value).replace(' ', 'T')) : null;
}

function autoRefreshCountdown(nextRun) {
  const target = parseLocalDate(nextRun);
  if (!target || Number.isNaN(target.getTime())) return 'Calculando próxima ejecución...';
  const seconds = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 1000));
  if (seconds === 0) return 'La actualización iniciará en unos segundos';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `Próxima ejecución en ${minutes}:${String(rest).padStart(2, '0')} min`;
}

function renderAutoRefreshStatus() {
  const state = autoRefreshState;
  if (!state || !$('autoRefreshStatus')) return;
  const box = $('autoRefreshStatus');
  const title = $('autoRefreshTitle');
  const detail = $('autoRefreshDetail');
  const liveIndicator = $('sqlLiveIndicator');
  const refresh = $('refreshButton');
  const reportBox = $('reportRefreshStatus');
  const reportTitle = $('reportRefreshTitle');
  const reportDetail = $('reportRefreshDetail');
  const reportToggle = $('reportAutoToggle');
  box.className = 'auto-refresh-status';
  refresh.disabled = Boolean(state.running);
  reportToggle.disabled = Boolean(state.running);
  reportBox.className = 'auto-refresh-status';

  if (state.legacy_report_auto_enabled) {
    reportTitle.textContent = 'Reporte Vicidial automático activo';
    reportDetail.textContent = 'Se descargará junto con la consulta SQL programada';
    reportToggle.textContent = 'Pausar';
  } else {
    reportBox.classList.add('paused');
    reportTitle.textContent = 'Reporte Vicidial pausado';
    reportDetail.textContent = 'Disponible con el botón de descarga manual';
    reportToggle.textContent = 'Activar';
  }

  if (state.running) {
    box.classList.add('running');
    liveIndicator.textContent = 'Sincronizando';
    const isReport = state.source === 'REPORTE_MANUAL' || state.source === 'REVISION_LOTE';
    title.textContent = state.source === 'SQL_MANUAL' ? 'Consultando AzulCC SQL' : state.source === 'AUTOMATICO' ? 'Actualizando fuentes automáticamente' : 'Proceso de fuentes en curso';
    detail.textContent = isReport ? 'Consultando llamadas antes de revisar el lote...' : 'Consolidando teléfonos y gestiones recientes...';
    if (isReport) { reportBox.classList.remove('paused'); reportBox.classList.add('running'); }
    reportToggle.disabled = true;
    return;
  }
  if (!state.enabled) {
    box.classList.add('paused');
    liveIndicator.textContent = 'Inactivo';
    title.textContent = 'Sincronización SQL desactivada';
    detail.textContent = state.last_finished ? `Última ejecución: ${state.last_finished}` : 'Actívala desde la configuración del servidor';
    return;
  }
  if (!state.in_schedule) {
    box.classList.add('paused');
    liveIndicator.textContent = 'En espera';
    title.textContent = `AzulCC SQL fuera de horario (${state.schedule_start}–${state.schedule_end})`;
    detail.textContent = `Próxima consulta: ${state.next_run || 'pendiente'}`;
    return;
  }
  if (state.last_status === 'ERROR') {
    box.classList.add('error');
    liveIndicator.textContent = 'Con alerta';
    title.textContent = 'Última consulta SQL con error';
    detail.textContent = `${autoRefreshCountdown(state.next_run)} · ${state.last_error || 'Revisa el servicio'}`;
  } else {
    liveIndicator.textContent = 'En vivo';
    title.textContent = `AzulCC SQL en vivo · ${state.schedule_start}–${state.schedule_end}`;
    detail.textContent = autoRefreshCountdown(state.next_run);
  }
}

async function loadAutoRefreshStatus() {
  try {
    const state = await fetchJson('/api/auto-refresh', {}, 15000);
    const finished = state.last_finished || null;
    const changed = autoRefreshInitialized && finished && finished !== lastObservedRefresh;
    autoRefreshState = state;
    lastObservedRefresh = finished;
    autoRefreshInitialized = true;
    renderAutoRefreshStatus();
    if (changed && state.last_status === 'COMPLETADO') {
      const reloads = [loadDashboard(false)];
      if (!isLeadGroupCollapsed('decisionDashboard')) {
        reloads.push(loadDecisionDashboard(true));
      }
      if (!isLeadGroupCollapsed('universePriorityDashboard')) {
        reloads.push(loadUniversePriority(true));
      }
      await Promise.all(reloads);
    }
  } catch (_) {
    if ($('autoRefreshStatus')) {
      $('autoRefreshStatus').className = 'auto-refresh-status error';
      $('autoRefreshTitle').textContent = 'Sin conexión con el programador';
      $('autoRefreshDetail').textContent = 'Se volverá a consultar automáticamente';
    }
  }
}

async function toggleReportAuto() {
  if (!autoRefreshState) return;
  const button = $('reportAutoToggle');
  button.disabled = true;
  try {
    autoRefreshState = await fetchJson('/api/report-auto/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoRefreshState.legacy_report_auto_enabled })
    }, 15000);
    renderAutoRefreshStatus();
  } catch (e) {
    showMessage(e.message, true);
    button.disabled = false;
  }
}

function renderBars(id, items, label) {
  const box = $(id); box.innerHTML = '';
  const max = Math.max(1, ...items.map((x) => x.total));
  if (!items.length) { box.innerHTML = '<p>Sin registros.</p>'; return; }
  items.forEach((x) => {
    const row = document.createElement('div'); row.className = 'bar-row result-row';
    row.innerHTML = `<span title="${esc(x[label])}">${esc(x[label])}</span><div class="stack-track"><div class="stack-approved" style="width:${x.aprobadas / max * 100}%"></div><div class="stack-rejected" style="width:${x.rechazadas / max * 100}%"></div></div><span class="bar-value"><b>${x.total}</b><small>${x.aprobadas} A / ${x.rechazadas} R</small></span>`;
    box.appendChild(row);
  });
}
function renderHours(items) {
  const box = $('hourChart'); box.innerHTML = '';
  const max = Math.max(1, ...items.map((x) => x.total));
  items.forEach((x) => {
    const col = document.createElement('div'); col.className = 'hour-col';
    col.innerHTML = `<span class="hour-value">${x.total || ''}</span><div class="hour-bar-wrap"><div class="hour-stack"><div class="hour-approved" style="height:${x.aprobadas / max * 100}%"></div><div class="hour-rejected" style="height:${x.rechazadas / max * 100}%"></div></div></div><span class="hour-label">${x.etiqueta}</span>`;
    box.appendChild(col);
  });
}
function badge(v) {
  const c = v === 'APROBADA' ? 'badge approved-badge' : v === 'RECHAZADA' ? 'badge rejected-badge' : 'badge';
  return `<span class="${c}">${esc(v)}</span>`;
}
function renderTable(items) {
  const body = $('salesTable'); body.innerHTML = '';
  if (!items.length) { body.innerHTML = '<tr><td colspan="14">No hay aprobadas ni rechazadas para la fecha seleccionada.</td></tr>'; return; }
  items.forEach((x) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(x.id_venta)}</td><td>${esc(x.fecha_hora)}</td><td>${badge(x.resultado)}</td><td>${esc(x.cliente)}</td><td>${esc(x.telefono)}</td><td>${esc(x.agente)}</td><td>${esc(x.lote_nombre || x.lote)}</td><td>${esc(x.lead_id)}</td><td>${esc(x.fecha_llamada)}</td><td>${esc(x.agente_llamada)}</td><td>${esc(x.status_llamada)} ${esc(x.status_nombre)}</td><td>${esc(x.campana_llamada)}</td><td>${esc(x.diferencia_minutos)}</td><td>${esc(x.coincidencia)}</td>`;
    body.appendChild(tr);
  });
}
async function loadDashboard(useLoader = true) {
  hideMessage();
  if (useLoader) showLoading('Cargando dashboard...');
  try {
    const data = await fetchJson(`/api/dashboard?date=${encodeURIComponent($('dateFilter').value)}`);
    $('totalResults').textContent = data.summary.total;
    $('totalApproved').textContent = data.summary.aprobadas;
    $('totalRejected').textContent = data.summary.rechazadas;
    $('totalAgents').textContent = data.summary.agentes;
    $('totalLots').textContent = data.summary.lotes;
    $('lastResult').textContent = data.summary.ultima || '--:--';
    renderBars('agentChart', data.by_agent, 'agente');
    renderBars('lotChart', data.by_lot, 'lote');
    renderHours(data.by_hour); renderTable(data.details);
    $('matchInfo').textContent = `Con llamada: ${data.summary.con_llamada} | Sin coincidencia: ${data.summary.sin_llamada}`;
    $('syncInfo').textContent = `Última llamada: ${data.last_report || 'sin datos'} | Última importación: ${data.last_import || 'sin datos'}`;
  } catch (e) { showMessage(e.message, true); }
  finally { if (useLoader) hideLoading(); }
}
async function refreshData() {
  const btn = $('refreshButton'); btn.disabled = true; btn.textContent = 'Descargando...';
  showLoading('Descargando e importando Call Report...');
  try {
    const r = await fetch('/api/refresh', { method: 'POST' }); const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Error al actualizar');
    const x = data.result; const importedDate = String(x.end || '').slice(0, 10); if (importedDate) $('dateFilter').value = importedDate; await loadDashboard(false);
    showMessage(`Actualización terminada. Leídos: ${x.read}, nuevos: ${x.inserted}, duplicados omitidos: ${x.duplicates}.`);
  } catch (e) { showMessage(e.message, true); }
  finally { hideLoading(); btn.disabled = false; btn.textContent = 'Descargar reporte Vicidial'; await loadAutoRefreshStatus(); }
}

function renderLeadPreview(items) {
  const body = $('previewTable'); const info = $('previewCountInfo');
  if (!body || !info) return;
  body.innerHTML = '';
  if (!items?.length) { body.innerHTML = '<tr><td colspan="13">No hay registros con los filtros seleccionados.</td></tr>'; info.textContent = '0 registros mostrados.'; return; }
  info.textContent = `Mostrando ${items.length} candidatos.`;
  items.forEach((x) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(x.lead_id)}</td><td>${esc(x.phone)}</td><td>${esc(x.name)}</td><td>${esc(x.state)}</td><td>${esc(x.city)}</td><td>${esc(x.campaign)}</td><td>${esc(x.list_name)}</td><td>${esc(x.effective_status || x.status)}</td><td>${esc(x.effective_status_date)}</td><td>${esc(x.called_count)}</td><td>${esc(x.quality)}</td><td>${esc(x.management_month)}</td><td>${esc(x.entry_date)}</td>`;
    body.appendChild(tr);
  });
}

function invalidateLeadPreview() {
  ['previewAvailable', 'previewNeverCalled', 'previewQuality', 'previewGeo'].forEach((id) => {
    if ($(id)) $(id).textContent = '—';
  });
  if ($('previewCountInfo')) $('previewCountInfo').textContent = 'Filtros modificados; actualiza la vista previa.';
  if ($('previewTable')) $('previewTable').innerHTML = '<tr><td colspan="13">Presiona Vista previa para aplicar los filtros actuales.</td></tr>';
}

function formatDecisionNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function setExecutiveLoading(id, visible) {
  const element = $(id);
  if (!element) return;
  element.hidden = !visible;
  element.classList.toggle('hidden', !visible);
}

const LEAD_VIEW_STORAGE_KEY = 'gestion-vicidial.lead-groups.v1';
const LEAD_SCOPE_STORAGE_KEY = 'gestion-vicidial.lead-global-scope.v1';
const LEAD_GLOBAL_FILTER_IDS = [
  'leadCampaignFilter',
  'leadManagementMonthFilter',
  'leadLastManagementMonthFilter'
];

function getLeadViewGroups() {
  return [...document.querySelectorAll('[data-lead-view-group]')];
}

function readLeadViewPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEAD_VIEW_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveLeadViewPreferences() {
  const preferences = {};
  getLeadViewGroups().forEach((group) => {
    preferences[group.id] = group.classList.contains('is-collapsed');
  });
  try {
    localStorage.setItem(LEAD_VIEW_STORAGE_KEY, JSON.stringify(preferences));
  } catch (_) {
    // La personalización es opcional si el navegador bloquea almacenamiento.
  }
}

function isLeadGroupCollapsed(id) {
  return Boolean($(id)?.classList.contains('is-collapsed'));
}

function loadLeadGroupOnDemand(id) {
  if (!$('leadsTab')?.classList.contains('active')) return;
  if (
    id === 'decisionDashboard'
    && (!decisionDashboardLoaded || decisionDashboardData?.preparing)
  ) {
    loadDecisionDashboard();
  }
  if (
    id === 'universePriorityDashboard'
    && (!universePriorityLoaded || universePriorityData?.preparing)
  ) {
    loadUniversePriority();
  }
  if (id === 'leadBatchHistoryGroup') {
    loadBatches(false);
  }
}

function setLeadGroupCollapsed(id, collapsed, options = {}) {
  const group = $(id);
  if (!group) return;
  const { persist = true, notify = true } = options;
  group.classList.toggle('is-collapsed', Boolean(collapsed));
  const button = group.querySelector('.lead-group-toggle');
  if (button) {
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute(
      'aria-label',
      `${collapsed ? 'Mostrar' : 'Minimizar'} ${group.dataset.groupTitle || 'agrupador'}`
    );
    button.querySelector('.lead-group-toggle-text').textContent =
      collapsed ? 'Mostrar' : 'Minimizar';
    button.querySelector('.lead-group-chevron').textContent =
      collapsed ? '⌄' : '⌃';
  }
  if (persist) saveLeadViewPreferences();
  if (!collapsed && notify) loadLeadGroupOnDemand(id);
}

function applyLeadGroupPreset(mode) {
  getLeadViewGroups().forEach((group) => {
    const collapsed =
      mode === 'collapse-all'
      || (mode === 'export-only' && group.id !== 'lead-config-panel');
    setLeadGroupCollapsed(group.id, collapsed, {
      persist: false,
      notify: false
    });
  });
  saveLeadViewPreferences();
  if (mode === 'expand-all') {
    getLeadViewGroups().forEach((group) => loadLeadGroupOnDemand(group.id));
  }
  if (mode === 'export-only') {
    loadLeadGroupOnDemand('lead-config-panel');
    $('lead-config-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function initLeadViewPreferences() {
  const preferences = readLeadViewPreferences();
  getLeadViewGroups().forEach((group) => {
    const title = group.dataset.groupTitle || 'Agrupador';
    if (!group.querySelector(':scope > .lead-group-collapse-bar')) {
      const bar = document.createElement('div');
      bar.className = 'lead-group-collapse-bar';
      bar.innerHTML = `
        <span class="lead-group-collapse-title">
          <small>AGRUPADOR</small>
          <strong>${esc(title)}</strong>
        </span>
        <button class="lead-group-toggle" type="button" aria-controls="${esc(group.id)}">
          <span class="lead-group-toggle-text">Minimizar</span>
          <span class="lead-group-chevron" aria-hidden="true">⌃</span>
        </button>`;
      group.prepend(bar);
      bar.querySelector('.lead-group-toggle').addEventListener('click', () => {
        setLeadGroupCollapsed(
          group.id,
          !group.classList.contains('is-collapsed')
        );
      });
    }
    setLeadGroupCollapsed(group.id, preferences[group.id] === true, {
      persist: false,
      notify: false
    });
  });
}

function sanitizeLeadGlobalScope(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const campaigns = Array.isArray(value.campaigns)
    ? value.campaigns
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50)
    : [];
  const months = Array.isArray(value.months)
    ? value.months
      .map((item) => String(item || '').trim())
      .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item))
      .slice(0, 36)
    : [];
  const lastManagementMonths = Array.isArray(value.lastManagementMonths)
    ? value.lastManagementMonths
      .map((item) => String(item || '').trim())
      .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item))
      .slice(0, 36)
    : [];
  return {
    campaigns: [...new Set(campaigns)],
    months: [...new Set(months)],
    lastManagementMonths: [...new Set(lastManagementMonths)]
  };
}

function readLeadGlobalScopePreferences() {
  try {
    return sanitizeLeadGlobalScope(
      JSON.parse(localStorage.getItem(LEAD_SCOPE_STORAGE_KEY) || '{}')
    );
  } catch (_) {
    return sanitizeLeadGlobalScope({});
  }
}

function updateLeadGlobalScopeStatus() {
  const status = $('leadGlobalScopeStatus');
  if (!status) return;
  const campaigns = getMultiValues('leadCampaignFilter');
  const months = getMultiValues('leadManagementMonthFilter');
  const lastManagementMonths = getMultiValues('leadLastManagementMonthFilter');
  const parts = [];
  if (campaigns.length) {
    parts.push(
      campaigns.length === 1
        ? `Campaña ${campaigns[0]}`
        : `${campaigns.length} campañas`
    );
  }
  if (months.length) {
    parts.push(
      months.length === 1
        ? `EntryDate ${months[0]}`
        : `${months.length} periodos de EntryDate`
    );
  }
  if (lastManagementMonths.length) {
    parts.push(
      lastManagementMonths.length === 1
        ? `Última gestión ${lastManagementMonths[0]}`
        : `${lastManagementMonths.length} meses de última gestión`
    );
  }
  status.classList.toggle('active', Boolean(parts.length));
  status.textContent = parts.length
    ? `${parts.join(' · ')}. Alcance guardado automáticamente en este navegador.`
    : 'Sin alcance global: las consultas pueden revisar todo el universo.';
}

function saveLeadGlobalScopePreferences() {
  const preferences = sanitizeLeadGlobalScope({
    campaigns: getMultiValues('leadCampaignFilter'),
    months: getMultiValues('leadManagementMonthFilter'),
    lastManagementMonths: getMultiValues('leadLastManagementMonthFilter')
  });
  try {
    localStorage.setItem(LEAD_SCOPE_STORAGE_KEY, JSON.stringify(preferences));
  } catch (_) {
    // La aplicación continúa operando si el navegador bloquea almacenamiento.
  }
  updateLeadGlobalScopeStatus();
}

function restoreLeadGlobalScopePreferences() {
  const preferences = readLeadGlobalScopePreferences();
  const valuesById = {
    leadCampaignFilter: preferences.campaigns,
    leadManagementMonthFilter: preferences.months,
    leadLastManagementMonthFilter: preferences.lastManagementMonths
  };
  LEAD_GLOBAL_FILTER_IDS.forEach((id) => {
    const state = multiSelectState[id];
    if (!state) return;
    const values = valuesById[id] || [];
    state.selected = [...values];
    state.options = [...values];
    state.available = [...values];
    updateMultiSummary(id);
    renderMultiOptions(id, values);
  });
  updateLeadGlobalScopeStatus();
}

function clearLeadGlobalScope() {
  LEAD_GLOBAL_FILTER_IDS.forEach((id) => {
    const state = multiSelectState[id];
    if (!state) return;
    state.selected = [];
    updateMultiSummary(id);
    renderMultiOptions(id, state.available || []);
  });
  saveLeadGlobalScopePreferences();
  handleLeadFilterChange('leadGlobalScopeClear');
}

function renderDecisionDashboard(data) {
  decisionDashboardData = data;
  const recommendation = data.recommendation;
  setExecutiveLoading('decisionLoading', false);
  $('decisionContent').classList.remove('hidden');
  if (decisionRetryTimer) {
    clearTimeout(decisionRetryTimer);
    decisionRetryTimer = null;
  }
  if (data.preparing) {
    $('decisionFreshness').textContent = 'Creando primera fotografía ejecutiva';
    $('decisionPortfolioSummary').textContent = 'Cálculo seguro en segundo plano';
    $('decisionRecommendationName').textContent = 'Análisis en preparación';
    $('decisionHeadline').textContent =
      'Puedes seguir usando la aplicación. Esta sección se actualizará automáticamente.';
    $('decisionReasons').innerHTML =
      '<li>La consulta pesada ya no bloquea la pantalla ni muestra errores de timeout.</li>';
    $('decisionUseButton').disabled = true;
    $('decisionRankingTable').innerHTML =
      '<tr><td colspan="10">Preparando la fotografía inicial; reintentaremos en unos segundos.</td></tr>';
    const retryMs = Math.max(3, Number(data.retry_after_seconds || 5)) * 1000;
    if (!isLeadGroupCollapsed('decisionDashboard')) {
      decisionRetryTimer = setTimeout(
        () => loadDecisionDashboard(true),
        retryMs
      );
    }
    return;
  }
  const snapshotDate = data.snapshot?.refreshed_at || data.updated_at || '—';
  const staleText = data.snapshot?.stale ? ' · actualización en segundo plano' : '';
  $('decisionFreshness').textContent = `Corte KPI: ${snapshotDate}${staleText}`;
  $('decisionPortfolioSummary').textContent =
    `${formatDecisionNumber(data.summary?.eligible_unique)} teléfonos elegibles · ${formatDecisionNumber(data.summary?.high_priority)} lotes en prioridad alta`;

  const body = $('decisionRankingTable');
  body.innerHTML = '';
  if (!recommendation || !(data.rankings || []).length) {
    $('decisionRecommendationName').textContent = 'Sin lotes elegibles';
    $('decisionHeadline').textContent = 'No hay capacidad disponible con la política seleccionada.';
    $('decisionUseButton').disabled = true;
    body.innerHTML = '<tr><td colspan="10">No hay lotes para mostrar.</td></tr>';
    return;
  }

  $('decisionUseButton').disabled = false;
  $('decisionUseButton').dataset.batchId = recommendation.batch_id;
  $('decisionLevel').textContent = recommendation.level.replace('_', ' ');
  $('decisionLevel').dataset.level = recommendation.level;
  $('decisionRecommendationName').textContent = `${recommendation.name} · Lote ${recommendation.batch_id}`;
  $('decisionHeadline').textContent = recommendation.action;
  $('decisionScore').textContent = formatDecisionNumber(recommendation.score, 1);
  $('decisionReasons').innerHTML = (recommendation.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join('');
  $('decisionEligible').textContent = formatDecisionNumber(recommendation.eligible);
  $('decisionCoverage').textContent = `${formatDecisionNumber(recommendation.coverage_pct, 1)}% del objetivo`;
  $('decisionConversion').textContent = `${formatDecisionNumber(recommendation.conversion_pct, 2)}%`;
  $('decisionContact').textContent = `${formatDecisionNumber(recommendation.contact_pct, 2)}% contactabilidad`;
  $('decisionRisk').textContent = `${formatDecisionNumber(recommendation.three_plus_pct, 1)}%`;
  $('decisionOverlap').textContent = `${formatDecisionNumber(recommendation.overlap_pct, 1)}% compartidos`;
  $('decisionExclusive').textContent = formatDecisionNumber(recommendation.exclusive);
  $('decisionShared').textContent = formatDecisionNumber(recommendation.shared);
  $('decisionMedianDays').textContent = formatDecisionNumber(recommendation.median_days_since_call, 1);
  $('decisionAttempts').textContent = formatDecisionNumber(recommendation.average_attempts, 1);
  $('decisionOpportunities').textContent = formatDecisionNumber(recommendation.opportunities);
  $('decisionConfidence').textContent = recommendation.confidence;

  (data.rankings || []).forEach((item, index) => {
    const tr = document.createElement('tr');
    const priorityClass = String(item.level || '').toLowerCase();
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${esc(item.name)}</strong><br><small>Lote ${esc(item.batch_id)} · ${esc(item.status)}</small></td>
      <td><span class="decision-priority ${priorityClass}">${esc(item.level.replace('_', ' '))} · ${formatDecisionNumber(item.score, 1)}</span></td>
      <td>${formatDecisionNumber(item.eligible)}</td>
      <td>${formatDecisionNumber(item.coverage_pct, 1)}%</td>
      <td>${formatDecisionNumber(item.conversion_pct, 2)}%</td>
      <td>${formatDecisionNumber(item.contact_pct, 2)}%</td>
      <td>${formatDecisionNumber(item.overlap_pct, 1)}%</td>
      <td>${esc(item.last_call_at || 'Sin gestión')}</td>
      <td><button class="decision-row-action" type="button" data-decision-batch="${item.batch_id}">Usar lote</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-decision-batch]').forEach((button) => {
    button.addEventListener('click', () => useDecisionBatch(Number(button.dataset.decisionBatch)));
  });
}

async function loadDecisionDashboard(silent = false) {
  if (decisionDashboardLoading) return;
  decisionDashboardLoading = true;
  const button = $('decisionAnalyzeButton');
  const firstLoad = !decisionDashboardLoaded;
  const originalButtonText = button.textContent;
  if (!silent) {
    button.disabled = true;
    button.textContent = firstLoad ? 'Preparando…' : 'Actualizando…';
  }
  if (firstLoad) {
    setExecutiveLoading('decisionLoading', true);
    $('decisionContent').classList.add('hidden');
  } else if (!silent) {
    $('decisionDashboard').classList.add('is-refreshing');
  }
  try {
    const data = await fetchJson('/api/lead-batches/decision-dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: $('decisionPolicy').value,
        target_quantity: Number($('decisionTargetQuantity').value || 5000),
        cooldown_days: 15,
        limit: 65
      })
    }, 180000);
    renderDecisionDashboard(data);
    decisionDashboardLoaded = true;
  } catch (error) {
    if (firstLoad) {
      setExecutiveLoading('decisionLoading', false);
      $('decisionContent').classList.remove('hidden');
      $('decisionRankingTable').innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`;
    }
    if (!silent) showMessage(error.message, true);
  } finally {
    if (!silent) {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
    decisionDashboardLoading = false;
    $('decisionDashboard').classList.remove('is-refreshing');
  }
}

function renderUniversePriority(data) {
  universePriorityData = data;
  const recommendation = data.recommendation;
  setExecutiveLoading('universePriorityLoading', false);
  $('universePriorityContent').classList.remove('hidden');
  if (universePriorityRetryTimer) {
    clearTimeout(universePriorityRetryTimer);
    universePriorityRetryTimer = null;
  }
  if (data.preparing) {
    $('universePriorityMonth').textContent = 'Análisis en preparación';
    $('universePriorityAction').textContent =
      'El resumen se está construyendo en segundo plano.';
    $('universePriorityWindow').textContent =
      'La pantalla se actualizará automáticamente';
    $('universePriorityReasons').innerHTML =
      '<li>La aplicación permanece disponible mientras SQL prepara la primera fotografía.</li>';
    $('universePriorityUse').disabled = true;
    $('universeMonthTable').innerHTML =
      '<tr><td colspan="11">Preparando ranking mensual; reintentaremos en unos segundos.</td></tr>';
    $('universeListTable').innerHTML =
      '<tr><td colspan="10">Preparando nombres y desempeño por lista.</td></tr>';
    $('universeListSummary').textContent =
      'El catálogo Vicidial se resolverá al completar la fotografía.';
    const retryMs = Math.max(3, Number(data.retry_after_seconds || 5)) * 1000;
    if (!isLeadGroupCollapsed('universePriorityDashboard')) {
      universePriorityRetryTimer = setTimeout(
        () => loadUniversePriority(true),
        retryMs
      );
    }
    return;
  }
  if (!recommendation) {
    $('universePriorityMonth').textContent = 'Sin información suficiente';
    $('universeMonthTable').innerHTML = '<tr><td colspan="11">No hay meses disponibles para analizar.</td></tr>';
    $('universeListTable').innerHTML = '<tr><td colspan="10">No hay listas disponibles para analizar.</td></tr>';
    $('universePriorityUse').disabled = true;
    return;
  }

  $('universePriorityUse').disabled = false;
  $('universePriorityUse').dataset.entryMonth = recommendation.entry_month;
  $('universePriorityLevel').textContent = recommendation.level.replaceAll('_', ' ');
  $('universePriorityLevel').dataset.level = recommendation.level;
  $('universePriorityMonth').textContent = recommendation.entry_month;
  $('universePriorityAction').textContent = recommendation.action;
  $('universePriorityScore').textContent = formatDecisionNumber(recommendation.score, 1);
  $('universePriorityReasons').innerHTML = (recommendation.reasons || [])
    .map((reason) => `<li>${esc(reason)}</li>`).join('');
  $('universePriorityEligible').textContent = formatDecisionNumber(recommendation.eligible);
  $('universePriorityNever').textContent = formatDecisionNumber(recommendation.never_dialed);
  $('universePriorityContact').textContent = `${formatDecisionNumber(recommendation.contact_pct, 2)}%`;
  $('universePrioritySales').textContent = formatDecisionNumber(recommendation.approved_per_1000, 3);
  $('universePriorityCoverage').textContent = `${formatDecisionNumber(recommendation.sample_coverage_pct, 2)}%`;
  $('universePriorityConfidence').textContent = recommendation.confidence;
  const from = data.window?.from ? data.window.from.slice(0, 10) : '—';
  const to = data.window?.to ? data.window.to.slice(0, 10) : '—';
  const refreshedAt = data.snapshot?.refreshed_at || data.updated_at || '—';
  $('universePriorityWindow').textContent =
    `Ventana comparable: ${from} a ${to} · Resumen ${refreshedAt}`;

  const largeSamples = (data.months || []).filter((item) => Number(item.dialed) >= 20000);
  const reliableSales = (data.months || []).filter((item) =>
    Number(item.dialed) >= 1000 && Number(item.sample_coverage_pct) >= 2
  );
  const bestContact = [...largeSamples].sort((a, b) => Number(b.contact_pct) - Number(a.contact_pct))[0];
  const bestSales = [...reliableSales].sort((a, b) => Number(b.approved_per_1000) - Number(a.approved_per_1000))[0];
  $('universePrioritySummary').textContent = bestContact && bestSales
    ? `Mejor contacto entre muestras de más de 20 mil teléfonos: ${bestContact.entry_month} (${formatDecisionNumber(bestContact.contact_pct, 2)}%). Mejor venta con cobertura confiable: ${bestSales.entry_month} (${formatDecisionNumber(bestSales.approved_per_1000, 3)} por mil).`
    : 'Aún no existe una muestra suficiente para comparar los meses.';

  const body = $('universeMonthTable');
  body.innerHTML = '';
  (data.months || []).forEach((item, index) => {
    const tr = document.createElement('tr');
    const priorityClass = String(item.level || '').toLowerCase();
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${esc(item.entry_month)}</strong><br><small>Score ${formatDecisionNumber(item.score, 1)}</small></td>
      <td><span class="decision-priority ${priorityClass}">${esc(item.level.replaceAll('_', ' '))}</span></td>
      <td>${formatDecisionNumber(item.eligible)}</td>
      <td>${formatDecisionNumber(item.never_dialed)}</td>
      <td>${formatDecisionNumber(item.dialed)}</td>
      <td>${formatDecisionNumber(item.sample_coverage_pct, 2)}%</td>
      <td>${formatDecisionNumber(item.contact_pct, 2)}%</td>
      <td>${formatDecisionNumber(item.approved_per_1000, 3)}</td>
      <td>${esc(item.confidence)}</td>
      <td><button class="decision-row-action universe-month-action" type="button" data-entry-month="${esc(item.entry_month)}">Usar mes</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-entry-month]').forEach((button) => {
    button.addEventListener('click', () => useUniverseMonth(button.dataset.entryMonth));
  });

  const listBody = $('universeListTable');
  const listRecommendation = data.list_recommendation;
  $('universeListSummary').textContent = listRecommendation
    ? `Mejor señal: ${listRecommendation.list_name} (${listRecommendation.list_id}), cohorte ${listRecommendation.entry_month}, con ${formatDecisionNumber(listRecommendation.contact_pct, 2)}% de contacto.`
    : 'No hay una muestra por lista suficiente dentro de la ventana actual.';
  listBody.innerHTML = '';
  if (!(data.lists || []).length) {
    listBody.innerHTML = '<tr><td colspan="10">No hay listas disponibles para analizar.</td></tr>';
  }
  (data.lists || []).forEach((item, index) => {
    const tr = document.createElement('tr');
    const priorityClass = String(item.level || 'REVISAR').toLowerCase();
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong class="universe-list-name">${esc(item.list_name || `Lista ${item.list_id}`)}</strong><br><small>ID ${esc(item.list_id || '—')} · Campaña ${esc(item.campaign || '—')}</small></td>
      <td>${esc(item.entry_month || '—')}</td>
      <td><span class="decision-priority ${priorityClass}">${esc(String(item.level || 'REVISAR').replaceAll('_', ' '))}</span><br><small>Score ${formatDecisionNumber(item.score, 1)} · ${esc(item.confidence || 'BAJA')}</small></td>
      <td>${formatDecisionNumber(item.dialed)}</td>
      <td>${formatDecisionNumber(item.contact_pct, 2)}%</td>
      <td>${formatDecisionNumber(item.approved_per_1000, 3)}</td>
      <td>${formatDecisionNumber(item.attempts_per_phone, 2)}</td>
      <td>${esc(item.last_call || '—')}</td>
      <td><button class="decision-row-action universe-list-action" type="button" data-list-index="${index}">Usar lista</button></td>`;
    listBody.appendChild(tr);
  });
  listBody.querySelectorAll('[data-list-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = (universePriorityData?.lists || [])[Number(button.dataset.listIndex)];
      if (item) useUniverseList(item);
    });
  });
}

async function loadUniversePriority(silent = false) {
  if (universePriorityLoading) return;
  universePriorityLoading = true;
  const button = $('universePriorityRefresh');
  const firstLoad = !universePriorityLoaded;
  const originalText = button.textContent;
  if (!silent) {
    button.disabled = true;
    button.textContent = firstLoad ? 'Preparando…' : 'Actualizando…';
  }
  if (firstLoad) {
    setExecutiveLoading('universePriorityLoading', true);
    $('universePriorityContent').classList.add('hidden');
  } else if (!silent) {
    $('universePriorityDashboard').classList.add('is-refreshing');
  }
  try {
    const data = await fetchJson('/api/kpis/universe-priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_quantity: Number($('decisionTargetQuantity').value || 5000)
      })
    }, 180000);
    renderUniversePriority(data);
    universePriorityLoaded = true;
  } catch (error) {
    if (firstLoad) {
      setExecutiveLoading('universePriorityLoading', false);
      $('universePriorityContent').classList.remove('hidden');
      $('universeMonthTable').innerHTML = `<tr><td colspan="11">${esc(error.message)}</td></tr>`;
      $('universeListTable').innerHTML = `<tr><td colspan="10">${esc(error.message)}</td></tr>`;
    }
    if (!silent) showMessage(error.message, true);
  } finally {
    universePriorityLoading = false;
    if (!silent) {
      button.disabled = false;
      button.textContent = originalText;
    }
    $('universePriorityDashboard').classList.remove('is-refreshing');
  }
}

async function useUniverseMonth(entryMonth) {
  if (!entryMonth || !multiSelectState.leadManagementMonthFilter) return;
  setLeadGroupCollapsed('lead-config-panel', false);
  clearDecisionSource();
  const state = multiSelectState.leadManagementMonthFilter;
  state.selected = [entryMonth];
  if (!state.options.includes(entryMonth)) state.options.unshift(entryMonth);
  if (!state.available.includes(entryMonth)) state.available.unshift(entryMonth);
  updateMultiSummary('leadManagementMonthFilter');
  renderMultiOptions('leadManagementMonthFilter', state.options);
  $('leadMode').value = 'RECICLAJE';
  $('leadIncludePendingRecycle').checked = false;
  $('leadIncludePendingRecycle').disabled = false;
  $('pendingRecycleOption').classList.remove('disabled');
  $('leadQuantity').value = Number($('decisionTargetQuantity').value || 5000);
  if (!$('leadBatchName').value.trim()) {
    $('leadBatchName').value = `RECICLAJE_ENTRY_${entryMonth.replace('-', '')}_${today().replaceAll('-', '')}`;
  }
  handleLeadFilterChange('leadManagementMonthFilter');
  $('lead-config-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await previewLeads();
}

async function useUniverseList(item) {
  if (!item?.entry_month || !item?.list_name) return;
  const monthState = multiSelectState.leadManagementMonthFilter;
  const listState = multiSelectState.leadListFilter;
  if (!monthState || !listState) return;
  setLeadGroupCollapsed('lead-config-panel', false);
  clearDecisionSource();
  monthState.selected = [item.entry_month];
  listState.selected = [item.list_name];
  [item.entry_month].forEach((value) => {
    if (!monthState.options.includes(value)) monthState.options.unshift(value);
    if (!monthState.available.includes(value)) monthState.available.unshift(value);
  });
  [item.list_name].forEach((value) => {
    if (!listState.options.includes(value)) listState.options.unshift(value);
    if (!listState.available.includes(value)) listState.available.unshift(value);
  });
  updateMultiSummary('leadManagementMonthFilter');
  updateMultiSummary('leadListFilter');
  renderMultiOptions('leadManagementMonthFilter', monthState.options);
  renderMultiOptions('leadListFilter', listState.options);
  $('leadMode').value = 'RECICLAJE';
  $('leadIncludePendingRecycle').checked = false;
  $('leadIncludePendingRecycle').disabled = false;
  $('pendingRecycleOption').classList.remove('disabled');
  $('leadQuantity').value = Number($('decisionTargetQuantity').value || 5000);
  if (!$('leadBatchName').value.trim()) {
    const safeListId = String(item.list_id || 'LISTA').replaceAll(/[^a-zA-Z0-9]/g, '');
    $('leadBatchName').value =
      `RECICLAJE_${safeListId}_${item.entry_month.replace('-', '')}_${today().replaceAll('-', '')}`;
  }
  handleLeadFilterChange('leadListFilter');
  $('lead-config-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await previewLeads();
}

function clearDecisionSource() {
  decisionSourceBatchIds = [];
  decisionSourceBatchPolicy = null;
  $('decisionSourceBanner').classList.add('hidden');
  invalidateLeadPreview();
}

async function useDecisionBatch(batchId) {
  const item = (decisionDashboardData?.rankings || []).find((row) => Number(row.batch_id) === Number(batchId));
  if (!item) return;
  setLeadGroupCollapsed('lead-config-panel', false);
  decisionSourceBatchIds = [Number(item.batch_id)];
  decisionSourceBatchPolicy = decisionDashboardData.policy;
  $('decisionSourceName').textContent =
    `${item.name} · Lote ${item.batch_id} · ${formatDecisionNumber(item.eligible)} elegibles`;
  $('decisionSourceBanner').classList.remove('hidden');
  $('leadMode').value = 'RECICLAJE';
  $('leadIncludePendingRecycle').checked = false;
  $('leadIncludePendingRecycle').disabled = false;
  $('pendingRecycleOption').classList.remove('disabled');
  $('leadQuantity').value = Math.min(
    Number($('decisionTargetQuantity').value || 5000),
    Number(item.eligible || 0)
  );
  if (!$('leadBatchName').value.trim()) {
    $('leadBatchName').value = `RECICLAJE_LOTE_${item.batch_id}_${today().replaceAll('-', '')}`;
  }
  $('lead-config-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await previewLeads();
}

const multiSelectState = {};
function getMultiValues(id) { return (multiSelectState[id]?.selected || []).slice(); }
function leadPayload() {
  return {
    quantity: Number($('leadQuantity').value || 5000), mode: $('leadMode').value,
    include_pending_recycle: $('leadMode').value === 'RECICLAJE' && Boolean($('leadIncludePendingRecycle')?.checked),
    batch_name: $('leadBatchName').value.trim() || null,
    destination_campaign: $('leadDestinationCampaign').value.trim() || null,
    destination_list: $('leadDestinationList').value.trim() || null,
    source_batch_ids: decisionSourceBatchIds,
    source_batch_policy: decisionSourceBatchPolicy,
    campaign_id: getMultiValues('leadCampaignFilter'), list_name: getMultiValues('leadListFilter'),
    management_month: getMultiValues('leadManagementMonthFilter'),
    last_management_month: getMultiValues('leadLastManagementMonthFilter'),
    status: getMultiValues('leadStatusFilter'), state: getMultiValues('leadStateFilter'), city: getMultiValues('leadCityFilter')
  };
}
async function previewLeads() {
  const btn = $('previewLeadsButton'); btn.disabled = true;
  showLoading('Consultando candidatos en SQL Server...');
  try {
    const r = await fetch('/api/lead-batches/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leadPayload()) });
    const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Error en vista previa');
    setLeadGroupCollapsed('leadPreviewGroup', false);
    $('previewAvailable').textContent = data.available; $('previewNeverCalled').textContent = data.never_called;
    $('previewQuality').textContent = data.average_quality; $('previewGeo').textContent = `${data.states} / ${data.cities}`;
    renderLeadPreview(data.items || []);
    if ($('leadMode').value === 'RECICLAJE') {
      const pendingText = data.include_pending_recycle
        ? `pendientes incluidos: ${Number(data.included_pending || 0).toLocaleString()} de ${Number(data.pending_detected || 0).toLocaleString()} detectados`
        : `pendientes bloqueados: ${Number(data.excluded_pending || 0).toLocaleString()}`;
      showMessage(`Reciclaje disponible: ${Number(data.available || 0).toLocaleString()} teléfonos. Universo filtrado: ${Number(data.filtered_total || 0).toLocaleString()}; ${pendingText}; ventas/DNC excluidos: ${Number(data.excluded_sales_dnc || 0).toLocaleString()}; teléfonos inválidos: ${Number(data.excluded_invalid_phone || 0).toLocaleString()}.`);
    } else {
      showMessage(`Vista previa lista: ${data.available} teléfonos disponibles. Los ya exportados en lotes pendientes o marcados fueron excluidos automáticamente.`);
    }
  } catch (e) { showMessage(e.message, true); }
  finally { hideLoading(); btn.disabled = false; }
}
async function generateLeads() {
  const btn = $('generateLeadsButton'); btn.disabled = true;
  const includesPending = $('leadMode').value === 'RECICLAJE' && Boolean($('leadIncludePendingRecycle')?.checked);
  if (includesPending && !confirm('Esta opción volverá a exportar teléfonos que ya pertenecen a lotes PENDIENTES. El mismo número podrá quedar en más de un lote activo. ¿Deseas continuar?')) {
    btn.disabled = false;
    return;
  }
  showLoading('Generando y preparando el archivo CSV...');
  try {
    const r = await fetch('/api/lead-batches/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leadPayload()) });
    const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Error al generar lote');
    await loadBatches(false);
    hideLoading();
    showMessage(`Lote ${data.name} generado con ${data.exported} registros. Estos teléfonos quedaron bloqueados para futuros lotes normales. La descarga iniciará ahora.`);
    window.location.href = data.download_url;
  } catch (e) { showMessage(e.message, true); hideLoading(); }
  finally { btn.disabled = false; }
}
function batchStatus(v) {
  const c = v === 'TRABAJADO' ? 'approved-badge' : v === 'ANULADO' ? 'rejected-badge' : v === 'PARCIAL' ? 'partial-badge' : '';
  return `<span class="badge ${c}">${esc(v)}</span>`;
}
async function loadBatches(showOverlay = false) {
  const body = $('batchesTable'); body.innerHTML = '<tr><td colspan="10">Consultando...</td></tr>';
  if (showOverlay) showLoading('Actualizando historial de lotes...');
  try {
    const r = await fetch('/api/lead-batches'); const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Error al consultar lotes');
    body.innerHTML = '';
    if (!data.items.length) { body.innerHTML = '<tr><td colspan="10">Aún no hay lotes generados.</td></tr>'; return; }
    data.items.forEach((x) => {
      const canReview = x.status === 'GENERADO'; const tr = document.createElement('tr');
      tr.innerHTML = `<td>${x.batch_id}</td><td>${esc(x.name)}</td><td>${esc(x.generated_at)}</td><td>${esc(x.mode)}</td><td>${x.exported}</td><td>${batchStatus(x.status)}</td><td>${x.marked}</td><td>${x.released}</td><td><a class="link-button" href="/api/lead-batches/${x.batch_id}/download">Descargar</a></td><td>${canReview ? `<button class="review-button" data-id="${x.batch_id}" data-name="${esc(x.name)}">Anular de forma segura</button>` : 'Revisado'}</td>`;
      body.appendChild(tr);
    });
    document.querySelectorAll('.review-button').forEach((btn) => btn.addEventListener('click', () => reconcileBatch(Number(btn.dataset.id), btn.dataset.name, btn)));
  } catch (e) { body.innerHTML = `<tr><td colspan="10">${esc(e.message)}</td></tr>`; showMessage(e.message, true); }
  finally { if (showOverlay) hideLoading(); }
}
async function reconcileBatch(id, name, btn) {
  if (!confirm(`Se consultará AzulCC SQL y la última descarga disponible del otro Vicidial. Los teléfonos marcados seguirán bloqueados y solo se liberarán los que no tengan llamadas. Se revisará el lote "${name}". ¿Continuar?`)) return;
  btn.disabled = true; showLoading('Preparando revisión segura del lote...');
  try {
    let job = await fetchJson(`/api/lead-batches/${id}/reconcile-release`, { method: 'POST' }, 30000);
    const cancelJob = async () => {
      const cancelButton = $('globalLoaderCancel');
      if (cancelButton) {
        cancelButton.disabled = true;
        cancelButton.textContent = 'Deteniendo...';
      }
      try {
        job = await fetchJson(`/api/lead-batch-jobs/${encodeURIComponent(job.job_id)}/cancel`, { method: 'POST' }, 30000);
        updateLoadingProgress(job, cancelJob);
      } catch (error) {
        showMessage(error.message, true);
      }
    };
    updateLoadingProgress(job, cancelJob);
    while (['EN_COLA', 'PROCESANDO'].includes(job.status)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      job = await fetchJson(`/api/lead-batch-jobs/${encodeURIComponent(job.job_id)}`, {}, 30000);
      updateLoadingProgress(job, cancelJob);
    }
    if (job.status === 'CANCELADO') {
      await loadBatches(false);
      showMessage('La revisión se detuvo antes de modificar el lote.');
      return;
    }
    if (job.status !== 'COMPLETADO') throw new Error(job.error || job.phase || 'Error al revisar lote');
    const data = job.result;
    await loadBatches(false);
    const retryNote = data.deadlock_retries ? ` SQL necesitó ${data.deadlock_retries} reintento(s) automático(s).` : '';
    showMessage(`Anulación segura terminada. Marcados: ${data.marked}; liberados: ${data.released}; encontrados en AzulCC: ${data.azul_matched}; encontrados en el reporte: ${data.report_matched}; estado: ${data.status}.${retryNote}`);
  } catch (e) { await loadBatches(false); showMessage(e.message, true); }
  finally { hideLoading(); btn.disabled = false; }
}


function clearListStatusSummary() {
  const panel = $('listStatusSummaryPanel');
  if (panel) panel.classList.add('hidden');
  const body = $('listStatusTable');
  if (body) body.innerHTML = '<tr><td colspan="8">Selecciona una lista.</td></tr>';
}

function renderListStatusSummary(data) {
  const panel = $('listStatusSummaryPanel');
  if (!panel) return;
  panel.classList.remove('hidden');

  const lists = data.selected_lists || [];
  $('listStatusSummaryTitle').textContent = lists.length === 1
    ? `Comportamiento histórico de: ${lists[0]}`
    : `Comportamiento histórico de ${lists.length} listas seleccionadas`;
  $('listStatusSummaryUpdated').textContent = `Actualizado ${new Date().toLocaleTimeString()}`;
  $('listStatusTotal').textContent = Number(data.total_records || 0).toLocaleString();
  $('listStatusPhones').textContent = Number(data.unique_phones || 0).toLocaleString();
  $('listStatusSales').textContent = Number(data.sales || 0).toLocaleString();
  $('listStatusVoicemails').textContent = Number(data.voicemails || 0).toLocaleString();
  $('listStatusContacted').textContent = Number(data.contacted || 0).toLocaleString();
  $('listStatusCount').textContent = Number(data.status_count || 0).toLocaleString();
  if ($('listStatusConversion')) $('listStatusConversion').textContent = `${Number(data.conversion_rate || 0).toFixed(2)}%`;

  const body = $('listStatusTable');
  const total = Math.max(1, Number(data.total_records || 0));
  body.innerHTML = '';
  if (!(data.items || []).length) {
    body.innerHTML = '<tr><td colspan="8">La lista seleccionada no tiene estatus para los filtros activos.</td></tr>';
    return;
  }
  data.items.forEach((x) => {
    const tr = document.createElement('tr');
    if (Number(x.sales || 0) > 0) tr.classList.add('status-sale');
    else if (Number(x.voicemails || 0) > 0) tr.classList.add('status-voicemail');
    const percentage = (Number(x.total || 0) * 100 / total).toFixed(2);
    tr.innerHTML = `<td>${esc(x.status)}</td><td>${esc(x.status_detail)}</td><td>${Number(x.total || 0).toLocaleString()}</td><td>${Number(x.unique_phones || 0).toLocaleString()}</td><td>${Number(x.sales || 0).toLocaleString()}</td><td>${Number(x.voicemails || 0).toLocaleString()}</td><td>${Number(x.contacted || 0).toLocaleString()}</td><td>${percentage}%</td>`;
    body.appendChild(tr);
  });
}

let listStatusRequestRevision = 0;

async function loadListStatusSummary() {
  const requestRevision = ++listStatusRequestRevision;
  const selectedLists = getMultiValues('leadListFilter');
  if (!selectedLists.length) {
    clearListStatusSummary();
    return;
  }

  const panel = $('listStatusSummaryPanel');
  if (panel) panel.classList.remove('hidden');
  const body = $('listStatusTable');
  if (body) body.innerHTML = '<tr><td colspan="8">Consultando resumen histórico...</td></tr>';
  if ($('listStatusSummaryTitle')) $('listStatusSummaryTitle').textContent = 'Consultando estatus de la lista seleccionada...';

  try {
    const data = await fetchJson('/api/lead-list-status-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadPayload())
    });
    if (requestRevision !== listStatusRequestRevision) return;
    renderListStatusSummary(data);
  } catch (error) {
    if (requestRevision !== listStatusRequestRevision) return;
    if (body) body.innerHTML = `<tr><td colspan="8" class="error-text">${esc(error.message)}</td></tr>`;
    if ($('listStatusSummaryTitle')) $('listStatusSummaryTitle').textContent = 'No fue posible obtener el resumen.';
  }
}

const scheduleListStatusSummary = debounce(loadListStatusSummary, 400);

function handleLeadFilterChange(changedId) {
  invalidateLeadPreview();
  listStatusRequestRevision += 1;
  saveLeadGlobalScopePreferences();
  refreshDependentFilters(changedId);
  scheduleListStatusSummary();
}

const leadFilterIds = [
  'leadCampaignFilter',
  'leadListFilter',
  'leadStatusFilter',
  'leadStateFilter',
  'leadCityFilter',
  'leadManagementMonthFilter',
  'leadLastManagementMonthFilter'
];

function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function selectedLeadFilters() {
  return {
    campaign_id: getMultiValues('leadCampaignFilter'),
    list_name: getMultiValues('leadListFilter'),
    management_month: getMultiValues('leadManagementMonthFilter'),
    last_management_month: getMultiValues('leadLastManagementMonthFilter'),
    status: getMultiValues('leadStatusFilter'),
    state: getMultiValues('leadStateFilter'),
    city: getMultiValues('leadCityFilter')
  };
}

function updateMultiSummary(id) {
  const root = $(id);
  const state = multiSelectState[id];
  if (!root || !state) return;

  const summary = root.querySelector('.multi-summary');
  const count = state.selected.length;
  if (!count) {
    summary.textContent = root.dataset.placeholder || 'Seleccionar';
    summary.classList.add('placeholder');
  } else {
    summary.textContent = count === 1 ? state.selected[0] : `${count} seleccionados`;
    summary.classList.remove('placeholder');
  }

  const chips = root.querySelector('.multi-chips');
  chips.innerHTML = count > 12
    ? `<span class="multi-chip multi-chip-count">${count} seleccionados<button type="button" data-clear-all>×</button></span>`
    : state.selected
      .map((v, i) => `<span class="multi-chip" title="${esc(v)}">${esc(v)}<button type="button" data-remove-index="${i}">×</button></span>`)
      .join('');

  const clearAll = chips.querySelector('[data-clear-all]');
  if (clearAll) clearAll.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selected = [];
    updateMultiSummary(id);
    renderMultiOptions(id, state.available || state.options);
    handleLeadFilterChange(id);
  });

  chips.querySelectorAll('[data-remove-index]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selected.splice(Number(btn.dataset.removeIndex), 1);
    updateMultiSummary(id);
    renderMultiOptions(id, state.options);
    handleLeadFilterChange(id);
  }));
}

function renderMultiOptions(id, items) {
  const root = $(id);
  const state = multiSelectState[id];
  const box = root.querySelector('.multi-options');
  state.options = items || [];
  box.innerHTML = '';

  if (!state.options.length) {
    box.innerHTML = '<div class="multi-empty">Sin opciones para los filtros seleccionados.</div>';
    return;
  }

  state.options.forEach((value) => {
    const item = document.createElement('label');
    item.className = 'multi-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(state.selected.includes(value)));
    item.innerHTML = `<input type="checkbox" ${state.selected.includes(value) ? 'checked' : ''}><span>${esc(value)}</span>`;
    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!state.selected.includes(value)) state.selected.push(value);
      } else {
        state.selected = state.selected.filter((x) => x !== value);
      }
      item.setAttribute('aria-selected', String(e.target.checked));
      updateMultiSummary(id);
      handleLeadFilterChange(id);
    });
    box.appendChild(item);
  });
}

let cascadeRevision = 0;

async function loadMultiOptions(id, search = '', options = {}) {
  const root = $(id);
  const state = multiSelectState[id];
  if (!root || !state) return false;

  const { pruneInvalid = false, revision = cascadeRevision } = options;
  const box = root.querySelector('.multi-options');
  box.innerHTML = '<div class="multi-empty">Consultando opciones...</div>';

  try {
    const payload = {
      field: root.dataset.field,
      search,
      limit: 300,
      ...selectedLeadFilters()
    };
    const data = await fetchJson('/api/lead-filter-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Ignora respuestas antiguas cuando el usuario cambia filtros rápidamente.
    if (revision !== cascadeRevision) return false;

    const available = [...new Set((data.items || []).map((x) => String(x)))];
    state.available = available;
    let selectionChanged = false;

    // En cascada se eliminan selecciones que ya no existen bajo el contexto actual.
    // Así un valor incompatible no deja bloqueados los demás filtros.
    if (pruneInvalid && !search) {
      const valid = new Set(available);
      const nextSelected = state.selected.filter((value) => valid.has(String(value)));
      selectionChanged = nextSelected.length !== state.selected.length;
      if (selectionChanged) {
        state.selected = nextSelected;
        updateMultiSummary(id);
      }
    }

    // En búsqueda manual se conservan visibles las selecciones actuales.
    const visibleItems = search
      ? [...new Set([...state.selected, ...available])]
      : available;
    renderMultiOptions(id, visibleItems);
    state.loaded = true;
    return selectionChanged;
  } catch (e) {
    if (revision === cascadeRevision) {
      box.innerHTML = `<div class="multi-empty error-text">${esc(e.message)}</div>`;
    }
    return false;
  }
}

const refreshDependentFilters = debounce(async (changedId) => {
  const revision = ++cascadeRevision;
  const dependentIds = leadFilterIds.filter((id) => {
    const state = multiSelectState[id];
    return id !== changedId
      && state
      && (state.loaded || state.selected.length > 0);
  });

  // Primera pasada: recalcula y limpia valores incompatibles.
  let prunedAny = false;
  for (const id of dependentIds) {
    if (revision !== cascadeRevision) return;
    const root = $(id);
    const search = root?.querySelector('.multi-search')?.value.trim() || '';
    const pruned = await loadMultiOptions(id, search, {
      pruneInvalid: true,
      revision
    });
    prunedAny = prunedAny || pruned;
  }

  // Si se limpió alguna selección, una segunda pasada deja todos los catálogos
  // consistentes con el nuevo conjunto de filtros.
  if (prunedAny) {
    for (const id of dependentIds) {
      if (revision !== cascadeRevision) return;
      const root = $(id);
      const search = root?.querySelector('.multi-search')?.value.trim() || '';
      await loadMultiOptions(id, search, {
        pruneInvalid: false,
        revision
      });
    }
  }
  saveLeadGlobalScopePreferences();
}, 180);

function initMultiSelect(id) {
  const root = $(id);
  if (!root) return;

  multiSelectState[id] = { selected: [], options: [], available: [], loaded: false };
  const menuId = `${id}Menu`;
  root.innerHTML = `<button type="button" class="multi-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}"><span class="multi-summary placeholder">${esc(root.dataset.placeholder || 'Seleccionar')}</span><span class="multi-arrow" aria-hidden="true">▾</span></button><div class="multi-chips"></div><div id="${menuId}" class="multi-menu"><div class="multi-search-row"><input class="multi-search" type="search" aria-label="Buscar opciones" placeholder="Escribe para buscar..."></div><div class="multi-bulk-row"><button type="button" class="multi-select-all">Seleccionar todos</button><button type="button" class="multi-clear">Quitar todos</button></div><div class="multi-options" role="listbox" aria-multiselectable="true"></div></div>`;

  const trigger = root.querySelector('.multi-trigger');
  const menu = root.querySelector('.multi-menu');
  const search = root.querySelector('.multi-search');

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    document.querySelectorAll('.multi-select.open').forEach((x) => {
      if (x !== root) {
        x.classList.remove('open');
        x.querySelector('.multi-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    root.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(root.classList.contains('open')));
    if (root.classList.contains('open')) {
      search.focus();
      await loadMultiOptions(id, search.value.trim());
    }
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && !root.classList.contains('open')) {
      event.preventDefault();
      trigger.click();
    }
  });

  search.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', debounce(() => loadMultiOptions(id, search.value.trim()), 300));

  root.querySelector('.multi-select-all').addEventListener('click', (e) => {
    e.stopPropagation();
    const state = multiSelectState[id];
    state.selected = [...new Set([...state.selected, ...(state.available || [])])];
    updateMultiSummary(id);
    renderMultiOptions(id, state.options);
    handleLeadFilterChange(id);
  });

  root.querySelector('.multi-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    multiSelectState[id].selected = [];
    updateMultiSummary(id);
    renderMultiOptions(id, multiSelectState[id].available || []);
    handleLeadFilterChange(id);
  });

  menu.addEventListener('click', (e) => e.stopPropagation());
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      root.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });
  updateMultiSummary(id);
}

let universePollTimer = null;
let currentUniverseJobId = null;
let universeUploadRequest = null;
let universeTerminalNotified = '';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-MX');
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (value < 60) return `${Math.round(value)} s`;
  const minutes = Math.floor(value / 60);
  const remainder = Math.round(value % 60);
  return `${minutes} min ${remainder} s`;
}

function updateUniverseSteps(status, percent, read) {
  const ids = ['universeStepUpload', 'universeStepRead', 'universeStepStage', 'universeStepTarget'];
  ids.forEach((id) => $(id).classList.remove('active', 'done'));
  if (status === 'SUBIENDO') { $('universeStepUpload').classList.add('active'); return; }
  $('universeStepUpload').classList.add('done');
  if (status === 'COMPLETADO') { ids.forEach((id) => $(id).classList.add('done')); return; }
  if (percent >= 80) {
    $('universeStepRead').classList.add('done'); $('universeStepStage').classList.add('done'); $('universeStepTarget').classList.add('active');
  } else {
    if (read > 0) {
      $('universeStepRead').classList.add('done');
      $('universeStepStage').classList.add('active');
    } else {
      $('universeStepRead').classList.add('active');
    }
  }
}

function renderUniverseJob(job) {
  if (!job) return;
  if (job.job_id) currentUniverseJobId = job.job_id;
  $('universeStatusPanel').classList.remove('hidden');
  $('universeFilename').textContent = job.filename || 'Importación de universo';
  $('universeStatus').textContent = job.status || '--';
  const numericPercent = Number(job.progress_percent);
  const hasPercent = job.progress_percent !== null && job.progress_percent !== undefined && Number.isFinite(numericPercent);
  const percent = hasPercent ? Math.max(0, Math.min(100, numericPercent)) : 0;
  $('universePercent').textContent = hasPercent ? `${Math.round(percent)}%` : 'En proceso';
  $('universeRead').textContent = job.total_rows ? `${formatNumber(job.read)} / ${formatNumber(job.total_rows)}` : formatNumber(job.read);
  $('universeUnique').textContent = formatNumber(job.unique_phones);
  $('universeNew').textContent = formatNumber(job.new_phones);
  $('universePrevious').textContent = formatNumber(job.existing_previous_month);
  $('universeDialed').textContent = formatNumber(job.previously_dialed);
  $('universeTarget').textContent = `${formatNumber(job.inserted)} / ${formatNumber(job.updated)}`;
  $('universePhase').textContent = job.error || job.phase || '';
  $('universeTimes').textContent = `EntryDate: ${job.entry_month || '--'} | Inicio: ${job.started_at || job.created_at || '--'}${job.finished_at ? ` | Fin: ${job.finished_at}` : ''}`;
  $('universeHistoryBreakdown').textContent = `Membresías nuevas del mes: ${formatNumber(job.cohort_inserted)} · Ya estaban registradas en ese mes/lista: ${formatNumber(job.cohort_existing)} · Coincidencias del mismo mes o posteriores: ${formatNumber(job.existing_same_month)} · Interacciones repetidas dentro del archivo: ${formatNumber(job.duplicate_interactions)} · Filas sin teléfono válido: ${formatNumber(job.invalid_rows)} · Filas nuevas guardadas en historial: ${formatNumber(job.staged)}.`;
  $('universeLogs').textContent = (job.logs || []).join('\n') || (job.error || 'Esperando el inicio del proceso...');
  $('universeLogs').scrollTop = $('universeLogs').scrollHeight;

  const status = String(job.status || '');
  const statusBox = $('universeStatus');
  statusBox.classList.remove('status-completed', 'status-error', 'status-running', 'status-cancelled');
  statusBox.classList.add(status === 'COMPLETADO' ? 'status-completed' : status === 'ERROR' ? 'status-error' : status === 'CANCELADO' ? 'status-cancelled' : 'status-running');
  const progress = $('universeProgress');
  progress.classList.toggle('complete', status === 'COMPLETADO');
  progress.classList.toggle('error', status === 'ERROR');
  progress.classList.toggle('cancelled', status === 'CANCELADO');
  progress.classList.toggle('indeterminate', !hasPercent && ['PROCESANDO', 'DETENIENDO'].includes(status));
  progress.querySelector('span').style.width = hasPercent ? `${percent}%` : '';
  $('universeProgressLabel').textContent = hasPercent ? `${Math.round(percent)}% completado` : 'Calculando avance...';
  $('universeSpeed').textContent = job.rows_per_second
    ? `${formatNumber(Math.round(job.rows_per_second))} filas/s${job.eta_seconds !== null && job.eta_seconds !== undefined ? ` · aproximadamente ${formatDuration(job.eta_seconds)} restantes` : ''}`
    : (status === 'SUBIENDO' ? 'Subiendo archivo...' : 'Calculando velocidad...');
  updateUniverseSteps(status, percent, Number(job.read || 0));

  const active = ['SUBIENDO', 'PROCESANDO', 'DETENIENDO'].includes(status);
  $('universeImportButton').disabled = active;
  $('universeImportButton').textContent = active ? 'Importación en proceso...' : 'Seleccionar e importar';
  const canCancel = active && job.can_cancel !== false;
  $('universeCancelButton').classList.toggle('hidden', !canCancel);
  $('universeCancelButton').disabled = status === 'DETENIENDO';
  $('universeCancelButton').textContent = status === 'DETENIENDO' ? 'Deteniendo...' : 'Detener proceso';
  if (active) scheduleUniversePoll();
  else if (universePollTimer) { clearTimeout(universePollTimer); universePollTimer = null; }
}

function scheduleUniversePoll() {
  if (universePollTimer || !currentUniverseJobId) return;
  universePollTimer = setTimeout(async () => {
    universePollTimer = null;
    try {
      const job = await fetchJson(`/api/universe-imports/${encodeURIComponent(currentUniverseJobId)}`, {}, 30000);
      renderUniverseJob(job);
      const terminalKey = `${job.job_id}:${job.status}`;
      if (job.status === 'COMPLETADO' && universeTerminalNotified !== terminalKey) {
        universeTerminalNotified = terminalKey;
        showMessage(`Universo actualizado para ${job.entry_month}. Nuevos: ${formatNumber(job.new_phones)}; ya existían en meses anteriores: ${formatNumber(job.existing_previous_month)}; ya se habían marcado: ${formatNumber(job.previously_dialed)}. Ninguna coincidencia fue bloqueada por el análisis.`);
      }
      if (job.status === 'ERROR' && universeTerminalNotified !== terminalKey) { universeTerminalNotified = terminalKey; showMessage(job.error || 'La importación falló.', true); }
      if (job.status === 'CANCELADO' && universeTerminalNotified !== terminalKey) { universeTerminalNotified = terminalKey; showMessage('La importación se detuvo de forma segura. Puedes cargar el archivo nuevamente para continuar.'); }
    } catch (e) {
      showMessage(e.message, true);
      scheduleUniversePoll();
    }
  }, 2000);
}

function showUniverseUpload(file, percent) {
  currentUniverseJobId = null;
  if (universePollTimer) { clearTimeout(universePollTimer); universePollTimer = null; }
  renderUniverseJob({
    filename: file.name, status: 'SUBIENDO', phase: 'Subiendo archivo al servidor',
    entry_month: $('universeEntryMonth')?.value || '',
    read: 0, staged: 0, inserted: 0, updated: 0, progress_percent: percent,
    rows_per_second: 0, logs: [`Subiendo ${file.name}: ${Math.round(percent)}%`],
    created_at: new Date().toLocaleString('es-MX')
  });
}

function uploadUniverseFile(form, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    universeUploadRequest = xhr;
    xhr.open('POST', '/api/universe-imports');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) showUniverseUpload(file, event.loaded / event.total * 100);
    });
    xhr.addEventListener('load', () => {
      universeUploadRequest = null;
      let data = {}; try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) { data = {}; }
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(data.detail || `Error HTTP ${xhr.status}`));
      else resolve(data);
    });
    xhr.addEventListener('error', () => { universeUploadRequest = null; reject(new Error('No se pudo subir el archivo.')); });
    xhr.addEventListener('abort', () => { universeUploadRequest = null; reject(new Error('La carga fue cancelada.')); });
    xhr.send(form);
  });
}

async function cancelUniverseImport() {
  const button = $('universeCancelButton');
  button.disabled = true;
  if (universeUploadRequest) {
    universeUploadRequest.abort();
    renderUniverseJob({ filename: $('universeZipFile').files[0]?.name, status: 'CANCELADO', phase: 'Carga cancelada', progress_percent: 0, read: 0, staged: 0, inserted: 0, updated: 0, logs: ['Carga cancelada por el usuario.'] });
    return;
  }
  if (!currentUniverseJobId) return;
  try {
    const job = await fetchJson(`/api/universe-imports/${encodeURIComponent(currentUniverseJobId)}/cancel`, { method: 'POST' }, 30000);
    renderUniverseJob(job);
  } catch (e) {
    showMessage(e.message, true);
    button.disabled = false;
  }
}

async function loadLatestUniverseJob() {
  try {
    const data = await fetchJson('/api/universe-imports/latest', {}, 30000);
    if (data.job) renderUniverseJob(data.job);
  } catch (e) {
    showMessage(e.message, true);
  }
}

async function submitUniverseImport(event) {
  event.preventDefault();
  const file = $('universeZipFile').files[0];
  if (!file) { showMessage('Selecciona un ZIP, Excel, CSV o TXT.', true); return; }
  const entryMonth = $('universeEntryMonth').value;
  if (!entryMonth) { showMessage('Selecciona el mes que se asignará a EntryDate.', true); return; }
  const button = $('universeImportButton');
  button.disabled = true;
  button.textContent = 'Subiendo archivo...';
  hideMessage();
  const form = new FormData();
  form.append('file', file);
  form.append('entry_month', entryMonth);
  form.append('year', entryMonth.slice(0, 4));
  try {
    showUniverseUpload(file, 0);
    const data = await uploadUniverseFile(form, file);
    renderUniverseJob(data);
    showMessage(`Archivo ${file.name} recibido. La importación continuará en segundo plano.`);
  } catch (e) {
    showMessage(e.message, true);
    button.disabled = false;
    button.textContent = 'Seleccionar e importar';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('messageClose').addEventListener('click', hideMessage);
  leadFilterIds.forEach(initMultiSelect);
  restoreLeadGlobalScopePreferences();
  initLeadViewPreferences();
  document.addEventListener('click', () => document.querySelectorAll('.multi-select.open').forEach((x) => {
    x.classList.remove('open');
    x.querySelector('.multi-trigger')?.setAttribute('aria-expanded', 'false');
  }));
  const tabButtons = [...document.querySelectorAll('.tab-button')];
  const activateTab = (btn) => {
    tabButtons.forEach((x) => {
      const active = x === btn;
      x.classList.toggle('active', active);
      x.setAttribute('aria-selected', String(active));
      x.setAttribute('tabindex', active ? '0' : '-1');
    });
    document.querySelectorAll('.tab-content').forEach((x) => {
      const active = x.id === btn.dataset.tab;
      x.classList.toggle('active', active);
      x.setAttribute('aria-hidden', String(!active));
    });
    $(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'leadsTab') {
      if (!isLeadGroupCollapsed('leadBatchHistoryGroup')) loadBatches(false);
      if (!isLeadGroupCollapsed('decisionDashboard') && !decisionDashboardLoaded) {
        loadDecisionDashboard();
      }
      if (!isLeadGroupCollapsed('universePriorityDashboard') && !universePriorityLoaded) {
        loadUniversePriority();
      }
      hideMessage();
    }
    if (btn.dataset.tab === 'universeTab') { loadLatestUniverseJob(); hideMessage(); }
  };
  tabButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => activateTab(btn));
    btn.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabButtons.length - 1;
      if (nextIndex !== null) {
        event.preventDefault();
        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      }
    });
  });
  activateTab(document.querySelector('.tab-button.active') || tabButtons[0]);
  
  $('dateFilter').value = today();
  $('dateFilter').addEventListener('change', () => loadDashboard(true));
  $('refreshButton').addEventListener('click', refreshData);
  $('reportAutoToggle').addEventListener('click', toggleReportAuto);
  $('leadExpandAllGroups').addEventListener('click', () => {
    applyLeadGroupPreset('expand-all');
  });
  $('leadCollapseAllGroups').addEventListener('click', () => {
    applyLeadGroupPreset('collapse-all');
  });
  $('leadExportOnlyView').addEventListener('click', () => {
    applyLeadGroupPreset('export-only');
  });
  $('leadGlobalScopeClear').addEventListener('click', clearLeadGlobalScope);
  $('previewLeadsButton').addEventListener('click', previewLeads);
  $('generateLeadsButton').addEventListener('click', generateLeads);
  $('decisionAnalyzeButton').addEventListener('click', () => {
    loadDecisionDashboard();
    loadUniversePriority();
  });
  $('universePriorityRefresh').addEventListener('click', () => loadUniversePriority(false));
  $('universePriorityUse').addEventListener('click', () => {
    useUniverseMonth($('universePriorityUse').dataset.entryMonth);
  });
  $('decisionUseButton').addEventListener('click', () => {
    const batchId = Number($('decisionUseButton').dataset.batchId || 0);
    if (batchId) useDecisionBatch(batchId);
  });
  $('decisionClearSource').addEventListener('click', clearDecisionSource);
  $('leadMode').addEventListener('change', () => {
    const recycle = $('leadMode').value === 'RECICLAJE';
    $('leadIncludePendingRecycle').disabled = !recycle;
    $('pendingRecycleOption').classList.toggle('disabled', !recycle);
    if (!recycle) $('leadIncludePendingRecycle').checked = false;
    if (!recycle && decisionSourceBatchIds.length) clearDecisionSource();
    invalidateLeadPreview();
    listStatusRequestRevision += 1;
    scheduleListStatusSummary();
  });
  $('leadIncludePendingRecycle').addEventListener('change', () => {
    invalidateLeadPreview();
    hideMessage();
  });
  $('pendingRecycleOption').classList.add('disabled');
  $('reloadBatchesButton').addEventListener('click', () => loadBatches(true));
  $('universeEntryMonth').value = today().slice(0, 7);
  $('universeImportForm').addEventListener('submit', submitUniverseImport);
  $('universeCancelButton').addEventListener('click', cancelUniverseImport);
  loadDashboard(true);
  loadAutoRefreshStatus();
  // Precarga la información ejecutiva mientras el usuario consulta el resumen.
  // Al abrir Generación de lotes, el ranking ya está listo para mostrarse.
  if (!isLeadGroupCollapsed('decisionDashboard')) loadDecisionDashboard();
  if (!isLeadGroupCollapsed('universePriorityDashboard')) {
    loadUniversePriority();
  }
  // El sondeo consulta únicamente el estado local del servicio; no ejecuta
  // consultas contra SQL. Así la pantalla refleja cada sincronización casi
  // inmediatamente sin aumentar la carga de la réplica.
  setInterval(loadAutoRefreshStatus, 5000);
  setInterval(renderAutoRefreshStatus, 1000);
  // El endpoint sirve una fotografía materializada; este sondeo es liviano y
  // permite mostrar el nuevo resumen apenas termine su reconstrucción.
  setInterval(() => {
    if (
      !document.hidden
      && universePriorityLoaded
      && !isLeadGroupCollapsed('universePriorityDashboard')
    ) {
      loadUniversePriority(true);
    }
  }, 30000);
});
