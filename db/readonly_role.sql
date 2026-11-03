
CREATE ROLE toystore_readonly LOGIN PASSWORD '376295'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA toystore TO toystore_readonly;
GRANT SELECT ON
  toystore.products,
  toystore.website_sessions,
  toystore.website_pageviews,
  toystore.orders,
  toystore.order_items,
  toystore.order_item_refunds
TO toystore_readonly;

ALTER ROLE toystore_readonly SET default_transaction_read_only = on;
ALTER ROLE toystore_readonly SET statement_timeout = '10s';
