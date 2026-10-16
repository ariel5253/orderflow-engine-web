# orderflow-engine-web

[English](README.md)

Cliente Angular de Orderflow Engine. Muestra el resumen del pedido que el enunciado ofrece como plus opcional (líneas, descuentos con su origen, obsequios con su cantidad, impuestos y total), dentro del flujo de compra que lo rodea: carrito → cotización → confirmación → pedido → Mis pedidos, contra la API real.

## Alcance

Planeado: todavía no hay nada construido. La tarea T-17 del plan de tareas (`spec/TASKS.md` del repositorio `orderflow-engine-docs`) lo construye por porciones, solo después de completar el entregable de la API. Cada porción agrega aquí solo lo que entrega, y una porción que no se integre antes de la entrega queda en "No incluido" del README de la API. Las reglas de abajo son el diseño que T-17 construye y prueba.

| Parte | Origen | Contrato |
|-------|--------|----------|
| Resumen del pedido (`/quotes/:quoteId`) y sus tres prevenciones de defectos | El plus opcional del enunciado (SPEC §10) | E-02 |
| Carrito (`/cart`), confirmación, pedido (`/orders/:orderId`), Mis pedidos (`/orders`) y selector de tienda | Agregado a propósito, más allá del plus, por decisión del dueño (SPEC §14.3) | E-07, E-01, E-03, E-04, E-05 |

- El enunciado fija una hora para el plus. Este cliente la supera a propósito. Su tiempo medido, dividido en tres partes, quedará en "No incluido" del README de la API con el pull request 8 de T-17.
- El cliente nunca calcula dinero. Los montos son los textos de la API, formateados con `Intl.NumberFormat`, y nunca se convierten en números de punto flotante.
- La autenticación está fuera de alcance (SPEC A-06). El selector de tienda la reemplaza: lista las tiendas de demostración sembradas en `public/config/stores.json` y envía el tenant y el cliente elegidos en `X-Tenant-Id` y `X-Customer-Id`.
- Los nombres de producto y de tienda son datos, en el idioma de las semillas. No se traducen.

## Cómo ejecutarlo

Todavía no hay nada que ejecutar. Cuando T-17 entregue el cliente:

- `docker compose up --build` en este repositorio lo sirve con nginx, que reenvía `/api/` a la API, así que el navegador ve un solo origen y la API no necesita CORS. `.env.example` lista cada clave de configuración con un comentario.
- El stack completo de `orderflow-engine-infra` levanta la base de datos, la API y este cliente con un solo comando.
- `npm test` ejecuta las pruebas en Chromium sin interfaz contra un backend HTTP simulado, así que no necesitan la API ni la red.

## Prevención a nivel de componente

Cada defecto que nombra el enunciado tiene un componente que lo resuelve (SPEC §10.2). Las pantallas nunca imprimen texto, ubican una acción ni dibujan una imagen de producto de otra forma, así que una pantalla nueva hereda la prevención en lugar de resolverla otra vez.

| Defecto | Componente | Regla |
|---------|------------|-------|
| Texto cortado | `ui-text` | Siempre parte el texto (`overflow-wrap: anywhere`, `min-width: 0`), nunca usa puntos suspensivos ni recorte de líneas, y crece en vertical. Un monto junto a texto que se parte nunca se divide |
| Controles tapados por la barra del sistema o el teclado | `ui-action-bar` | Fija abajo, con relleno `env(safe-area-inset-bottom)` (`viewport-fit=cover`), y elevada sobre el teclado siguiendo `visualViewport`. El contenedor usa `100dvh` |
| Imágenes de un mismo grid escaladas distinto | `ui-product-image` | Un solo `aspect-ratio` con `object-fit: contain`. Es la única forma de dibujar una imagen de producto, y si falta una imagen se muestra una de reemplazo |

Las pruebas de componentes de T-17 verificarán las tres reglas con nombres muy largos a 768 px y 375 px de ancho (SPEC AC-42 … AC-44).

## Documentación

- Especificación: `spec/SPEC.md` del repositorio `orderflow-engine-docs` (§10 el front, §14.3 la extensión; en inglés)
- Arquitectura, con el proxy de un solo origen: `spec/architecture.md` §1.1 y §3.5 del repositorio `orderflow-engine-docs` (en inglés)
- Mapa de documentos: `README.es.md` del repositorio `orderflow-engine-docs`
