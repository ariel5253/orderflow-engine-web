# orderflow-engine-web

[English](README.md)

Cliente Angular de Orderflow Engine. Muestra el resumen del pedido que el enunciado ofrece como plus opcional (líneas, descuentos con su origen, obsequios con su cantidad, impuestos y total), dentro del flujo de compra que lo rodea: carrito → cotización → confirmación → pedido → Mis pedidos, contra la API real.

## Alcance

La tarea T-17 del plan de tareas (`spec/TASKS.md` del repositorio `orderflow-engine-docs`) construye este cliente por porciones, después de completar el entregable de la API. Cada porción agrega aquí solo lo que entrega, y una porción que no se integre antes de la entrega queda en "No incluido" del README de la API.

| Parte | Origen | Contrato | Estado |
|-------|--------|----------|--------|
| Resumen del pedido (`/quotes/:quoteId`), sus tres prevenciones de defectos, sus pruebas y su contenedor | El plus opcional del enunciado (SPEC §10) | E-02 | Entregado |
| Carrito (`/cart`, también `/`), confirmación, pedido (`/orders/:orderId`) y selector de tienda | Agregado a propósito, más allá del plus, por decisión del dueño (SPEC §14.3) | E-07, E-01, E-03, E-04 | Entregado |
| Mis pedidos (`/orders`) y la prueba del flujo completo | Agregado a propósito, más allá del plus, por decisión del dueño (SPEC §14.3) | E-05 | Entregado |

Lo que entrega el resumen del pedido:

- Lee E-02 en cada visita y muestra el cuerpo tal como llega: el estado, la hora hasta la que se garantiza el precio, cada línea con su bruto, sus descuentos con su origen, su parte de un combo, su base gravable y su impuesto; las líneas de obsequio con su cantidad; los totales del pedido; y, mientras la cotización está abierta, la posición de crédito con la nota de que es una consulta.
- Su barra de acciones lleva el total, "Modificar carrito" y "Confirmar pedido".
- Una llamada fallida muestra el problema de la API tal como llega, con su código, una referencia a su `correlationId` y exactamente una salida (ver más abajo). "Reintentar" repite la solicitud cuando no hubo respuesta (ninguna respuesta, o un 5xx sin cuerpo de problema) o la API respondió `INTERNAL_ERROR` o `IDEMPOTENCY_KEY_IN_PROGRESS`. Un 4xx sin cuerpo de problema, como la página de un proxy mal enrutado, nunca viene de la API: muestra el texto de falta de respuesta con la salida por defecto de la pantalla en lugar de "Reintentar", porque repetir la solicitud repetiría la respuesta.
- El idioma por defecto es el español; `?lang=en` cambia a inglés. Los dos diccionarios están en `public/i18n`, y cada uno nombra el locale que da formato a montos, números y fechas (`app.formatLocale`: `es-419`, `en`).

Lo que entregan el carrito, la confirmación, el pedido y el selector de tienda:

