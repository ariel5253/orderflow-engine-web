# orderflow-engine-web

[Español](README.es.md)

Angular client of Orderflow Engine. It shows the order summary the assignment offers as an optional plus (lines, discounts with their origin, gifts with their quantity, taxes and total), inside the ordering flow around it: cart → quote → confirmation → order → My orders, over the real API.

## Scope

Planned: nothing is built yet. Task T-17 of the task plan (`spec/TASKS.md` in the `orderflow-engine-docs` repository) builds it in slices, only after the API deliverable is complete. Each slice adds here only what it delivers, and a slice not merged at delivery is listed under "Not included" in the API README. The rules below are the design that T-17 builds and tests.

| Part | Origin | Contract |
|------|--------|----------|
| Order summary (`/quotes/:quoteId`) and its three defect preventions | The assignment's optional plus (SPEC §10) | E-02 |
| Cart (`/cart`), confirmation, order (`/orders/:orderId`), My orders (`/orders`) and the store picker | Added on purpose beyond the plus, by the owner's decision (SPEC §14.3) | E-07, E-01, E-03, E-04, E-05 |

- The assignment sets one hour for the plus. This client exceeds it on purpose. Its measured time, split into three parts, will be recorded in the API README under "Not included" by T-17 pull request 8.
- The client never computes money. Amounts are the API's strings, formatted with `Intl.NumberFormat`, and never become floating-point numbers.
- Authentication is out of scope (SPEC A-06). The store picker stands in for it: it lists the seeded demo stores of `public/config/stores.json` and sends the chosen tenant and customer in `X-Tenant-Id` and `X-Customer-Id`.
- Product and store names are data, in the language of the seeds. They are not translated.

## How to run

Nothing runs yet. When T-17 delivers the client:

- `docker compose up --build` in this repository serves it with nginx, which forwards `/api/` to the API, so the browser sees one origin and the API needs no CORS. `.env.example` lists each configuration key with a comment.
- The full stack of `orderflow-engine-infra` starts the database, the API and this client with one command.
- `npm test` runs the specs in headless Chromium against a simulated HTTP backend, so they need neither the API nor a network.

## Prevention at component level

Each defect the assignment names has one component that owns it (SPEC §10.2). Screens never print text, hold an action or draw a product image another way, so a new screen inherits the prevention instead of solving it again.

| Defect | Component | Rule |
|--------|-----------|------|
| Truncated text | `ui-text` | It always wraps (`overflow-wrap: anywhere`, `min-width: 0`), never uses ellipsis or a line clamp, and grows vertically. An amount next to wrapping text never splits |
| Controls hidden by the system bar or the keyboard | `ui-action-bar` | Sticky to the bottom, padded with `env(safe-area-inset-bottom)` (`viewport-fit=cover`), and lifted above the keyboard by following `visualViewport`. The shell uses `100dvh` |
| Grid images scaled inconsistently | `ui-product-image` | One `aspect-ratio` with `object-fit: contain`. It is the only way to draw a product image, and a missing image falls back to a placeholder |

T-17's component tests will check the three rules with very long names at 768 px and 375 px wide (SPEC AC-42 … AC-44).

## Documentation

- Specification: `spec/SPEC.md` in the `orderflow-engine-docs` repository (§10 the front, §14.3 the extension)
- Architecture, including the one-origin proxy: `spec/architecture.md` §1.1 and §3.5 in the `orderflow-engine-docs` repository
- Document map: `README.md` in the `orderflow-engine-docs` repository
