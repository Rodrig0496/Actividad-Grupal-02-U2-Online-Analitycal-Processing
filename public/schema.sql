create table dim_date as select * from read_parquet('dim_date.parquet');
create table dim_product as select * from read_parquet('dim_product.parquet');
create table dim_store as select * from read_parquet('dim_store.parquet');
create table fact_sales as select * from read_parquet('fact_sales.parquet');

create view sales as
select
    f.sale_id,
    d.sale_date,
    d.year,
    d.quarter,
    d.month,
    d.month_label,
    s.region,
    s.city,
    p.category,
    p.product,
    f.quantity,
    f.revenue,
    f.cost,
    f.revenue - f.cost as profit
from fact_sales f
join dim_date d using (date_id)
join dim_product p using (product_id)
join dim_store s using (store_id);
