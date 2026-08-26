const $ = (id) => document.getElementById(id);
let autoRefreshState = null;
let autoRefreshInitialized = false;
let lastObservedRefresh = null;

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function showMessage(text, error = false) {
  const message = $('message');
  if (!message) return;
  message.textContent = text;
  message.classList.remove('hidden', 'error');
  if (error) message.classList.add('error');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function hideMessage() {
  const message = $('message');
  if (message) message.classList.add('hidden');
}
function showLoading(text = 'Procesando información...') {
  const loader = $('globalLoader');
  const loaderText = $('globalLoaderText');
  if (loaderText) loaderText.textContent = text;
  if (loader) loader.classList.remove('hidden');
  document.body.classList.add('loading-active');
}
function hideLoading() {
  const loader = $('globalLoader');
  if (loader) loader.classList.add('hidden');
  document.body.classList.remove('loading-active');
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
  const toggle = $('autoRefreshToggle');
  const refresh = $('refreshButton');
  box.className = 'auto-refresh-status';
  toggle.disabled = false;
  refresh.disabled = Boolean(state.running);

  if (state.running) {
    box.classList.add('running');
    title.textContent = state.source === 'MANUAL' ? 'Actualización manual en proceso' : 'Actualizando automáticamente';
    detail.textContent = 'Descargando e importando datos de Vicidial...';
    toggle.disabled = true;
    toggle.textContent = 'En proceso';
    return;
  }
  if (!state.enabled) {
    box.classList.add('paused');
    title.textContent = 'Actualización automática pausada';
    detail.textContent = state.last_finished ? `Última ejecución: ${state.last_finished}` : 'Puedes seguir actualizando manualmente';
    toggle.textContent = 'Reanudar';
    return;
  }
  if (!state.in_schedule) {
    box.classList.add('paused');
    title.textContent = `Fuera de horario (${state.schedule_start}–${state.schedule_end})`;
    detail.textContent = `Próxima consulta: ${state.next_run || 'pendiente'}`;
    toggle.textContent = 'Pausar';
    return;
  }
  if (state.last_status === 'ERROR') {
    box.classList.add('error');
    title.textContent = 'Último intento con error';
    detail.textContent = `${autoRefreshCountdown(state.next_run)} · ${state.last_error || 'Revisa el servicio'}`;
  } else {
    title.textContent = `Automático ${state.schedule_start}–${state.schedule_end} · cada ${state.interval_minutes} min`;
    detail.textContent = autoRefreshCountdown(state.next_run);
  }
  toggle.textContent = 'Pausar';
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
    if (changed && state.last_status === 'COMPLETADO') await loadDashboard(false);
  } catch (_) {
    if ($('autoRefreshStatus')) {
      $('autoRefreshStatus').className = 'auto-refresh-status error';
      $('autoRefreshTitle').textContent = 'Sin conexión con el programador';
      $('autoRefreshDetail').textContent = 'Se volverá a consultar automáticamente';
    }
  }
}

