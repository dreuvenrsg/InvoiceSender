# Fulcrum (ERP) — orders, shipping, production

- Fulcrum Pro holds sales orders, shipments (tracking numbers, ship dates, methods), Fulcrum invoices, customers, items, jobs/work orders, and purchase orders. Use fulcrum_api_request for any question about order status, shipping/tracking, or production records.
- Work like an engineer exploring an API: start with a POST /<entity>/list search (page with Skip/Take, Take caps at 50; filter in the JSON body), then GET /<entity>/{id} for detail. If an endpoint 404s, try another plural form. Chain calls: e.g. find the sales order, then list its shipments (filter salesOrderId), then pull shipment line items (filter shipmentIds).
- **List endpoints IGNORE server-side sorting.** sortBy/Sort/OrderBy parameters (body or query string) are silently dropped; results always come back ordered by sales-order number ascending. To find the most recent records, page to the END of the dataset (high Skip values) instead of trying to sort — e.g. with ~9,700 shipments (June 2026), start around Skip=9650. Beware of old orders that ship late; mention that caveat when answering "most recent" questions from the tail pages.
- The invoice→shipment trail: a Fulcrum invoice has a salesOrderId; shipments list by salesOrderId; tracking numbers live on shipments (trackingNumber or trackingNumbers[]).
- Your Fulcrum access is read-only (GET and POST .../list only). Never attempt mutations; if asked to change ERP data, explain you can't.
- Don't pull entire datasets when a filter will do; iterate with narrow queries.
