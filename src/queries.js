export const dimensions = {
  year: { sql: 'year', label: 'Año' },
  quarter: { sql: "year || '-T' || quarter", label: 'Trimestre' },
  month: { sql: 'month_label', label: 'Mes' },
  region: { sql: 'region', label: 'Región' },
  city: { sql: 'city', label: 'Ciudad' },
  category: { sql: 'category', label: 'Categoría' },
  product: { sql: 'product', label: 'Producto' },
};

function checked(value, allowed) {
  if (!allowed.includes(value)) throw new Error(`Valor de filtro inválido: ${value}`);
  return value;
}

export function whereClause(filters) {
  const conditions = [];
  if (filters.year) conditions.push(`year = ${checked(filters.year, ['2024', '2025'])}`);
  if (filters.region) conditions.push(`region = '${checked(filters.region, ['Sur', 'Centro', 'Norte'])}'`);
  if (filters.category) conditions.push(`category = '${checked(filters.category, ['Tecnología', 'Hogar', 'Deportes'])}'`);
  return conditions.length ? `where ${conditions.join(' and ')}` : '';
}

export function buildQueries(filters) {
  if (!Object.hasOwn(dimensions, filters.dimension)) throw new Error('Dimensión inválida');
  const dimension = dimensions[filters.dimension].sql;
  const where = whereClause(filters);
  const metrics = `cast(sum(revenue) as double) as revenue, cast(sum(profit) as double) as profit,
    sum(quantity) as units, count(*) as sale_lines`;
  const detail = `select cast(${dimension} as varchar) as segment, ${metrics}
from sales ${where}
group by ${dimension}
order by ${dimension}`;
  return {
    detail,
    totals: `select ${metrics} from sales ${where}`,
    rollup: `select case when grouping(year) = 1 then 'TOTAL'
  when grouping(quarter) = 1 then cast(year as varchar) || ' · Total anual'
  else year || '-T' || quarter end as segment, ${metrics}
from sales ${where}
group by rollup(year, quarter)
order by grouping(year), year, grouping(quarter), quarter`,
    pivot: `select region as segment,
  cast(coalesce(sum(revenue) filter (where category = 'Tecnología'), 0) as double) as technology,
  cast(coalesce(sum(revenue) filter (where category = 'Hogar'), 0) as double) as home,
  cast(coalesce(sum(revenue) filter (where category = 'Deportes'), 0) as double) as sports,
  cast(sum(revenue) as double) as revenue
from sales ${where}
group by region order by region`,
  };
}
