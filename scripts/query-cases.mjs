import { buildQueries } from '../src/queries.js';

const cases = [];
for (const dimension of ['year', 'quarter', 'month', 'region', 'city', 'category', 'product']) {
  const queries = buildQueries({ dimension });
  cases.push({ name: dimension, sql: queries.detail, total: queries.totals, revenueColumn: 1 });
}
const filtered = buildQueries({ dimension: 'month', year: '2025', region: 'Sur', category: 'Tecnología' });
for (const [name, sql] of Object.entries(filtered)) {
  cases.push({ name: `filtrado-${name}`, sql });
}
console.log(JSON.stringify(cases));
