---
title: "Construimos una solución OLAP con DuckDB que puedes explorar desde el navegador"
published: true
description: "Un modelo estrella de ventas, consultas multidimensionales y despliegue automático con GitHub Actions y Pages."
tags: duckdb, sql, dataengineering, javascript
---

Una pregunta como «¿cuánto vendimos en 2025?» suele llevar a otras. Queremos comparar regiones, ver qué categorías aportaron más ingresos y desglosar los resultados por trimestre o mes. Para practicar ese recorrido construimos **Ventas Perú**, una aplicación OLAP con DuckDB que ejecuta las consultas dentro del navegador.

El proyecto utiliza **48.000 líneas de venta simuladas** de 2024 y 2025. Los datos se generan con una semilla fija para que cualquiera pueda reproducir los resultados. Elegimos cuatro ciudades peruanas y doce productos repartidos en tres categorías.

[Abrir la aplicación](https://rodrig0496.github.io/Actividad-Grupal-02-U2-Online-Analitycal-Processing/) · [Explorar el repositorio público](https://github.com/Rodrig0496/Actividad-Grupal-02-U2-Online-Analitycal-Processing) · [Ver el workflow de despliegue](https://github.com/Rodrig0496/Actividad-Grupal-02-U2-Online-Analitycal-Processing/actions/workflows/pages.yml)

## Empezamos por la granularidad

Cada fila de la tabla de hechos representa una línea de venta de un producto en una tienda y fecha. Guarda cantidad, ingreso y costo. A partir de estos importes calculamos la utilidad bruta.

El modelo tiene tres dimensiones. `dim_date` contiene fecha, año, trimestre y mes. `dim_product` contiene producto y categoría. `dim_store` contiene ciudad y región. Las tres se relacionan con `fact_sales` mediante claves, formando un esquema estrella.

```text
                    dim_date
                       |
dim_product ---- fact_sales ---- dim_store
```

Esta granularidad define las métricas que mostramos. Contamos líneas de venta y sumamos unidades. Los ingresos y costos se almacenan como `DECIMAL(14,2)` para representar importes monetarios con dos decimales.

## Un motor para generar los datos y otro para explorarlos

Python genera las ventas y las inserta en DuckDB. Allí validamos el modelo y exportamos las cuatro tablas a archivos Parquet comprimidos. En la aplicación, DuckDB-Wasm carga esos archivos y crea una vista llamada `sales` con los joins del modelo estrella.

DuckDB-Wasm permite usar DuckDB a través de JavaScript y WebAssembly. El motor trabaja en un Web Worker y devuelve los resultados en formato Apache Arrow. Nuestra aplicación aloja junto al HTML los workers y los binarios Wasm que necesita. [Documentación de DuckDB-Wasm](https://duckdb.org/docs/stable/clients/wasm/overview)

El recorrido completo queda así.

```text
Generador Python → DuckDB → Parquet
                           ↓
GitHub Pages → aplicación → DuckDB-Wasm → resultados OLAP
```

## Slice, dice y drill-down

Seleccionar 2025 aplica un filtro sobre la dimensión temporal, una operación de slice. Combinar ese año con la región Sur y la categoría Tecnología produce un subconjunto definido por varias dimensiones, una operación de dice.

La aplicación ejecuta consultas como esta al agrupar esa selección por mes.

```sql
select
    month_label as segment,
    sum(revenue) as revenue,
    sum(profit) as profit,
    sum(quantity) as units,
    count(*) as sale_lines
from sales
where year = 2025
  and region = 'Sur'
  and category = 'Tecnología'
group by month_label
order by month_label;
```

Para hacer drill-down cambiamos la agrupación de año a trimestre y luego a mes. También podemos pasar de región a ciudad o de categoría a producto. Los filtros permanecen activos durante ese recorrido, lo que permite examinar distintos niveles del mismo subconjunto. El panel SQL muestra la consulta que generó cada resultado.

## Roll-up y pivot

La tabla de roll-up reúne los trimestres, el subtotal de cada año y el total general. DuckDB genera esos niveles con `ROLLUP` y usamos `GROUPING()` para identificar las filas de subtotales. [Documentación de agrupaciones múltiples](https://duckdb.org/docs/stable/sql/query_syntax/grouping_sets.html)

```sql
select
    year,
    quarter,
    grouping(year) as is_grand_total,
    grouping(quarter) as is_subtotal,
    sum(revenue) as revenue
from sales
group by rollup(year, quarter);
```

El pivot presenta las regiones como filas y las categorías como columnas. Lo implementamos con agregación condicional mediante `FILTER`. Así se puede comparar el aporte de Tecnología, Hogar y Deportes a los ingresos de cada región. Los filtros de la interfaz también se aplican a estas dos tablas.

## Validar antes de desplegar

Al generar el dataset verificamos claves primarias, referencias entre tablas, cantidades positivas e ingresos coherentes con los costos. Comprobamos además que el join conserve las 48.000 filas y que el total del roll-up coincida con la suma de los hechos.

La automatización ejecuta las consultas que usa la interfaz. Después, una prueba con Playwright abre la aplicación en Chromium y comprueba la carga de DuckDB-Wasm, los filtros combinados, el detalle por ciudad, los subtotales, el pivot, la descarga CSV y el restablecimiento de la selección. Esta prueba permite detectar problemas de carga de workers o de rutas que una consulta ejecutada únicamente en Python dejaría pendientes.

## Publicar mediante GitHub Actions

Cada push a `main` instala las dependencias bloqueadas, genera los archivos Parquet, valida las consultas, compila con Vite y prueba la aplicación. Si esas etapas pasan, un segundo job publica `dist/` en GitHub Pages. El workflow también valida los pull requests. [Workflows personalizados de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

GitHub Pages aloja los archivos públicos y cada visitante ejecuta el análisis con el motor de su navegador. Esta arquitectura funciona para el tamaño de la demostración. La aplicación descarga el dataset completo y su capacidad depende de la memoria disponible en el dispositivo.

Para reproducirla, clona el repositorio y usa Python 3.11 y Node.js 22.12 o posterior. En macOS o Linux puedes ejecutar lo siguiente desde la raíz.

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
.venv/bin/python scripts/build_data.py
npm run dev
```

El README incluye los comandos para PowerShell. Abre la dirección que imprime Vite, selecciona un año y cambia la agrupación de región a ciudad. Desde allí puedes seguir desglosando la selección y descargar el resultado que acabas de consultar.
