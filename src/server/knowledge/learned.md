# Learned notes (agent-written)

Durable operational facts the RSG AI agent discovered while working, saved via
the save_operational_note tool. Loaded into the agent's system prompt on every
turn. Review via git diff; promote stable entries into the curated knowledge
files (accounting.md, fulcrum.md) and prune anything wrong or stale.

- [2026-06-12] (fulcrum) POST /sales-orders/list silently ignores a customerId filter in the JSON body — it returns orders across ALL customers (verified live: filtering by one customerId returned ADI/Wesco/Siemens orders). To get one customer's orders use POST /reporting/sales-order-lines/list with customerId (this one DOES filter, but can 403 if the API key lacks broad Sales/Reporting view permissions). [Recovered from prod logs 2026-06-12 — the agent's original save failed before notes were persisted.]
