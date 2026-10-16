# orderflow-engine-web

[Español](README.es.md)

Angular client of Orderflow Engine. It shows the order summary the assignment offers as an optional plus (lines, discounts with their origin, gifts with their quantity, taxes and total), inside the ordering flow around it: cart → quote → confirmation → order → My orders, over the real API.

## Scope

Task T-17 of the task plan (`spec/TASKS.md` in the `orderflow-engine-docs` repository) builds this client in slices, after the API deliverable is complete. Each slice adds here only what it delivers, and a slice not merged at delivery is listed under "Not included" in the API README.

| Part | Origin | Contract | State |
|------|--------|----------|-------|
| Order summary (`/quotes/:quoteId`), its three defect preventions, its tests and its container | The assignment's optional plus (SPEC §10) | E-02 | Delivered |
| Cart (`/cart`, also `/`), confirmation, order (`/orders/:orderId`) and the store picker | Added on purpose beyond the plus, by the owner's decision (SPEC §14.3) | E-07, E-01, E-03, E-04 | Delivered |
| My orders (`/orders`) and the full-flow spec | Added on purpose beyond the plus, by the owner's decision (SPEC §14.3) | E-05 | Delivered |

What the order summary delivers:

- It reads E-02 on every visit and shows the body as it arrives: the status, the time until which the price is held, each line with its gross, its discounts with their origin, its share of a combo, its taxable base and its tax; gift lines with their quantity; the order totals; and, while the quote is open, the credit position with the advisory note.
- Its action bar holds the total, "Edit cart" and "Confirm order".
- A failed call shows the API's problem as sent, with its code, a reference to its `correlationId` and exactly one way out (see below). "Retry" repeats the request when there was no answer (no response, or a 5xx without a problem body) or the API answered `INTERNAL_ERROR` or `IDEMPOTENCY_KEY_IN_PROGRESS`. A 4xx without a problem body, such as the page of a misrouted proxy, never comes from the API: it shows the no-answer text with the screen's default way out instead of "Retry", since repeating the request would repeat the answer.
- Spanish is the default language; `?lang=en` switches to English. Both dictionaries are in `public/i18n`, and each names the locale that formats money, numbers and dates (`app.formatLocale`: `es-419`, `en`).

What the cart, the confirmation, the order and the store picker deliver:

