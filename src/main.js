import * as duckdb from '@duckdb/duckdb-wasm';
import mvpModule from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehModule from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { buildQueries, dimensions } from './queries.js';
import './styles.css';

const form = document.querySelector('#filters');
const controls = document.querySelector('#controls');
const status = document.querySelector('#status');
const exportButton = document.querySelector('#export');
const rollupButton = document.querySelector('#rollup-tab');
const pivotButton = document.querySelector('#pivot-tab');
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const regularColumns = [
  ['segment', 'Segmento', String], ['revenue', 'Ingresos', money.format],
  ['profit', 'Utilidad bruta', money.format], ['units', 'Unidades', integer.format],
  ['sale_lines', 'Líneas de venta', integer.format],
];
const pivotColumns = [
  ['segment', 'Región', String], ['technology', 'Tecnología', money.format],
  ['home', 'Hogar', money.format], ['sports', 'Deportes', money.format],
  ['revenue', 'Total', money.format],
];
let connection;
let currentQueries;
let currentRows = [];
let operation = 'rollup';

function tableRows(result) {
  return result.toArray().map(row => Object.fromEntries(
    result.schema.fields.map(field => [field.name, row[field.name]]),
  ));
}

function renderTable(id, rows, columns) {
  const table = document.querySelector(id);
  const headRow = document.createElement('tr');
  for (const [, label] of columns) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headRow.append(cell);
  }
  table.tHead.replaceChildren(headRow);
  const body = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const [key, , format] of columns) {
      const td = document.createElement('td');
      td.textContent = format(row[key]);
      tr.append(td);
    }
    body.append(tr);
  }
  table.tBodies[0].replaceChildren(body);
}

function renderChart(rows) {
  const chart = document.querySelector('#chart');
  const maximum = Math.max(1, ...rows.map(row => Number(row.revenue)));
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const bar = document.createElement('div');
    bar.className = 'chart-row';
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = row.segment;
    const track = document.createElement('div');
    track.className = 'chart-track';
    track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    fill.className = 'chart-fill';
    fill.style.width = `${Number(row.revenue) * 100 / maximum}%`;
    track.append(fill);
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = money.format(row.revenue);
    bar.append(label, track, value);
    fragment.append(bar);
  }
  chart.replaceChildren(fragment);
}

function setBusy(busy) {
  controls.disabled = busy;
  exportButton.disabled = busy;
  rollupButton.disabled = busy;
  pivotButton.disabled = busy;
  document.querySelector('main').setAttribute('aria-busy', String(busy));
}

function showError(error) {
  console.error(error);
  status.classList.add('error');
  status.textContent = `No se pudo completar el análisis. ${error.message}. Recarga la página para volver a intentarlo.`;
}

async function renderOperation() {
  const rows = tableRows(await connection.query(currentQueries[operation]));
  renderTable('#operation', rows, operation === 'pivot' ? pivotColumns : regularColumns);
  rollupButton.setAttribute('aria-pressed', String(operation === 'rollup'));
  pivotButton.setAttribute('aria-pressed', String(operation === 'pivot'));
  document.querySelector('#operation-sql-heading').textContent = operation === 'pivot' ? 'Pivot' : 'Roll-up';
  document.querySelector('#operation-sql').textContent = currentQueries[operation];
}

async function refresh() {
  setBusy(true);
  status.classList.remove('error');
  status.textContent = 'Ejecutando las consultas…';
  try {
    // Disabled form fields are excluded from FormData, so read their values directly.
    const filters = Object.fromEntries(['year', 'region', 'category', 'dimension'].map(
      name => [name, form.elements.namedItem(name).value],
    ));
    currentQueries = buildQueries(filters);
    const start = performance.now();
    currentRows = tableRows(await connection.query(currentQueries.detail));
    const [totals] = tableRows(await connection.query(currentQueries.totals));
    document.querySelector('#revenue').textContent = money.format(totals.revenue ?? 0);
    document.querySelector('#profit').textContent = money.format(totals.profit ?? 0);
    document.querySelector('#units').textContent = integer.format(totals.units ?? 0);
    document.querySelector('#sale-lines').textContent = integer.format(totals.sale_lines);
    const label = dimensions[filters.dimension].label;
    document.querySelector('#result-heading').textContent = `Ingresos por ${label.toLowerCase()}`;
    document.querySelector('#result-caption').textContent = `${currentRows.length} segmentos · ${filters.year || '2024–2025'} · ${filters.region || 'Todas las regiones'} · ${filters.category || 'Todas las categorías'}`;
    renderTable('#results', currentRows, [['segment', label, String], ...regularColumns.slice(1)]);
    renderChart(currentRows);
    document.querySelector('#detail-sql').textContent = currentQueries.detail;
    await renderOperation();
    status.textContent = `DuckDB listo · ${integer.format(totals.sale_lines)} líneas seleccionadas · Consultas en ${(performance.now() - start).toFixed(0)} ms`;
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('change', refresh);
document.querySelector('#reset-filters').addEventListener('click', () => { form.reset(); refresh(); });
for (const [button, view] of [[rollupButton, 'rollup'], [pivotButton, 'pivot']]) {
  button.addEventListener('click', async () => {
    setBusy(true);
    operation = view;
    try { await renderOperation(); } catch (error) { showError(error); } finally { setBusy(false); }
  });
}
exportButton.addEventListener('click', () => {
  const columns = regularColumns.map(([key]) => key);
  const escape = value => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [columns, ...currentRows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ventas-seleccion.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function initialize() {
  try {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: mvpModule, mainWorker: mvpWorker },
      eh: { mainModule: ehModule, mainWorker: ehWorker },
    });
    const worker = new Worker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule);
    const tables = ['dim_date', 'dim_product', 'dim_store', 'fact_sales'];
    await Promise.all(tables.map(async table => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${table}.parquet`);
      if (!response.ok) throw new Error(`Error HTTP ${response.status} al cargar ${table}`);
      await db.registerFileBuffer(`${table}.parquet`, new Uint8Array(await response.arrayBuffer()));
    }));
    const schema = await fetch(`${import.meta.env.BASE_URL}schema.sql`);
    if (!schema.ok) throw new Error('No se pudo cargar el modelo estrella');
    connection = await db.connect();
    await connection.query(await schema.text());
    await refresh();
  } catch (error) {
    setBusy(true);
    showError(error);
  }
}

initialize();
