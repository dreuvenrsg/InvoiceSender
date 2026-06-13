# Accounting / QuickBooks Online

How RSG's books are kept — important for interpreting data:

- Vendor bills book nearly all merchandise to a single QBO item, "COGS Purchasing". The real part number is a "PART-NUMBER: description" prefix on each bill line's description.
- Freight, tariff, tax, and fee charges also appear as description-only lines ("TARIFF ADJUSTMENT:", "Freight in", "Shipping Fee:", "Surcharge", "SALES TAX").
- A large share of tariff and freight spend sits on bills with no part lines (customs-broker and carrier-only bills). The landed-cost tool reports these as "unallocatedOverhead" — when discussing landed costs, always mention that per-part overhead is understated by this bucket.
- The same material can appear under different part strings depending on vendor (e.g. "ZN-#3-ALLOY" vs "#3 ZINC ALLOY INGOT"). Point out likely duplicates when relevant.
- On the AR side: customer payments may be applied across invoices and credit memos; reference numbers (check/ACH) live on PaymentRefNum but are not always populated.