- Cada pantalla empieza con el encabezado común: la marca, "Comprar", "Mis pedidos" (marcado también mientras uno de los pedidos está abierto), el selector ES/EN, que cambia el idioma en tiempo de ejecución, y el selector de tienda. Este lista las tiendas de `public/config/stores.json` por tenant dentro de un desplegable de divulgación, nunca un select nativo, que cortaría un nombre largo mientras está cerrado. El navegador recuerda la tienda elegida, y elegir una abre su carrito. Al cerrarse, por una elección o con Escape, el selector recupera el foco.
- El carrito lee E-07 en cada visita y lista los productos tal como los envía la API, en orden de SKU, cada uno con su imagen, nombre, SKU, precio de lista antes de impuestos, tasa de impuesto y un selector de cantidad; luego contado o crédito. Su barra de acciones lleva el conteo de unidades y "Cotizar", que está deshabilitado mientras el carrito está vacío y envía E-01 con las líneas mayores que cero. Muestra solo precios de lista y unidades, nunca un subtotal ni un total: el total llega con la cotización. El navegador guarda un carrito por tienda; el servidor no guarda ninguno.
- "Confirmar pedido" crea una `Idempotency-Key` (un UUID) por cotización en su primer toque y la guarda en el almacenamiento del navegador, así que cada reintento de esa cotización envía la misma clave y el mismo cuerpo: tras no haber respuesta, un 5xx, `IDEMPOTENCY_KEY_IN_PROGRESS` o una recarga. Mientras E-03 está en curso, "Confirmar pedido" queda deshabilitado y ni él ni "Reintentar" vuelven a enviar, así que un doble toque envía una sola solicitud, y una cotización nueva recibe una clave nueva. Un 201 vacía el carrito de la tienda y abre el pedido. Una respuesta que llega después de salir del resumen, por ejemplo tras elegir otra tienda, igual registra el pedido y vacía el carrito de la tienda que lo envió, pero no abre nada; lo mismo pasa con una cotización que llega después de elegir otra tienda.
- Una cotización a crédito abierta que el cupo no cubre deshabilita "Confirmar pedido", muestra el faltante y ofrece "Pagar de contado", que cotiza las mismas líneas con `CASH`. Una cotización vencida ofrece "Volver a cotizar", con las mismas líneas y la forma de pago que envió el cliente. Una cotización confirmada ofrece "Ver pedido {number}" cuando el cliente conoce el pedido, y "Ver mis pedidos" en otro caso.
- El pedido (`/orders/:orderId`) lee E-04 en cada visita y muestra su número, su hora de confirmación, su forma de pago y los mismos componentes de desglose que el resumen, con el total, "Ver mis pedidos" y "Seguir comprando" en su barra de acciones. Justo después de E-03 dice "Pedido confirmado", o "Este pedido ya estaba registrado" cuando el 201 fue una repetición (`Idempotent-Replayed: true`).
- Cada problema tiene una salida (SPEC §10.5): "Pagar de contado" para `CREDIT_NOT_ENABLED` en el carrito y para `CREDIT_LIMIT_EXCEEDED` en el resumen, "Volver a cotizar" para `QUOTE_EXPIRED`, "Ver pedido {number}" para `QUOTE_ALREADY_CONFIRMED`, "Reintentar" como arriba y, en cualquier otro caso, "Revisar carrito" en el carrito (el aviso se cierra y el carrito queda como estaba) y "Modificar carrito" en el resumen (el carrito abre con las líneas de la cotización). Una nueva cotización que falla muestra su problema en el carrito. Cualquier otro problema ofrece "Ver mis pedidos" en el pedido e "Ir a comprar" en Mis pedidos.

Lo que entrega Mis pedidos:

- Mis pedidos (`/orders`), que se abre desde la navegación o con "Ver mis pedidos", lee E-05 en cada visita para el cliente de la tienda elegida: `GET /api/v1/orders?customerId=` con el mismo cliente que nombra `X-Customer-Id`, en la página por defecto de la API, de 20. Muestra el cuerpo tal como llega: del más reciente al más antiguo, cada pedido con su número, su hora de confirmación y su total en la `currency` del cuerpo, que llega una sola vez; cada fila abre su pedido. Sin pedidos todavía muestra un estado vacío. Su barra de acciones lleva "Ir a comprar", que abre el carrito.
- Como el cliente no guarda copia de ningún pedido, el número de pedido que acaba de mostrar un 201 aparece primero en Mis pedidos, con el total confirmado, en cuanto la API lo lista (leer lo propio escrito, SPEC AC-52). Un cliente que la API no conoce, como uno de un `public/config/stores.json` desactualizado, recibe el aviso `CUSTOMER_NOT_FOUND` con "Ir a comprar".

Reglas que cumple el cliente:

- El enunciado fija una hora para el plus. Este cliente la supera a propósito. Su tiempo medido, dividido en tres partes, quedará en "No incluido" del README de la API con el pull request 8 de T-17.
- El cliente nunca calcula dinero. Los montos son los textos de la API, formateados con `Intl.NumberFormat` como textos, y nunca se convierten en números de punto flotante.
- La autenticación está fuera de alcance (SPEC A-06). El cliente envía la tienda elegida en el selector de tienda, una de las tiendas de demostración sembradas de `public/config/stores.json` (la primera mientras no se elija otra), en `X-Tenant-Id` y `X-Customer-Id`.
- El cliente no guarda copia de ningún pedido: la pantalla del pedido lee E-04 y Mis pedidos lee E-05 en cada visita. El almacenamiento del navegador guarda los carritos, la tienda elegida y, por cotización, su clave de idempotencia, la forma de pago con la que se cotizó y el número del pedido en que se convirtió; nunca un monto.
- Los nombres de producto y de tienda son datos, en el idioma de las semillas. No se traducen. Las imágenes de producto se buscan por SKU en `public/products`, con una imagen de reemplazo cuando falta una.

## Cómo ejecutarlo

