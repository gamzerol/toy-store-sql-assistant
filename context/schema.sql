CREATE TABLE toystore.products (
    product_id    INT PRIMARY KEY,
    created_at    TIMESTAMP NOT NULL,
    product_name  TEXT NOT NULL
);

CREATE TABLE toystore.website_sessions (
    website_session_id  BIGINT PRIMARY KEY,
    created_at          TIMESTAMP NOT NULL,
    user_id             BIGINT NOT NULL,
    is_repeat_session   SMALLINT NOT NULL,
    utm_source          TEXT,
    utm_campaign        TEXT,
    utm_content         TEXT,
    device_type         TEXT,
    http_referer        TEXT
);

CREATE TABLE toystore.website_pageviews (
    website_pageview_id BIGINT PRIMARY KEY,
    created_at          TIMESTAMP NOT NULL,
    website_session_id  BIGINT NOT NULL REFERENCES toystore.website_sessions,
    pageview_url        TEXT NOT NULL
);

CREATE TABLE toystore.orders (
    order_id            BIGINT PRIMARY KEY,
    created_at          TIMESTAMP NOT NULL,
    website_session_id  BIGINT NOT NULL REFERENCES toystore.website_sessions,
    user_id             BIGINT NOT NULL,
    primary_product_id  INT NOT NULL REFERENCES toystore.products,
    items_purchased     SMALLINT NOT NULL,
    price_usd           NUMERIC(10,2) NOT NULL,
    cogs_usd            NUMERIC(10,2) NOT NULL
);

CREATE TABLE toystore.order_items (
    order_item_id   BIGINT PRIMARY KEY,
    created_at      TIMESTAMP NOT NULL,
    order_id        BIGINT NOT NULL REFERENCES toystore.orders,
    product_id      INT NOT NULL REFERENCES toystore.products,
    is_primary_item SMALLINT NOT NULL,
    price_usd       NUMERIC(10,2) NOT NULL,
    cogs_usd        NUMERIC(10,2) NOT NULL
);

CREATE TABLE toystore.order_item_refunds (
    order_item_refund_id BIGINT PRIMARY KEY,
    created_at           TIMESTAMP NOT NULL,
    order_item_id        BIGINT NOT NULL REFERENCES toystore.order_items,
    order_id             BIGINT NOT NULL REFERENCES toystore.orders,
    refund_amount_usd    NUMERIC(10,2) NOT NULL
);
