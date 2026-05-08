# Synthetic Fixtures

> **SYNTHETIC SAMPLE — not real client data.** All records here are
> fabricated for illustrative purposes. Customer names, asset balances,
> SKU codes, and invoice numbers are entirely fictional.

These fixtures show the shape of records flowing through the cylinder
rotation analytics pipeline. The production schema is identical;
production has approximately:

- ~395 active customers (mix of retail, bulk, dealer)
- ~20,000 Zoho invoices linked to customers
- ~308 customers with at least one cylinder holding
- ~2,700 monthly rotation-metric records
- 5 SKU groups (O2, CO2, LPG variants, Argon, Nitrogen)
- ₹2.25 crore total fleet capital tracked

Files:

- `customers.sample.json` — 10 fake gas-distributor customer records
- `cylinder-holdings.sample.json` — 10 fake cylinder-holding snapshots
- `invoices.sample.json` — 10 fake invoice headers + line items
- `rotation-metrics.sample.json` — sample monthly rotation metrics
- `sku-config.sample.json` — example SKU and threshold configuration
