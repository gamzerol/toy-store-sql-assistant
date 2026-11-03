export type EvalQuestion = {
  id: number;
  category: string;
  question: string;
  gold: string | null;
  trap: string;
};

const WINDOW = "s.created_at >= '2012-04-01' AND s.created_at < '2015-03-01'";
const CHANNEL = `CASE
    WHEN s.utm_source IS NULL AND s.http_referer IS NULL THEN 'direct'
    WHEN s.utm_source IS NULL THEN 'organic_search'
    WHEN s.utm_source = 'socialbook' THEN 'paid_social'
    WHEN s.utm_campaign = 'brand' THEN 'paid_brand'
    WHEN s.utm_campaign = 'nonbrand' THEN 'paid_nonbrand'
    ELSE 'other'
  END`;

export const QUESTIONS: EvalQuestion[] = [
  {
    id: 1,
    category: "basic",
    question: "How many website sessions are there in total?",
    trap: "None. Baseline check.",
    gold: `SELECT COUNT(*) AS sessions FROM website_sessions`,
  },
  {
    id: 2,
    category: "basic",
    question:
      "What are the total number of orders and total gross revenue across all time?",
    trap: "None. Baseline check.",
    gold: `SELECT COUNT(*) AS orders, SUM(price_usd) AS gross_revenue FROM orders`,
  },
  {
    id: 3,
    category: "basic",
    question: "List each product with its launch date, oldest first.",
    trap: "Launch date is products.created_at.",
    gold: `SELECT product_name, created_at FROM products ORDER BY created_at`,
  },
  {
    id: 4,
    category: "basic",
    question: "How many sessions came from each device type?",
    trap: "None. Baseline check.",
    gold: `SELECT device_type, COUNT(*) AS sessions FROM website_sessions GROUP BY device_type`,
  },
  {
    id: 5,
    category: "metrics",
    question: "What is the all-time average order value?",
    trap: "AOV is per order, not per item.",
    gold: `SELECT AVG(price_usd) AS aov FROM orders`,
  },
  {
    id: 6,
    category: "metrics",
    question: "What is the all-time gross margin percentage?",
    trap: "Divide summed values. An average of per-order margins gives a different number.",
    gold: `SELECT 100.0 * SUM(price_usd - cogs_usd) / SUM(price_usd) AS gross_margin_pct FROM orders`,
  },
  {
    id: 7,
    category: "metrics",
    question:
      "Show monthly sessions, orders and session-to-order conversion rate.",
    trap: "Partial first and last months, plus LEFT JOIN from sessions.",
    gold: `SELECT DATE_TRUNC('month', s.created_at)::date AS month,
  COUNT(*) AS sessions, COUNT(o.order_id) AS orders,
  COUNT(o.order_id)::numeric / COUNT(*) AS cvr
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
WHERE ${WINDOW} GROUP BY 1 ORDER BY 1`,
  },
  {
    id: 8,
    category: "metrics",
    question: "Show revenue per session for each month.",
    trap: "The denominator must include sessions without orders.",
    gold: `SELECT DATE_TRUNC('month', s.created_at)::date AS month,
  SUM(o.price_usd) / COUNT(*) AS revenue_per_session
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
WHERE ${WINDOW} GROUP BY 1 ORDER BY 1`,
  },
  {
    id: 9,
    category: "metrics",
    question: "What was gross revenue in 2013 and in 2014?",
    trap: "Whole-year filter on orders.",
    gold: `SELECT EXTRACT(YEAR FROM created_at)::int AS year, SUM(price_usd) AS gross_revenue
FROM orders WHERE created_at >= '2013-01-01' AND created_at < '2015-01-01' GROUP BY 1 ORDER BY 1`,
  },
  {
    id: 10,
    category: "metrics",
    question:
      "What is the session-to-order conversion rate for each device type across all time?",
    trap: "Inner join would make conversion look like 100%.",
    gold: `SELECT s.device_type, COUNT(o.order_id)::numeric / COUNT(*) AS cvr
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
GROUP BY 1`,
  },
  {
    id: 11,
    category: "channels",
    question:
      "For each marketing channel, show sessions, orders and conversion rate across all time.",
    trap: "Channel is not a column. It needs the business definition.",
    gold: `SELECT ${CHANNEL} AS channel, COUNT(*) AS sessions, COUNT(o.order_id) AS orders,
  COUNT(o.order_id)::numeric / COUNT(*) AS cvr
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
GROUP BY 1`,
  },
  {
    id: 12,
    category: "channels",
    question: "What share of all sessions comes from paid non-brand traffic?",
    trap: "Paid non-brand has to exclude paid social.",
    gold: `SELECT 100.0 * COUNT(*) FILTER (WHERE (${CHANNEL}) = 'paid_nonbrand') / COUNT(*) AS pct
FROM website_sessions s`,
  },
  {
    id: 13,
    category: "channels",
    question:
      "For paid non-brand traffic only, compare revenue per session on mobile and desktop.",
    trap: "Combines channel definition and a LEFT JOIN.",
    gold: `SELECT s.device_type, SUM(o.price_usd) / COUNT(*) AS revenue_per_session
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
WHERE (${CHANNEL}) = 'paid_nonbrand' GROUP BY 1`,
  },
  {
    id: 14,
    category: "channels",
    question: "Show sessions by channel for each quarter.",
    trap: "Partial first and last quarters.",
    gold: `SELECT DATE_TRUNC('quarter', s.created_at)::date AS quarter, ${CHANNEL} AS channel, COUNT(*) AS sessions
FROM website_sessions s WHERE s.created_at >= '2012-04-01' AND s.created_at < '2015-01-01'
GROUP BY 1, 2 ORDER BY 1, 2`,
  },
  {
    id: 15,
    category: "funnel",
    question:
      "For each device type, how many sessions reached the cart, shipping, billing and order confirmation pages?",
    trap: "Billing has two URLs. Count sessions, not pageviews.",
    gold: `SELECT s.device_type,
  COUNT(DISTINCT p.website_session_id) FILTER (WHERE p.pageview_url = '/cart') AS cart,
  COUNT(DISTINCT p.website_session_id) FILTER (WHERE p.pageview_url = '/shipping') AS shipping,
  COUNT(DISTINCT p.website_session_id) FILTER (WHERE p.pageview_url IN ('/billing', '/billing-2')) AS billing,
  COUNT(DISTINCT p.website_session_id) FILTER (WHERE p.pageview_url = '/thank-you-for-your-order') AS orders
FROM website_sessions s JOIN website_pageviews p ON p.website_session_id = s.website_session_id
GROUP BY 1`,
  },
  {
    id: 16,
    category: "funnel",
    question: "What is the overall bounce rate?",
    trap: "A bounce is a session with exactly one pageview.",
    gold: `WITH per_session AS (
  SELECT website_session_id, COUNT(*) AS pageviews FROM website_pageviews GROUP BY 1
)
SELECT COUNT(*) FILTER (WHERE pageviews = 1)::numeric / COUNT(*) AS bounce_rate FROM per_session`,
  },
  {
    id: 17,
    category: "funnel",
    question: "Show sessions and bounce rate for each landing page.",
    trap: "The landing page is the first pageview of the session.",
    gold: `WITH per_session AS (
  SELECT website_session_id, MIN(website_pageview_id) AS first_id, COUNT(*) AS pageviews
  FROM website_pageviews GROUP BY 1
)
SELECT p.pageview_url AS landing_page, COUNT(*) AS sessions,
  COUNT(*) FILTER (WHERE f.pageviews = 1)::numeric / COUNT(*) AS bounce_rate
FROM per_session f JOIN website_pageviews p ON p.website_pageview_id = f.first_id
GROUP BY 1`,
  },
  {
    id: 18,
    category: "experiments",
    question:
      "Compare the order conversion rate of /billing and /billing-2 during the period when both pages were live.",
    trap: "Needs the overlap window. Comparing all time would be unfair.",
    gold: `WITH w AS (
  SELECT MIN(created_at) FILTER (WHERE pageview_url = '/billing-2') AS test_start,
         MAX(created_at) FILTER (WHERE pageview_url = '/billing') AS test_end
  FROM website_pageviews
)
SELECT p.pageview_url AS billing_page, COUNT(*) AS billing_sessions,
  COUNT(o.order_id)::numeric / COUNT(*) AS cvr
FROM website_pageviews p CROSS JOIN w
LEFT JOIN orders o ON o.website_session_id = p.website_session_id
WHERE p.pageview_url IN ('/billing', '/billing-2')
  AND p.created_at BETWEEN w.test_start AND w.test_end
GROUP BY 1`,
  },
  {
    id: 19,
    category: "cross-sell",
    question:
      "For each month since the first cross-sell item was sold, what percentage of orders had more than one item?",
    trap: "The start date must come from the data, and the last month is partial.",
    gold: `SELECT DATE_TRUNC('month', created_at)::date AS month,
  100.0 * COUNT(*) FILTER (WHERE items_purchased > 1) / COUNT(*) AS pct_multi_item
FROM orders
WHERE created_at < '2015-03-01'
  AND created_at >= DATE_TRUNC('month', (SELECT MIN(created_at) FROM order_items WHERE is_primary_item = 0))
GROUP BY 1 ORDER BY 1`,
  },
  {
    id: 20,
    category: "cross-sell",
    question:
      "Which primary product and cross-sell product pairs are bought together most often? Show all pairs with their order counts.",
    trap: "Needs products joined twice.",
    gold: `SELECT p1.product_name AS primary_product, p2.product_name AS cross_sell_product, COUNT(*) AS orders
FROM order_items oi
JOIN orders o ON o.order_id = oi.order_id
JOIN products p1 ON p1.product_id = o.primary_product_id
JOIN products p2 ON p2.product_id = oi.product_id
WHERE oi.is_primary_item = 0 GROUP BY 1, 2 ORDER BY 3 DESC`,
  },
  {
    id: 21,
    category: "cross-sell",
    question: "What is the all-time revenue of each product?",
    trap: "Using orders.primary_product_id would credit add-ons to the wrong product.",
    gold: `SELECT p.product_name, SUM(oi.price_usd) AS revenue
FROM order_items oi JOIN products p ON p.product_id = oi.product_id GROUP BY 1`,
  },
  {
    id: 22,
    category: "refunds",
    question: "What is the refund rate of each product?",
    trap: "Items, not orders, with a LEFT JOIN to refunds.",
    gold: `SELECT p.product_name, COUNT(r.order_item_refund_id)::numeric / COUNT(*) AS refund_rate
FROM order_items oi JOIN products p ON p.product_id = oi.product_id
LEFT JOIN order_item_refunds r ON r.order_item_id = oi.order_item_id GROUP BY 1`,
  },
  {
    id: 23,
    category: "refunds",
    question: "What is all-time net revenue?",
    trap: "Joining refunds directly to orders can repeat order revenue.",
    gold: `SELECT (SELECT SUM(price_usd) FROM orders) - (SELECT SUM(refund_amount_usd) FROM order_item_refunds) AS net_revenue`,
  },
  {
    id: 24,
    category: "refunds",
    question:
      "What was net revenue for each year in which the orders were placed?",
    trap: "Refunds belong to the order's year and must be aggregated first.",
    gold: `WITH refunds AS (
  SELECT order_id, SUM(refund_amount_usd) AS refunded FROM order_item_refunds GROUP BY 1
)
SELECT EXTRACT(YEAR FROM o.created_at)::int AS year,
  SUM(o.price_usd - COALESCE(r.refunded, 0)) AS net_revenue
FROM orders o LEFT JOIN refunds r ON r.order_id = o.order_id GROUP BY 1`,
  },
  {
    id: 25,
    category: "repeat",
    question:
      "Compare the conversion rate of new and repeat sessions across all time.",
    trap: "New vs repeat comes from is_repeat_session.",
    gold: `SELECT s.is_repeat_session, COUNT(o.order_id)::numeric / COUNT(*) AS cvr
FROM website_sessions s LEFT JOIN orders o ON o.website_session_id = s.website_session_id
GROUP BY 1`,
  },
  {
    id: 26,
    category: "repeat",
    question: "What percentage of customers placed more than one order?",
    trap: "The base is customers with an order, not all visitors.",
    gold: `WITH c AS (SELECT user_id, COUNT(*) AS orders FROM orders GROUP BY 1)
SELECT 100.0 * COUNT(*) FILTER (WHERE orders > 1) / COUNT(*) AS pct FROM c`,
  },
  {
    id: 27,
    category: "repeat",
    question:
      "Of the visitors whose first session was between April 2012 and December 2014, what percentage came back within 30 days?",
    trap: "Needs a per-user first visit, then a time-bounded self-reference.",
    gold: `WITH first_visit AS (
  SELECT user_id, MIN(created_at) AS first_ts FROM website_sessions GROUP BY 1
)
SELECT 100.0 * COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM website_sessions s
    WHERE s.user_id = f.user_id AND s.created_at > f.first_ts
      AND s.created_at <= f.first_ts + INTERVAL '30 days'
  )) / COUNT(*) AS return_rate_pct
FROM first_visit f WHERE f.first_ts >= '2012-04-01' AND f.first_ts < '2015-01-01'`,
  },
  {
    id: 28,
    category: "unanswerable",
    question:
      "What is the customer acquisition cost of paid non-brand traffic?",
    trap: "There is no marketing spend in the data.",
    gold: null,
  },
  {
    id: 29,
    category: "unanswerable",
    question: "Which city generates the most revenue?",
    trap: "There is no location in the data.",
    gold: null,
  },
  {
    id: 30,
    category: "unanswerable",
    question: "What is the open rate of our email campaigns?",
    trap: "There is no email data.",
    gold: null,
  },
];
