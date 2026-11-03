# Business rules

## Dates
- Data runs from 2012-03-19 to 2015-03-19, so March 2012 and March 2015 are partial months.
- For monthly or quarterly trends, use full periods only: `created_at >= '2012-04-01' AND created_at < '2015-03-01'`. Quarterly trends stop at 2014-12-31.
- Do not apply this window to all-time totals unless the question asks for it.

## Metrics
- Sessions: distinct `website_session_id`. A session is a visit, not a person.
- Session-to-order CVR (conversion rate): orders / sessions. Start from `website_sessions` and LEFT JOIN `orders`, otherwise sessions without an order are lost.
- Gross revenue: sum of `orders.price_usd`.
- Net revenue: gross revenue minus `order_item_refunds.refund_amount_usd`. Aggregate refunds first, because joining them directly to orders can repeat order rows.
- AOV: gross revenue / orders.
- Revenue per session (RPS): gross revenue / sessions.
- Gross margin: (price_usd - cogs_usd) / price_usd, calculated from summed values.
- Items per order: average of `orders.items_purchased`.
- Refund rate: refunded items / items sold, from `order_items` LEFT JOIN `order_item_refunds`.
- Bounce rate: sessions with exactly one pageview / sessions.
- Repeat session rate: sessions with `is_repeat_session = 1` / sessions. This is not customer retention.

## Channels
Group sessions with this CASE expression, in this order:

```sql
CASE
  WHEN utm_source IS NULL AND http_referer IS NULL THEN 'direct'
  WHEN utm_source IS NULL THEN 'organic_search'
  WHEN utm_source = 'socialbook' THEN 'paid_social'
  WHEN utm_campaign = 'brand' THEN 'paid_brand'
  WHEN utm_campaign = 'nonbrand' THEN 'paid_nonbrand'
  ELSE 'other'
END
```

## Product and order level
- Use `order_items` for revenue or margin by product. `orders.primary_product_id` ignores cross-sell items.
- A cross-sell item has `is_primary_item = 0`.
- `order_items.created_at` is the date of sale. `order_item_refunds.created_at` is the date of refund.

## Funnel pages
Funnel order: landing page, `/products`, product page, `/cart`, `/shipping`, billing, `/thank-you-for-your-order`.
- Product pages: `/the-original-mr-fuzzy`, `/the-forever-love-bear`, `/the-birthday-sugar-panda`, `/the-hudson-river-mini-bear`.
- Billing pages: `/billing` and `/billing-2`.
- Landing page: the URL of the session's lowest `website_pageview_id`.
- A funnel step means the session viewed that page at any time.

## Experiments
- Compare page versions only while both were live. The billing test window runs from the first `/billing-2` pageview to the last `/billing` pageview.

## Not in the data
There is no marketing spend, customer location or demographics, email data, or product stock. CAC and ROI cannot be calculated.
