Hi Owner,

Thanks for the detailed walkthrough today. Great to do a deep dive on your operations. Here's a list of the reports that we'd be curating:

Reports List:

Dashboard Overview (KPIs, alerts, performance distribution, monthly trends)
Performance-based reports for Customers categorized by Cylinder rotation rate into: (a) Critical (<2 rotation rate); (b) Medium Performers ( 2 - 4 rotation rate); (c) High Performers (>4-5 rotation rate);
SKU/Product-Wise Rotation (compare CO2 vs O2 vs LPG trends); (We can merge 2 & 3 into a single view also if you'd prefer that)
Detailed Customer-SKU Sales Report (what each customer buys, rotation per SKU, billing value);  
Detailed Dealer Performance Report (rank dealers by rotation, revenue, product mix); 
Gross Profit Report (revenue minus purchase cost per customer/SKU)
Let me know if this captures everything or if there are additional reports you'd like to add.

Separately, as discussed - I'll also evaluate custom-built/pre-existing solutions for automating order placement, order routing, and fulfillment. I'll keep you posted on the same. 

Best, 

Vignesh


Client Owner
Sat 31 Jan, 14:59 (7 days ago)
to me, Hello, Pooja

Dear Vignesh,

 

Thank you for the update. The reports in your trail mail captures majority of the trends and data needed to analyse the business’ needs.

Just to add:

Rotation performance criteria based on product:
CO2- <1.25 Critical, 1.25-2 Medium, >2 Excellent

O2- <2.25 Critical, 2.25-3 Medium, >3 Excellent

LPG- <2 Critical, 2-3 Medium, >3 Excellent

Average Revenue per customer: 12 months, 6 months, 3 months.
All grouping of customer is in 3 types: Dealer / Factory / Marketing (Retail). All customer based reports to be grouped accordingly.
Alert list for customers that have not taken material in 30 days: Daily Alert.
In the dashboard, the cylinders and rotation we will be tracking are for UNIQUE cylinders only. Only for LPG – TOTAL column is to be considered (LPG is tracked as “exchange type’ SKU).
 

If anything else comes to mind, I shall update from time to time.

If you have any queries regarding the above, please feel free to give me a call.

 

Looking forward to seeing the product.


Meeting Notes:

Summary
Vignesh Ramakrishnan provided updates on project progress, confirming data pipelines are mostly complete and the focus is now on front-end rendering and API integrations, which Client Owner confirmed are working well. Client Owner detailed the single interaction between Trackabout and Zoho for inventory and billing, explaining their customer segmentation into retail and bulk, and distributors. Client Owner requested reports to identify best- and lowest-performing customers within “dealer sales” and discussed a strategic shift toward an LPG distributorship due to better rotation and demand, noting they are seeking a new logistics solution after discontinuing "Dracoile." Vignesh Ramakrishnan agreed to investigate the cost estimates for AI voice agents for order reception, and the speakers clarified report requirements, cylinder rotation metrics, and data integration for unique cylinders versus exchange-type cylinders.

Details
Project Progress and Data Integration Vignesh Ramakrishnan reported that they have been working on data cleanup and putting everything together, with data pipelines mostly complete and focusing now on front-end rendering and API integrations. Client Owner confirmed that the API integrations have been working fine and credited Gesh for being very helpful with this process (00:00:00).
Trackabout and Zoho Interaction Client Owner detailed the current single interaction between Trackabout, which manages cylinder stock and history, and Zoho for inventory and billing. The integration automatically raises an invoice in Zoho when a delivery is entered by drivers or salespeople and increases Zoho stock when a cylinder fill is scanned at the plant (00:04:41). This process eliminates the need for physically creating invoices (00:06:17).
Customer Segmentation and Delivery Process Client Owner explained their three types of customers: those to whom they deliver with their own vehicle (including retail market in Jaipur and bulk out-of-location deliveries) and distributors who pick up material from the plant (00:06:17). For retail customers in Jaipur, cylinders are transferred to a warehouse, but no billing is shown at that point; deliveries are made from the truck on a fixed route based on daily demand, where drivers scan the necessary items without knowing the orders at the start of the day (00:07:45). Distributors are billed upon dispatch, and Client Owner is not concerned with their subsequent handling of the cylinders, as long as they return empty cylinders for refilling (00:08:55).
Defining Customer Tiers and Segmentation in Zoho Client Owner clarified that retail customers are those requiring less than 30 cylinders daily, while bulk customers require more than 30 cylinders daily or every second day (00:10:15). Vignesh Ramakrishnan estimated bulk customers at 900+ cylinders a month. Client Owner noted that distributors are also listed as customers in Zoho, with segregation types set as "dealer sales," "factory sales," and "market bracket direct sales" for retail customers (00:11:15).
Desired Reports and Focus Shift to LPG Client Owner requested reports to identify the best and lowest-performing customers within "dealer sales" based on rotation, revenue, and product/SKU. They indicated a strategic shift, closing some retail oxygen customers to focus more on industrial gases and, significantly, taking up an LPG distributorship due to better rotation and continuous demand (00:13:54). Client Owner noted the LPG market in Jaipur has a scope for growth with 78,000 commercial-grade LPG cylinders sold monthly, compared to their oxygen market share of 4,000 cylinders (00:16:12).
LPG Customer Profile and Logistics Challenges Client Owner prefers restaurants as primary LPG customers because they are 365-day businesses, aligning with their focus on "critical gas" and long-term contracts based on government-regulated pricing (00:18:10). They are using private cylinders and do not deal with common brands like Indian or HP due to using 20mm commercial-grade nozzles. Client Owner stated they would not be continuing with the "Dracoile" software for logistics after the end of the month because the team was not satisfied with it (00:19:18).
Order Tracking Solution Requirements Client Owner needs a logistics solution, specifically for back-end order management, not customer order placing, as laborers, not owners, are involved in purchasing the gases (00:21:22). The desired workflow involves an internal person punching in orders received via phone, another person assigning them to relevant drivers, and drivers providing live updates with location-based route optimization (00:22:39). Client Owner noted that their drivers currently use a WhatsApp group for coordination, but they want to change the order receiving model to prevent the commercial head from being too occupied (00:24:18).
Exploring AI for Order Reception Client Owner inquired about using AI for receiving orders via call. Vignesh Ramakrishnan confirmed that data collection through AI voice agents is possible and could be automated into existing spreadsheets or trigger WhatsApp notifications, but they need to evaluate the cost against the volume of calls (around 40-50 per day) (00:26:05). Vignesh Ramakrishnan agreed to investigate cost estimates for voice agents, noting that costs have recently become much cheaper (00:27:31).
Report Requirements and Cylinder Rotation Metrics Client Owner committed to providing a comprehensive list of all required reports by the end of the day, rather than just five, so that Vignesh Ramakrishnan could offer suggestions (00:28:49). Client Owner then demonstrated a key report on cylinder rotation, showing that a high rotation of 6.55 for a customer like Jantaa sweet home is considered "elite," while a customer with a rotation of one cylinder per month is undesirable (00:30:56). They explained that cylinder rotation is calculated monthly and varies by SKU, with LPG having a rotation of around 2.5 and oxygen at 2-2.5, while CO2 is lower at 1.25 to 1.5 (00:33:32).
Data Clarification and Front-end Preview Vignesh Ramakrishnan questioned "failed RNS" in Zoho invoices, which Client Owner clarified referred to "Return of cylinder" (RNS) and "Delivery Note of Cylinder" (DNS) for exchange-type cylinders that are not uniquely tracked in Trackabout (00:34:48). Client Owner emphasized that only data for unique cylinders, such as medical equipment, should be used for reports and the frontend, excluding the exchange-type cylinders. Vignesh Ramakrishnan provided a rough preview of the front-end design and agreed to update the data based on the unique cylinder requirement and other discussion points (00:37:09).

The speakers agreed to focus first on the backend data and development, with Vignesh Ramakrishnan looking into the cost of AI voice agents and confirming that WhatsApp integration for order flow is easily feasible (00:41:00).

# Questions for Owner

1. How’re they using Wati now?
2. Whom to speak with?
3. How exactly does their Trackabout workflow look like? Who uses it? Drivers as well (yes, from what I remember)
4. Trackabout + Zoho interaction - confirmation. What info goes to Zoho and what info goes to Trackabout.
5. Discuss Trackomile - exactly what’s the problem? How can we help? Flag no API access
6. Data verification - from Owner’s systems
7. What is failed RNS? What is DNS & RNS? Exchange type cylinders; Don’t uniquely track. But only sku-wise. Need only-unique in this.
8. Reports - what would be useful?

Todo: send to Owner - list of reports identified - simple & clear.

One single interaction - 

1. Trackabout helps in managing cylinders;
2. If it’s filled - stock to sell; if it’s empty - stock to fill;

Who did the Cylinder go to etc.? 

Delivery to a customer → when done; Zoho raised invoice.

Everytime someone scans a fill on the Cylinder → it will fill a stock on Zoho.

2 types of customers - (1) send material yourself → (a) retail (20 odd); (b) 1000 cylinders a month odd; 

Step 1 - transfer to WH;

Step 2 - final billing;

Some cylinders on a daily route; (daily reqs. of less than 30 cylinders - Retail;

If more than 900 cylinders then large-scale;

Weekly route, etc.

(2) distributors → invoice raised at time of delivery?

They come back and give the cylinders for filling;

Zoho has a mark → looking for dealer/Factory basis. (this is under Sales Person)

Separate dealer-customer wise; SKU-wise rotation; Product-wise rotation;

Have closed down customers recently.

More towards LPG moving away from Industrial Gases.

Find SKUs; Sale by SKU/item-wise report.

250 - 300 customers → 2500-3000 cylinders. Those cylinders 

LPG business → 300 odd-customers; same infra but higher margins; 

1500 MT/19.2 → 78000 LPG cylinders every month; Margins are same;

They also manuf their own power w LPG:

2 MW → power.

750 MW → solar installation.

Mithai, Restaurants, Catering (less-preferred than Mithai, Restaurants) → critical gas. 

Zoho also has purchase cost → help me calculate gross profit;

How many cylinders have they purchased overall in monthly/ trackabout how much held → trend also.

Cylinder sales per SKU;

CO2 → less rotation; takes time; Avg. rotation would be 1.25 and for Oxygen cylinder > 2 almost.

LPG → approx. 2.5 - 3;

Not preferable for one-off sales.

MRP - 100 rs. discount.

Go Gas & Confidence Petroleum.

Trackomile - usage not great. 

Order tracking - solution. 

Order-placing: Phone-based; Not WhatsApp-based either?

Where are you collecting orders? 

Someone else who’s allotting drivers;

Order-batching is an issue; How do you do the order-batching now? - happens on WhatsApp

**WhatsApp pe coordination;**

**Approx. how many calls dealing with in a day → Customers se 40-50 calls;**

---

## 07 April 2026 — Email from Owner: Dashboard Restructure

3 separate dashboards requested:

### 1. CYLINDER MANAGEMENT DASHBOARD
- **SKUs**: Only from Final SKU List (16 products — ARG, CB-95, HB-92, HB-95, CO2-27KG, CO2-30KG, CO2-45KG, DA-001, IND-10, IND-6, IND-7, MED-6, MED-A, MED-B, MED-D, N2-7)
- **Holdings**: Only "Unique" count from TrackAbout (not Total)
- **Baseline**: Only customers with positive Unique holdings as of 01.04.2026
- **Data period**: From 01.04.2025 onwards
- **Filters**: Customer / Product — allow multiple selection
- **Customer Categories** (from Zoho Books):
  - Marketing (Direct Sales)
  - Factory Sales
  - Dealer Sales
- **Customer Status** (based on TrackAbout deliveries):
  - Active — delivery made in last 30 days
  - At Risk — no delivery in 30–90 days
  - Cylinders Stuck — no delivery for 90+ days
- **Rotation**:
  - SKU-wise per customer
  - Minimum 30-day calculation period
  - Date selection (min 30 days)
  - Holding = avg holding over selected 30 days, OR today's holding for last 30 days (default live view)
  - Sales = qty of cylinders delivered in that SKU over selected 30 days / last 30 days (default)
  - Rotation = Sales / Holding
  - Rotation ratings per SKU (from PDF):
    | SKU | Good | Avg | Poor |
    |-----|------|-----|------|
    | ARG, CB-95, HB-92, HB-95 | ≥2 | 1.5 | <1.5 |
    | CO2-27KG, CO2-30KG, CO2-45KG, DA-001, N2-7 | ≥2 | 1 | <1 |
    | IND-10, IND-6, IND-7, MED-6, MED-A, MED-B, MED-D | ≥3 | 2 | <2 |
- **Profit per product**:
  - Selling Price = line item from Zoho invoice
  - Cost Price = from SKU list (allow customer-wise override)
    | SKU | Cost Price |
    |-----|-----------|
    | ARG, CB-95, HB-92, HB-95 | ₹750 |
    | CO2-27KG | ₹270 |
    | CO2-30KG | ₹300 |
    | CO2-45KG | ₹450 |
    | DA-001 | ₹2,000 |
    | IND-10 | ₹110 |
    | IND-6, MED-6 | ₹90 |
    | IND-7, MED-D, N2-7 | ₹100 |
    | MED-A | ₹70 |
    | MED-B | ₹80 |
  - Profit = Selling Price – Cost Price
  - GP% = (Selling Price – Cost Price) / Cost Price
- **Alerts**:
  - CYLINDER FAILED DELIVERY — cylinder LOADED on truck but not DELIVERED/UNLOADED on TrackAbout for 48+ hours
  - CYLINDER DELAYED AT PLANT — cylinder at "GGPL Platform" location but not DELIVERED/LOADED for 30+ days

### 2. LPG MANAGEMENT DASHBOARD
- **SKU**: Only LPG/C-19.2
- Everything else same as Cylinder Management Dashboard

### 3. SALES MANAGEMENT DASHBOARD
- Customer categories: Marketing / Factory / Dealer (same as above)
- **Filters**: Customer / Product — allow multiple selection
- **Customer Status** (based on Zoho invoices, NOT TrackAbout deliveries):
  - Regular — invoice made in last 30 days
  - Irregular — no invoice in 30–90 days
  - Inactive — no invoice for 90+ days
- **Sales reports**: Date-wise / date selection, showing quantity AND amount per product/SKU
- **Unpaid Sales Invoices**:
  - Month selection, customer-wise totals for OVERDUE invoices (past due date)
  - Data from April 2025 onwards

### Key Differences from Current Dashboard
- 3 dashboards instead of 1
- Customer status now based on delivery (cylinder) or invoice (sales) recency, not rotation rate
- 3-tier ratings renamed: Good / Avg / Poor (not Excellent / Good / At-Risk / Critical)
- Rotation thresholds are now SKU-specific (from PDF), replacing gas-type thresholds
- Holdings = Unique only (confirmed again)
- Profit uses fixed cost prices from SKU list (with customer-wise override option)
- New alerts: failed delivery (48h) and delayed at plant (30d)
- LPG gets its own separate dashboard

### TrackAbout Screenshot Context
Shows Asset Balance for "EXAMPLE AGRICULTURE WORKS (GX00001)" as of 31/03/2026. Columns: Category, Group, Type, Total, **Unique**, +DNS, -RNS, Last Activity. Only the **Unique** column counts should be used for holdings.