async function toggleAutoRefresh() {
  if (!autoRefreshState) return;
  const button = $('autoRefreshToggle');
  button.disabled = true;
  try {
    autoRefreshState = await fetchJson('/api/auto-refresh/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !autoRefreshState.enabled })
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
  const btn = $('refreshButton'); btn.disabled = true; btn.textContent = 'Actualizando...';
  showLoading('Descargando e importando Call Report...');
  try {
    const r = await fetch('/api/refresh', { method: 'POST' }); const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Error al actualizar');
    const x = data.result; const importedDate = String(x.end || '').slice(0, 10); if (importedDate) $('dateFilter').value = importedDate; await loadDashboard(false);
    showMessage(`Actualización terminada. Leídos: ${x.read}, nuevos: ${x.inserted}, duplicados omitidos: ${x.duplicates}.`);
  } catch (e) { showMessage(e.message, true); }
  finally { hideLoading(); btn.disabled = false; btn.textContent = 'Actualizar desde Vicidial'; await loadAutoRefreshStatus(); }
}

function renderLeadPreview(items) {
  const body = $('previewTable'); const info = $('previewCountInfo');
  if (!body || !info) return;
  body.innerHTML = '';
  if (!items?.length) { body.innerHTML = '<tr><td colspan="12">No hay registros con los filtros seleccionados.</td></tr>'; info.textContent = '0 registros mostrados.'; return; }
  info.textContent = `Mostrando ${items.length} candidatos.`;
  items.forEach((x) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(x.lead_id)}</td><td>${esc(x.phone)}</td><td>${esc(x.name)}</td><td>${esc(x.state)}</td><td>${esc(x.city)}</td><td>${esc(x.campaign)}</td><td>${esc(x.list_name)}</td><td>${esc(x.status)}</td><td>${esc(x.called_count)}</td><td>${esc(x.quality)}</td><td>${esc(x.management_month)}</td><td>${esc(x.entry_date)}</td>`;
    body.appendChild(tr);
  });
}

const multiSelectState = {};
function getMultiValues(id) { return (multiSelectState[id]?.selected || []).slice(); }
function leadPayload() {
  return {
    quantity: Number($('leadQuantity').value || 5000), mode: $('leadMode').value,
    batch_name: $('leadBatchName').value.trim() || null,
    destination_campaign: $('leadDestinationCampaign').value.trim() || null,
    destination_list: $('leadDestinationList').value.trim() || null,
    campaign_id: getMultiValues('leadCampaignFilter'), list_name: getMultiValues('leadListFilter'),
    management_month: getMultiValues('leadManagementMonthFilter'), status: getMultiValues('leadStatusFilter'), state: getMultiValues('leadStateFilter'), city: getMultiValues('leadCityFilter')
  };
}
async function previewLeads() {
  const btn = $('previewLeadsButton'); btn.disabled = true;
  showLoading('Consultando candidatos en SQL Server...');
  try {
    const r = await fetch('/api/lead-batches/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leadPayload()) });
    const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Error en vista previa');
    $('previewAvailable').textContent = data.available; $('previewNeverCalled').textContent = data.never_called;
    $('previewQuality').textContent = data.average_quality; $('previewGeo').textContent = `${data.states} / ${data.cities}`;
    renderLeadPreview(data.items || []);
    showMessage(`Vista previa lista: ${data.available} teléfonos disponibles. Los ya exportados en lotes pendientes o marcados fueron excluidos automáticamente.`);
  } catch (e) { showMessage(e.message, true); }
  finally { hideLoading(); btn.disabled = false; }
}
async function generateLeads() {
  const btn = $('generateLeadsButton'); btn.disabled = true;
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
  if (!confirm(`Se actualizará Call Report. Los teléfonos marcados seguirán bloqueados y solo se liberarán los que no tengan llamadas. Se revisará el lote "${name}". ¿Continuar?`)) return;
  btn.disabled = true; showLoading('Actualizando Call Report y validando teléfonos del lote...');
  try {
    const r = await fetch(`/api/lead-batches/${id}/reconcile-release`, { method: 'POST' }); const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Error al revisar lote');
    await loadBatches(false);
    showMessage(`Anulación segura terminada. Marcados que permanecen bloqueados: ${data.marked}; liberados: ${data.released}; estado: ${data.status}.`);
  } catch (e) { showMessage(e.message, true); }
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

async function loadListStatusSummary() {
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
    renderListStatusSummary(data);
  } catch (error) {
    if (body) body.innerHTML = `<tr><td colspan="8" class="error-text">${esc(error.message)}</td></tr>`;
    if ($('listStatusSummaryTitle')) $('listStatusSummaryTitle').textContent = 'No fue posible obtener el resumen.';
  }
}

const scheduleListStatusSummary = debounce(loadListStatusSummary, 400);

function handleLeadFilterChange(changedId) {
  refreshDependentFilters(changedId);
  scheduleListStatusSummary();
}

const leadFilterIds = [
  'leadCampaignFilter',
  'leadListFilter',
  'leadStatusFilter',
  'leadStateFilter',
  'leadCityFilter',
  'leadManagementMonthFilter'
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
    item.innerHTML = `<input type="checkbox" ${state.selected.includes(value) ? 'checked' : ''}><span>${esc(value)}</span>`;
    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!state.selected.includes(value)) state.selected.push(value);
      } else {
        state.selected = state.selected.filter((x) => x !== value);
      }
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
  const dependentIds = leadFilterIds.filter((id) => id !== changedId && multiSelectState[id]);

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
}, 180);

function initMultiSelect(id) {
  const root = $(id);
  if (!root) return;

  multiSelectState[id] = { selected: [], options: [], available: [], loaded: false };
  root.innerHTML = `<button type="button" class="multi-trigger"><span class="multi-summary placeholder">${esc(root.dataset.placeholder || 'Seleccionar')}</span><span>▾</span></button><div class="multi-chips"></div><div class="multi-menu"><div class="multi-search-row"><input class="multi-search" type="search" placeholder="Escribe para buscar..."></div><div class="multi-bulk-row"><button type="button" class="multi-select-all">Seleccionar todos</button><button type="button" class="multi-clear">Quitar todos</button></div><div class="multi-options"></div></div>`;

  const trigger = root.querySelector('.multi-trigger');
  const menu = root.querySelector('.multi-menu');
  const search = root.querySelector('.multi-search');

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    document.querySelectorAll('.multi-select.open').forEach((x) => {
      if (x !== root) x.classList.remove('open');
    });
    root.classList.toggle('open');
    if (root.classList.contains('open')) {
      search.focus();
      await loadMultiOptions(id, search.value.trim());
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
  $('universeStaged').textContent = formatNumber(job.staged);
  $('universeTarget').textContent = `${formatNumber(job.inserted)} / ${formatNumber(job.updated)}`;
  $('universePhase').textContent = job.error || job.phase || '';
  $('universeTimes').textContent = `Inicio: ${job.started_at || job.created_at || '--'}${job.finished_at ? ` | Fin: ${job.finished_at}` : ''}`;
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
        showMessage(`Universo actualizado. Leídas: ${formatNumber(job.read)}, insertadas: ${formatNumber(job.inserted)}, actualizadas: ${formatNumber(job.updated)}.`);
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
  const button = $('universeImportButton');
  button.disabled = true;
  button.textContent = 'Subiendo archivo...';
  hideMessage();
  const form = new FormData();
  form.append('file', file);
  form.append('year', $('universeYear').value || String(new Date().getFullYear()));
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
  leadFilterIds.forEach(initMultiSelect);
  document.addEventListener('click', () => document.querySelectorAll('.multi-select.open').forEach((x) => x.classList.remove('open')));
  document.querySelectorAll('.tab-button').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active'); $(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'leadsTab') { loadBatches(false); hideMessage(); }
    if (btn.dataset.tab === 'universeTab') { loadLatestUniverseJob(); hideMessage(); }
  }));
  
  $('dateFilter').value = today();
  $('dateFilter').addEventListener('change', () => loadDashboard(true));
  $('refreshButton').addEventListener('click', refreshData);
  $('autoRefreshToggle').addEventListener('click', toggleAutoRefresh);
  $('previewLeadsButton').addEventListener('click', previewLeads);
  $('generateLeadsButton').addEventListener('click', generateLeads);
  $('reloadBatchesButton').addEventListener('click', () => loadBatches(true));
  $('universeYear').value = String(new Date().getFullYear());
  $('universeImportForm').addEventListener('submit', submitUniverseImport);
  $('universeCancelButton').addEventListener('click', cancelUniverseImport);
  loadDashboard(true);
  loadAutoRefreshStatus();
  setInterval(loadAutoRefreshStatus, 15000);
  setInterval(renderAutoRefreshStatus, 1000);
});