Requisito: Docker. Las pruebas corren en un contenedor, así que el host no necesita Node: la etapa `test` del `Dockerfile` parte de la imagen de Playwright de la versión fijada de `playwright`, que trae Node y Chromium, y luego ejecuta `npm ci` y `npm test`. Una prueba que falla hace fallar el build.

```bash
docker build --target test .   # the literal-text check, then every spec in headless Chromium, in a container
```

Correr las pruebas en el host, o el servidor de desarrollo, necesita Node.js 22.22.3 o posterior en la línea 22, o 24.15 o posterior (Angular 22 lo exige), y Chromium para Playwright, instalado una vez con `npx playwright install chromium`.

```bash
npm ci
npm test     # the same checks and specs, on the host
npm start    # development server on http://localhost:4200, /api/ forwarded to API_UPSTREAM (default http://localhost:8080)
```

Las pruebas no necesitan la API ni la red: cada prueba responde sus solicitudes con un backend HTTP simulado y verifica la solicitud exacta.

El contenedor sirve el cliente con un nginx sin privilegios en el puerto 8080, que reenvía `/api/` a `API_UPSTREAM`, así que el navegador ve un solo origen y la API no necesita CORS. `.env.example` lista cada clave de configuración con un comentario; sin un `.env` se usan los valores por defecto.

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

Luego abra `http://localhost:8081`, el carrito de la primera tienda, y vaya con clics de "Cotizar" a "Confirmar pedido", al pedido con su número y a "Ver mis pedidos", donde ese pedido aparece primero; o abra `http://localhost:8081/quotes/<quoteId>` con el `quoteId` de la respuesta. Agregue `?lang=en`, o use el selector ES/EN, para inglés. El stack completo de `orderflow-engine-infra` levanta la base de datos, la API y este cliente con un solo comando.

## Prevención a nivel de componente

Cada defecto que nombra el enunciado tiene un componente que lo resuelve (SPEC §10.2). Las pantallas nunca imprimen texto, ubican una acción ni dibujan una imagen de producto de otra forma, así que una pantalla nueva hereda la prevención en lugar de resolverla otra vez.

| Defecto | Componente | Regla |
|---------|------------|-------|
| Texto cortado | `ui-text` | Siempre parte el texto (`overflow-wrap: anywhere`, `min-width: 0`), nunca usa puntos suspensivos ni recorte de líneas, y crece en vertical. Un monto va en una columna `auto` de grid o en una caja `flex: none`, así que un nombre largo se parte y el monto nunca se divide |
| Controles tapados por la barra del sistema o el teclado | `ui-action-bar` | Fija abajo, con relleno `env(safe-area-inset-*)` (`viewport-fit=cover`), y elevada sobre el teclado siguiendo `visualViewport`. Cada control que contiene mide al menos 44 × 44 px. La pantalla usa `100dvh` |
| Imágenes de un mismo grid escaladas distinto | `ui-product-image` | Un solo `aspect-ratio` con `object-fit: contain`. Es la única forma de dibujar una imagen de producto, y si falta una imagen se muestra una de reemplazo |

Las pruebas miden el layout real en Chromium sin interfaz (jsdom no tiene motor de layout, así que no puede):

