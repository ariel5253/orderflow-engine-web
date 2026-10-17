# orderflow-engine-web

[Español](README.es.md)

Angular client of Orderflow Engine. It shows the order summary the assignment offers as an optional plus (lines, discounts with their origin, gifts with their quantity, taxes and total), inside the ordering flow around it: cart → quote → confirmation → order → My orders, over the real API.

## Scope

Task T-17 of the task plan (`spec/TASKS.md` in the `orderflow-engine-docs` repository) builds this client in slices, after the API deliverable is complete. Each slice adds here only what it delivers, and a slice not merged at delivery is listed under "Not included" in the API README.

| Part | Origin | Contract | State |
|------|--------|----------|-------|
| Order summary (`/quotes/:quoteId`), its three defect preventions, its tests and its container | The assignment's optional plus (SPEC §10) | E-02 | Delivered |
| Cart (`/cart`), confirmation, order (`/orders/:orderId`), My orders (`/orders`) and the store picker | Added on purpose beyond the plus, by the owner's decision (SPEC §14.3) | E-07, E-01, E-03, E-04, E-05 | Planned |

What the order summary delivers:

- It reads E-02 on every visit and shows the body as it arrives: the status, the time until which the price is held, each line with its gross, its discounts with their origin, its share of a combo, its taxable base and its tax; gift lines with their quantity; the order totals; and, while the quote is open, the credit position with the advisory note.
- Its action bar holds the total. "Confirm order" and "Edit cart" join with the cart and the confirmation.
- A failed call shows the API's problem as sent, with its code and a reference to its `correlationId`. "Retry" repeats the request when there was no answer (no response, or a 5xx without a problem body) or the API answered `INTERNAL_ERROR` or `IDEMPOTENCY_KEY_IN_PROGRESS`; the other ways out join with the screens they open. A 4xx without a problem body, such as the page of a misrouted proxy, never comes from the API: it shows the no-answer text without "Retry", since repeating the request would repeat the answer.
- Spanish is the default language; `?lang=en` switches to English. Both dictionaries are in `public/i18n`, and each names the locale that formats money, numbers and dates (`app.formatLocale`: `es-419`, `en`).

Rules the client keeps:

- The assignment sets one hour for the plus. This client exceeds it on purpose. Its measured time, split into three parts, will be recorded in the API README under "Not included" by T-17 pull request 8.
- The client never computes money. Amounts are the API's strings, formatted with `Intl.NumberFormat` as strings, and never become floating-point numbers.
- Authentication is out of scope (SPEC A-06). The client sends the first store of `public/config/stores.json`, a seeded demo store, in `X-Tenant-Id` and `X-Customer-Id`; the store picker joins with the cart.
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

Then open `http://localhost:8081/quotes/<quoteId>` with the `quoteId` of the answer, or add `?lang=en`. Planned: the full stack of `orderflow-engine-infra` will start the database, the API and this client with one command.

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
| `ui-action-bar.spec.ts` | A simulated 300 px keyboard, fed through an injected `visualViewport`, keeps the bar above it; every control is at least 44 × 44 px at 375 px (AC-43) |
| `ui-product-image.spec.ts` | Images of four different intrinsic ratios render as identical squares; a missing image falls back to the placeholder (AC-44) |
| `ui-problem-notice.spec.ts` | The API's title and detail as sent, the code, the first 8 characters of `correlationId` and the action given; no answer shows `problem.network` (AC-51) |
| `i18n-keys.spec.ts` | `es` and `en` have the same keys and parameters, each sets `app.formatLocale`, every key the templates use exists (also the keys built from the status and the discount origin), and no key is unused (AC-46) |
| `money.pipe.spec.ts`, `api-headers.interceptor.spec.ts` | COP at scale 0 and USD at scale 2 in `es-419` and `en`, `"12345678901234567.89"` exactly; every `/api/` request carries the store and the active language |

`scripts/no-literal-text.mjs` runs first in `npm test` and reads each template with Angular's own template parser: no template holds literal text or a static text attribute, and a quoted string in an interpolation or a binding is allowed only as a `translate` key or a pipe argument, so every word on screen comes from a dictionary or from the API.

## Documentation

- Specification: `spec/SPEC.md` in the `orderflow-engine-docs` repository (§10 the front, §14.3 the extension)
- Architecture, including the one-origin proxy: `spec/architecture.md` §1.1 and §3.5 in the `orderflow-engine-docs` repository
- Document map: `README.md` in the `orderflow-engine-docs` repository
