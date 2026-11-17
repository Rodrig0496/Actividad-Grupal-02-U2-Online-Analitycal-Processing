"""Generate deterministic educational sales data and validate the OLAP model."""

import json
import random
import subprocess
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data"
SEED = 2026
ROW_COUNT = 48_000
PRODUCTS = [
    (1, "Tecnología", "Laptop", 280000, 210000),
    (2, "Tecnología", "Monitor", 78000, 52000),
    (3, "Tecnología", "Teclado", 13500, 8000),
    (4, "Tecnología", "Mouse", 6500, 3500),
    (5, "Hogar", "Cafetera", 28000, 17000),
    (6, "Hogar", "Licuadora", 19000, 11500),
    (7, "Hogar", "Lámpara", 9500, 5000),
    (8, "Hogar", "Ventilador", 16000, 10000),
    (9, "Deportes", "Zapatillas", 24000, 13500),
    (10, "Deportes", "Mochila", 12000, 6500),
    (11, "Deportes", "Balón", 8500, 4000),
    (12, "Deportes", "Colchoneta", 7000, 3500),
]
STORES = [(1, "Sur", "Tacna"), (2, "Sur", "Arequipa"), (3, "Centro", "Lima"), (4, "Norte", "Piura")]


def main():
    rng = random.Random(SEED)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(config={"threads": 1}) as db:
        print("Generando dimensiones y hechos…", flush=True)
        db.execute("""
            create table dim_date (
                date_id integer primary key, sale_date date not null,
                year integer not null, quarter integer not null,
                month integer not null, month_label varchar not null
            );
            create table dim_product (
                product_id integer primary key, category varchar not null,
                product varchar not null
            );
            create table dim_store (
                store_id integer primary key, region varchar not null, city varchar not null
            );
            create table fact_sales (
                sale_id integer primary key,
                date_id integer references dim_date(date_id),
                product_id integer references dim_product(product_id),
                store_id integer references dim_store(store_id),
                quantity integer not null,
                revenue decimal(14,2) not null,
                cost decimal(14,2) not null
            );
        """)
        dates = [date(2024, 1, 1) + timedelta(days=offset) for offset in range(731)]
        db.begin()
        db.execute("""
            insert into dim_date
            select cast(strftime(day, '%Y%m%d') as integer), cast(day as date),
                   year(day), quarter(day), month(day), strftime(day, '%Y-%m')
            from generate_series(date '2024-01-01', date '2025-12-31', interval '1 day') as days(day)
        """)
        db.executemany("insert into dim_product values (?, ?, ?)", [product[:3] for product in PRODUCTS])
        db.executemany("insert into dim_store values (?, ?, ?)", STORES)
        rows = []
        for sale_id in range(1, ROW_COUNT + 1):
            day = rng.choice(dates)
            product_id, _, _, price_cents, cost_cents = rng.choice(PRODUCTS)
            store_id = rng.choices([1, 2, 3, 4], weights=[2, 3, 6, 3])[0]
            quantity = rng.randint(1, 5)
            discount_percent = rng.choice([0, 0, 0, 5, 10])
            revenue = Decimal(price_cents * quantity * (100 - discount_percent)) / 10_000
            cost = Decimal(cost_cents * quantity) / 100
            rows.append((sale_id, int(day.strftime("%Y%m%d")), product_id, store_id, quantity, revenue, cost))
        db.execute("""
            insert into fact_sales
            select unnest(?::integer[]), unnest(?::integer[]),
                   unnest(?::integer[]), unnest(?::integer[]),
                   unnest(?::integer[]), unnest(?::decimal(14,2)[]),
                   unnest(?::decimal(14,2)[])
        """, list(zip(*rows)))
        db.commit()
        print("Exportando las cuatro tablas a Parquet…", flush=True)
        for table in ("dim_date", "dim_product", "dim_store", "fact_sales"):
            target = str(OUTPUT / f"{table}.parquet").replace("'", "''")
            db.execute(f"copy {table} to '{target}' (format parquet, compression zstd)")

    # Use exactly the schema and query generator consumed by the browser.
    with duckdb.connect(config={"threads": 1}) as db:
        schema = (ROOT / "public" / "schema.sql").read_text(encoding="utf-8")
        for table in ("dim_date", "dim_product", "dim_store", "fact_sales"):
            path = str(OUTPUT / f"{table}.parquet").replace("'", "''")
            schema = schema.replace(f"read_parquet('{table}.parquet')", f"read_parquet('{path}')")
        db.execute(schema)
        total, revenue, profit, units = db.execute(
            "select count(*), sum(revenue), sum(profit), sum(quantity) from sales"
        ).fetchone()
        if total != ROW_COUNT:
            raise ValueError("El join del modelo estrella cambió el número de filas")
        invalid = db.execute("select count(*) from sales where quantity <= 0 or revenue < cost").fetchone()[0]
        if invalid:
            raise ValueError("Se encontraron cantidades o importes inválidos")
        result = subprocess.run(["node", "scripts/query-cases.mjs"], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8")
        cases = json.loads(result.stdout)
        for case in cases:
            table = db.execute(case["sql"]).fetchall()
            if not table:
                raise ValueError(f"La consulta {case['name']} no devolvió filas")
            if "total" in case:
                expected_revenue = db.execute(case["total"]).fetchone()[0]
                if round(sum(row[case["revenueColumn"]] for row in table), 2) != round(expected_revenue, 2):
                    raise ValueError(f"Los segmentos de {case['name']} no concilian con el total")
            print(f"OK {case['name']}: {len(table)} filas")
        rollup_total = db.execute("select sum(revenue) from sales group by rollup(year) having grouping(year)=1").fetchone()[0]
        if rollup_total != revenue:
            raise ValueError("El total de ROLLUP no coincide con los hechos")

    metadata = {
        "synthetic": True, "seed": SEED, "rows": total,
        "period": "2024–2025", "revenue": str(revenue),
        "profit": str(profit), "units": units,
        "currency": "PEN", "dates": len(dates), "products": len(PRODUCTS), "stores": len(STORES),
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