- Every screen starts with the shell: the brand, "Shop", "My orders" (also marked while one of the orders is open), the ES/EN switch, which changes the language at run time, and the store picker. The picker lists the stores of `public/config/stores.json` by tenant behind a disclosure, never a native select, which would cut a long name while closed. The browser remembers the chosen store, and choosing one opens its cart. Closing the picker, by a choice or by Escape, gives the focus back to it.
- The cart reads E-07 on every visit and lists the products as the API sends them, in SKU order, each with its image, name, SKU, list price before taxes, tax rate and a quantity stepper; then cash or credit. Its action bar holds the unit count and "Get quote", which is disabled while the cart is empty and sends E-01 with the lines above zero. It shows list prices and units only, never a subtotal or a total: the total comes with the quote. The browser keeps one cart per store; the server keeps none.
- "Confirm order" creates one `Idempotency-Key` (a UUID) per quote at its first tap and keeps it in browser storage, so every retry of that quote sends the same key and the same body: after no answer, a 5xx, `IDEMPOTENCY_KEY_IN_PROGRESS` or a reload. While E-03 is in flight, "Confirm order" is disabled and neither it nor "Retry" sends again, so a double tap sends one request, and a new quote gets a new key. A 201 empties the store's cart and opens the order. An answer that comes after the summary was left, for example after another store was chosen, still records the order and empties the cart of the store that sent it, but opens nothing; so does a quote that comes after another store was chosen.
- An open credit quote that the credit does not cover disables "Confirm order", shows the shortfall and offers "Pay cash", which quotes the same lines with `CASH`. An expired quote offers "Quote again", with the same lines and the payment method the client sent. A confirmed quote offers "View order {number}" when the client knows the order, and "View my orders" otherwise.
- The order (`/orders/:orderId`) reads E-04 on every visit and shows its number, its confirmation time, its payment method and the same breakdown components as the summary, with the total, "View my orders" and "Keep shopping" in its action bar. Right after E-03 it says "Order confirmed", or "This order was already recorded" when the 201 was a replay (`Idempotent-Replayed: true`).
- Every problem has one way out (SPEC §10.5): "Pay cash" for `CREDIT_NOT_ENABLED` on the cart and for `CREDIT_LIMIT_EXCEEDED` on the summary, "Quote again" for `QUOTE_EXPIRED`, "View order {number}" for `QUOTE_ALREADY_CONFIRMED`, "Retry" as above, and otherwise "Review cart" on the cart (the notice closes and the cart stays as it was) and "Edit cart" on the summary (the cart opens with the quote's lines). A re-quote that fails shows its problem on the cart. Any other problem offers "View my orders" on the order and "Go shopping" on My orders.

What My orders delivers:

- My orders (`/orders`), opened from the navigation or by "View my orders", reads E-05 on every visit for the customer of the selected store: `GET /api/v1/orders?customerId=` with the customer that `X-Customer-Id` also names, in the API's default page of 20. It shows the body as it arrives: newest first, each order with its number, its confirmation time and its total in the body's `currency`, given once; each row opens its order. With no order yet it shows an empty state. Its action bar holds "Go shopping", which opens the cart.
- Since the client keeps no copy of an order, the order number a 201 has just shown comes first in My orders, with the confirmed total, as soon as the API lists it (read-your-writes, SPEC AC-52). A customer the API does not know, such as one of a stale `public/config/stores.json`, gets the `CUSTOMER_NOT_FOUND` notice with "Go shopping".

Rules the client keeps:

- The assignment sets one hour for the plus. This client exceeds it on purpose. Its measured time, split into three parts, will be recorded in the API README under "Not included" by T-17 pull request 8.
- The client never computes money. Amounts are the API's strings, formatted with `Intl.NumberFormat` as strings, and never become floating-point numbers.
- Authentication is out of scope (SPEC A-06). The client sends the store chosen in the store picker, one of the seeded demo stores of `public/config/stores.json` (the first until another is chosen), in `X-Tenant-Id` and `X-Customer-Id`.
- The client keeps no copy of an order: the order screen reads E-04 and My orders reads E-05 on every visit. Browser storage holds the carts, the chosen store and, per quote, its idempotency key, the payment method it was quoted with and the number of the order it became; never an amount.
- Product and store names are data, in the language of the seeds. They are not translated. Product images are looked up by SKU in `public/products`, with a placeholder when one is missing.

## How to run

Prerequisite: Docker. The specs run in a container, so the host needs no Node: the `test` stage of the `Dockerfile` starts from the Playwright image of the pinned `playwright` version, which holds Node and Chromium, then runs `npm ci` and `npm test`. A failing spec fails the build.

```bash
docker build --target test .   # the literal-text check, then every spec in headless Chromium, in a container
```

Running the specs on the host instead, or the development server, needs Node.js 22.22.3 or later in the 22 line, or 24.15 or later (Angular 22 requires it), and Chromium for Playwright, installed once with `npx playwright install chromium`.

```bash
npm ci
npm test     # the same checks and specs, on the host
npm start    # development server on http://localhost:4200, /api/ forwarded to API_UPSTREAM (default http://localhost:8080)
```

The specs need neither the API nor a network: every spec answers its requests through a simulated HTTP backend and asserts the exact request.

The container serves the client with an unprivileged nginx on port 8080, which forwards `/api/` to `API_UPSTREAM`, so the browser sees one origin and the API needs no CORS. `.env.example` lists each configuration key with a comment; without a `.env` the defaults apply.

```bash
# 1. In orderflow-engine-api: the API and its database, on port 8080 of the host
docker compose up --build -d

# 2. Here: the client on http://localhost:8081, forwarding /api/ to the API on the host
docker compose up --build -d

# 3. A quote through the client's own origin, as the first store of public/config/stores.json
curl -s -X POST http://localhost:8081/api/v1/quotes \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Id: co-alpha' \
  -H 'X-Customer-Id: 01a13cdb-cc00-7001-8001-000000000001' \
  -d '{"paymentMethod":"CREDIT","lines":[{"sku":"BEV-COLA-350","qty":40},{"sku":"SNK-CHIPS-45","qty":10}]}'
```

Then open `http://localhost:8081`, the cart of the first store, and go by clicks from "Get quote" to "Confirm order", the order with its number and "View my orders", where that order comes first; or open `http://localhost:8081/quotes/<quoteId>` with the `quoteId` of the answer. Add `?lang=en`, or use the ES/EN switch, for English. The full stack of `orderflow-engine-infra` starts the database, the API and this client with one command.

## Prevention at component level

Each defect the assignment names has one component that owns it (SPEC §10.2). Screens never print text, hold an action or draw a product image another way, so a new screen inherits the prevention instead of solving it again.

| Defect | Component | Rule |
|--------|-----------|------|
| Truncated text | `ui-text` | It always wraps (`overflow-wrap: anywhere`, `min-width: 0`), never uses ellipsis or a line clamp, and grows vertically. An amount sits in a grid `auto` column or a `flex: none` box, so a long name wraps and the amount never splits |
| Controls hidden by the system bar or the keyboard | `ui-action-bar` | Sticky to the bottom, padded with `env(safe-area-inset-*)` (`viewport-fit=cover`), and lifted above the keyboard by following `visualViewport`. Every control it holds is at least 44 × 44 px. The screen uses `100dvh` |
| Grid images scaled inconsistently | `ui-product-image` | One `aspect-ratio` with `object-fit: contain`. It is the only way to draw a product image, and a missing image falls back to a placeholder |

The specs measure the real layout in headless Chromium (jsdom has no layout engine, so it cannot):

| Spec | What it proves |
|------|----------------|
| `order-summary.spec.ts` | With very long names, at 768 × 1024 and 375 × 812: no horizontal scroll, no `ui-text` cut on either axis by its own box or by a wrapper that hides overflow, no ellipsis or line clamp, every visible text inside a `ui-text`, no amount split across lines, the action bar visible and uncovered at the bottom of the viewport, every product image the same square, and "Retry" at least 44 × 44 px (SPEC AC-42 … AC-44) |
| `screen-rules.spec.ts` | The cart, the order, the summary with a notice, the open store picker and My orders (with a 17-digit total, and empty), with very long product and store names at both viewports, pass the same checks, and every control is at least 44 × 44 px; the action bar stays above a simulated keyboard while a quantity is typed; the order renders E-04 through the same breakdown components as the summary (AC-42 … AC-44) |
| `cart.spec.ts` | The E-07 products as sent, with list prices and unit counts and never a subtotal or a total; E-01 carries only the lines above zero, and a 201 opens the quote; one cart per store, kept across a reload; a quote that comes after another store was chosen opens nothing; the store picker gives the focus back when it closes |
| `confirm-idempotency.spec.ts` | Two taps on "Confirm order", or on "Retry", send one request; no answer, a 5xx, a proxy 502, `IDEMPOTENCY_KEY_IN_PROGRESS` and a reload keep the same key and body; a new quote gets a new key; a replay shows "already recorded"; the store's cart is emptied after the 201, also when the 201 comes after another store was chosen, and then nothing opens; a confirmed quote offers its order, or "View my orders" when the client does not know it (AC-49) |
| `credit-shortfall.spec.ts` | A credit quote that does not fit disables "Confirm order" and shows the shortfall, and "Pay cash" sends E-01 with `CASH` and the same lines (AC-50) |
| `problem-actions.spec.ts` | Every §8 code, and a request with no answer, on the cart, the summary, the order and My orders shows the notice with exactly its way out, default included, and each way out does what SPEC §10.5 says; a 4xx without a problem body on My orders gets "Go shopping", never "Retry" (AC-51) |
| `history-read-your-writes.spec.ts` | E-05 is read on every visit as `GET /api/v1/orders?customerId=` with the selected store's customer, also in both headers; the orders are listed newest first as sent, each with its number, its date and its total in the body's `currency`, and each opens its order; after a 201 the new order number comes first with the confirmed total; the empty state; an unknown customer (a stale store list) gets the `CUSTOMER_NOT_FOUND` notice with "Go shopping" (AC-52) |
| `flow.spec.ts` | In `es` and in `en`, by clicks: cart → quote → confirmation → order → My orders → cart, asserting each request (E-07, E-01, E-02, E-03 with its key, E-04, E-05) with its headers; the new order first in My orders, with its total and its date in the format of the active language; and the cart emptied after the 201 (AC-52) |
| `ui-action-bar.spec.ts` | A simulated 300 px keyboard, fed through an injected `visualViewport`, keeps the bar above it; every control is at least 44 × 44 px at 375 px (AC-43) |
| `ui-product-image.spec.ts` | Images of four different intrinsic ratios render as identical squares; a missing image falls back to the placeholder (AC-44) |
| `ui-problem-notice.spec.ts` | The API's title and detail as sent, the code, the first 8 characters of `correlationId` and its one action, which every notice has; no answer shows `problem.network` (AC-51) |
| `i18n-keys.spec.ts` | `es` and `en` have the same keys and parameters, each sets `app.formatLocale`, every key the templates use exists (also the keys built from the status, the discount origin, the payment method, the language and the way out), and no key is unused (AC-46) |
| `money.pipe.spec.ts`, `api-headers.interceptor.spec.ts` | COP at scale 0 and USD at scale 2 in `es-419` and `en`, `"12345678901234567.89"` exactly; every `/api/` request carries the selected store and the active language, and switching the store changes both headers |

`scripts/no-literal-text.mjs` runs first in `npm test` and reads each template with Angular's own template parser: no template holds literal text or a static text attribute, and a quoted string in an interpolation or a binding is allowed only as a `translate` key or a pipe argument, so every word on screen comes from a dictionary or from the API.

## Documentation

- Specification: `spec/SPEC.md` in the `orderflow-engine-docs` repository (§10 the front, §14.3 the extension)
- Architecture, including the one-origin proxy: `spec/architecture.md` §1.1 and §3.5 in the `orderflow-engine-docs` repository
- Document map: `README.md` in the `orderflow-engine-docs` repository