| Prueba | Qué demuestra |
|--------|---------------|
| `order-summary.spec.ts` | Con nombres muy largos, a 768 × 1024 y 375 × 812: sin scroll horizontal, ningún `ui-text` cortado en ningún eje por su propia caja ni por un contenedor que oculte el desborde, sin puntos suspensivos ni recorte de líneas, todo texto visible dentro de un `ui-text`, ningún monto partido en dos líneas, la barra de acciones visible y sin nada encima al fondo del viewport, todas las imágenes de producto del mismo cuadrado, y "Reintentar" de al menos 44 × 44 px (SPEC AC-42 … AC-44) |
| `screen-rules.spec.ts` | El carrito, el pedido, el resumen con un aviso, el selector de tienda abierto y Mis pedidos (con un total de 17 dígitos, y vacío), con nombres de producto y de tienda muy largos en los dos viewports, pasan las mismas verificaciones, y cada control mide al menos 44 × 44 px; la barra de acciones queda por encima de un teclado simulado mientras se escribe una cantidad; el pedido muestra E-04 con los mismos componentes de desglose que el resumen (AC-42 … AC-44) |
| `cart.spec.ts` | Los productos de E-07 tal como llegan, con precios de lista y conteo de unidades y nunca un subtotal ni un total; E-01 lleva solo las líneas mayores que cero, y un 201 abre la cotización; un carrito por tienda, que se conserva al recargar; una cotización que llega después de elegir otra tienda no abre nada; el selector de tienda recupera el foco al cerrarse |
| `confirm-idempotency.spec.ts` | Dos toques en "Confirmar pedido", o en "Reintentar", envían una sola solicitud; sin respuesta, un 5xx, un 502 del proxy, `IDEMPOTENCY_KEY_IN_PROGRESS` y una recarga conservan la misma clave y el mismo cuerpo; una cotización nueva recibe una clave nueva; una repetición muestra "ya estaba registrado"; el carrito de la tienda se vacía tras el 201, también cuando el 201 llega después de elegir otra tienda, y entonces no se abre nada; una cotización confirmada ofrece su pedido, o "Ver mis pedidos" cuando el cliente no lo conoce (AC-49) |
| `credit-shortfall.spec.ts` | Una cotización a crédito que no cabe deshabilita "Confirmar pedido" y muestra el faltante, y "Pagar de contado" envía E-01 con `CASH` y las mismas líneas (AC-50) |
| `problem-actions.spec.ts` | Cada código de §8, y una solicitud sin respuesta, en el carrito, el resumen, el pedido y Mis pedidos muestra el aviso con exactamente su salida, incluida la salida por defecto, y cada salida hace lo que dice SPEC §10.5; un 4xx sin cuerpo de problema en Mis pedidos recibe "Ir a comprar", nunca "Reintentar" (AC-51) |
| `history-read-your-writes.spec.ts` | E-05 se lee en cada visita como `GET /api/v1/orders?customerId=` con el cliente de la tienda elegida, también en los dos encabezados; los pedidos se listan del más reciente al más antiguo tal como llegan, cada uno con su número, su fecha y su total en la `currency` del cuerpo, y cada uno abre su pedido; tras un 201 el número del pedido nuevo aparece primero con el total confirmado; el estado vacío; un cliente desconocido (una lista de tiendas desactualizada) recibe el aviso `CUSTOMER_NOT_FOUND` con "Ir a comprar" (AC-52) |
| `flow.spec.ts` | En `es` y en `en`, con clics: carrito → cotización → confirmación → pedido → Mis pedidos → carrito, verificando cada solicitud (E-07, E-01, E-02, E-03 con su clave, E-04, E-05) con sus encabezados; el pedido nuevo primero en Mis pedidos, con su total y su fecha en el formato del idioma activo; y el carrito vacío tras el 201 (AC-52) |
| `ui-action-bar.spec.ts` | Un teclado simulado de 300 px, entregado por un `visualViewport` inyectado, deja la barra por encima; cada control mide al menos 44 × 44 px a 375 px (AC-43) |
| `ui-product-image.spec.ts` | Imágenes de cuatro proporciones propias distintas se ven como cuadrados idénticos; una imagen que falta muestra la de reemplazo (AC-44) |
| `ui-problem-notice.spec.ts` | El título y el detalle de la API tal como llegan, el código, los primeros 8 caracteres de `correlationId` y su única acción, que todo aviso tiene; sin respuesta muestra `problem.network` (AC-51) |
| `i18n-keys.spec.ts` | `es` y `en` tienen las mismas claves y parámetros, cada uno define `app.formatLocale`, toda clave que usan las plantillas existe (también las que se arman con el estado, el origen del descuento, la forma de pago, el idioma y la salida), y ninguna sobra (AC-46) |
| `money.pipe.spec.ts`, `api-headers.interceptor.spec.ts` | COP con escala 0 y USD con escala 2 en `es-419` y `en`, `"12345678901234567.89"` exacto; toda solicitud a `/api/` lleva la tienda elegida y el idioma activo, y cambiar de tienda cambia los dos encabezados |

`scripts/no-literal-text.mjs` corre primero en `npm test` y lee cada plantilla con el propio analizador de plantillas de Angular: ninguna plantilla tiene texto literal ni un atributo de texto estático, y un texto entre comillas en una interpolación o un enlace solo se permite como clave de `translate` o como argumento de un pipe, así que cada palabra en pantalla sale de un diccionario o de la API.

## Documentación

- Especificación: `spec/SPEC.md` del repositorio `orderflow-engine-docs` (§10 el front, §14.3 la extensión; en inglés)
- Arquitectura, con el proxy de un solo origen: `spec/architecture.md` §1.1 y §3.5 del repositorio `orderflow-engine-docs` (en inglés)
- Mapa de documentos: `README.es.md` del repositorio `orderflow-engine-docs`
