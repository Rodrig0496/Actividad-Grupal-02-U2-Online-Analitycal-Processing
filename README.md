# Ventas Perú · Explorador OLAP

Aplicación de análisis multidimensional con DuckDB y DuckDB-Wasm. Explora **48.000 líneas de venta simuladas** de 2024 y 2025 mediante filtros, agregaciones por dimensión, roll-up y una tabla cruzada.

- [Abrir la aplicación pública](https://rodrig0496.github.io/Actividad-Grupal-02-U2-Online-Analitycal-Processing/)
- [Ver las ejecuciones de CI/CD](https://github.com/Rodrig0496/Actividad-Grupal-02-U2-Online-Analitycal-Processing/actions/workflows/pages.yml)
- [Artículo listo para DEV.to](articulo-devto.md)

## Arquitectura

```text
Python + generador determinista (semilla 2026)
    → DuckDB valida el modelo y exporta cuatro archivos Parquet
    → Vite empaqueta JavaScript, workers y WebAssembly
    → GitHub Actions comprueba las consultas y la interfaz en Chromium
    → GitHub Pages publica la aplicación y los archivos Parquet
    → DuckDB-Wasm carga el modelo y ejecuta SQL en el navegador
```

## Modelo estrella

La granularidad de `fact_sales` es una línea de venta de un producto en una tienda y fecha. Cada línea tiene un identificador único. Los importes son soles peruanos, con precisión de dos decimales.

| Tabla | Clave | Contenido |
| --- | --- | --- |
| `fact_sales` | `sale_id` | Claves de fecha, producto y tienda, cantidad, ingreso y costo |
| `dim_date` | `date_id` | 731 fechas, año, trimestre, mes y etiqueta año-mes |
| `dim_product` | `product_id` | 12 productos en Tecnología, Hogar y Deportes |
| `dim_store` | `store_id` | Tacna, Arequipa, Lima y Piura, agrupadas por región |

La vista `sales` une los hechos con las tres dimensiones. La utilidad bruta se calcula como ingreso menos costo. El código fuente del generador define precios, descuentos y distribución de tiendas. Los resultados describen este escenario educativo simulado.

## Operaciones disponibles

| Operación | Cómo probarla |
| --- | --- |
| Slice | Filtrar un año |
| Dice | Combinar año, región y categoría |
| Drill-down | Cambiar la agrupación de año a trimestre y mes, o de región a ciudad |
| Roll-up | Cambiar a una agrupación más general o abrir la tabla de subtotales por año y trimestre |
| Pivot | Abrir la tabla cruzada de región y categoría |

Los indicadores, el gráfico, la tabla y ambas operaciones usan los mismos filtros. La sección SQL muestra las consultas realmente ejecutadas. El CSV exporta la tabla del análisis por dimensión con la selección vigente. Los conteos de la aplicación corresponden a líneas de venta.

## Ejecutar localmente

Requiere Python 3.11 y Node.js 22.12 o posterior. Desde esta carpeta, en PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
.\.venv\Scripts\python.exe scripts/build_data.py
npm run dev
```

En macOS o Linux, crea el entorno con `python3.11 -m venv .venv` y sustituye `.\.venv\Scripts\python.exe` por `.venv/bin/python`. Abre la dirección local que imprime Vite.

## Validar y compilar

El generador valida claves primarias y referencias al insertar, cantidades positivas, ingresos coherentes, conservación de 48.000 filas al unir las dimensiones y conciliación del total de ROLLUP. También ejecuta las siete agrupaciones y las consultas filtradas que usa la aplicación.

```powershell
npm run build
npx playwright install chromium
npm run preview
```

En otra terminal, desde esta misma carpeta:

```powershell
npm run test:browser
```

La prueba de Chromium comprueba el motor WebAssembly, los filtros combinados, el detalle por ciudad, el roll-up, el pivot, la descarga CSV, el restablecimiento y el ancho de la página en móvil. El build queda en `dist/` e incluye el motor WebAssembly y sus workers.

## Automatización y alojamiento

El workflow `.github/workflows/pages.yml` instala las versiones bloqueadas por `package-lock.json`, genera y valida los datos, compila la aplicación y ejecuta la prueba de navegador. Los pushes a `main` despliegan tras superar esas etapas. Los pull requests a `main` ejecutan la validación. También admite ejecución manual en la rama principal.

La fuente de GitHub Pages se configura en **Settings → Pages → Source → GitHub Actions**. Los archivos se alojan públicamente en GitHub Pages y el motor OLAP se ejecuta en el navegador del visitante. La primera visita descarga el motor Wasm y los cuatro archivos Parquet. La carga completa del dataset y la memoria del navegador limitan el volumen adecuado para esta demostración.

## Publicar el artículo

Abre `articulo-devto.md` y pega su contenido en el editor Markdown de DEV.to. El encabezado incluye `published: true`. Revisa la vista previa y publica desde tu cuenta. Cada integrante debe publicar su propia versión según la consigna del curso.
