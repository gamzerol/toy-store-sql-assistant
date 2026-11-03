-- Made-up rows for tests only. They are not the Toy Store data.
SELECT setseed(0.42);

INSERT INTO toystore.products VALUES
  (1, '2012-03-19 08:00', 'The Original Mr. Fuzzy'),
  (2, '2013-01-06 13:00', 'The Forever Love Bear'),
  (3, '2013-12-12 09:00', 'The Birthday Sugar Panda'),
  (4, '2014-02-05 10:00', 'The Hudson River Mini Bear');

INSERT INTO toystore.website_sessions
SELECT i,
  TIMESTAMP '2012-03-19' + (i * INTERVAL '6 hours'),
  CASE WHEN i % 6 = 0 THEN i - 5 ELSE i END,
  (i % 6 = 0)::int,
  CASE WHEN i % 6 = 0 OR i % 11 = 0 THEN NULL WHEN i % 13 = 0 THEN 'socialbook' ELSE 'gsearch' END,
  CASE WHEN i % 6 = 0 OR i % 11 = 0 THEN NULL WHEN i % 13 = 0 THEN 'pilot' WHEN i % 5 = 0 THEN 'brand' ELSE 'nonbrand' END,
  NULL,
  CASE WHEN i % 3 = 0 THEN 'mobile' ELSE 'desktop' END,
  CASE WHEN i % 22 = 0 THEN NULL ELSE 'https://www.gsearch.com' END
FROM generate_series(1, 4380) AS i;

-- A session goes through the first (stage) pages of the funnel.
CREATE TEMP TABLE path AS
SELECT s.website_session_id AS id, s.created_at,
  ((s.website_session_id * 7919) % 9) AS stage
FROM toystore.website_sessions s;

INSERT INTO toystore.website_pageviews
SELECT row_number() OVER (ORDER BY id, step), created_at + step * INTERVAL '1 minute', id, url
FROM (
  SELECT p.id, p.created_at, v.step,
    CASE v.step
      WHEN 0 THEN CASE WHEN p.id % 2 = 0 THEN '/home' ELSE '/lander-1' END
      WHEN 1 THEN '/products'
      WHEN 2 THEN '/the-original-mr-fuzzy'
      WHEN 3 THEN '/cart'
      WHEN 4 THEN '/shipping'
      WHEN 5 THEN CASE
        WHEN p.created_at < '2012-09-10' THEN '/billing'
        WHEN p.created_at > '2013-01-05' THEN '/billing-2'
        WHEN p.id % 2 = 0 THEN '/billing' ELSE '/billing-2' END
      ELSE '/thank-you-for-your-order'
    END AS url
  FROM path p
  JOIN generate_series(0, 6) AS v(step) ON v.step <= p.stage
) t;

INSERT INTO toystore.orders
SELECT row_number() OVER (ORDER BY s.website_session_id),
  s.created_at + INTERVAL '10 minutes', s.website_session_id, s.user_id,
  1 + (s.website_session_id % 2)::int, 1, 50, 20
FROM toystore.website_sessions s
JOIN path p ON p.id = s.website_session_id
WHERE p.stage >= 6;

INSERT INTO toystore.order_items
SELECT o.order_id, o.created_at, o.order_id, o.primary_product_id, 1, 50, 20
FROM toystore.orders o;

INSERT INTO toystore.order_items
SELECT 100000 + o.order_id, o.created_at, o.order_id, 4, 0, 30, 10
FROM toystore.orders o
WHERE o.created_at >= '2013-09-25' AND o.order_id % 3 = 0;

UPDATE toystore.orders o SET items_purchased = 2, price_usd = 80, cogs_usd = 30
WHERE EXISTS (SELECT 1 FROM toystore.order_items i WHERE i.order_id = o.order_id AND i.is_primary_item = 0);

-- Two refunds on some orders, to expose double counting.
INSERT INTO toystore.order_item_refunds
SELECT row_number() OVER (ORDER BY i.order_item_id), i.created_at + INTERVAL '5 days',
  i.order_item_id, i.order_id, i.price_usd
FROM toystore.order_items i
WHERE i.order_id % 10 = 0;
