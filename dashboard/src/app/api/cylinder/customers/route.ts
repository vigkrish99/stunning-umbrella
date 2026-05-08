import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Customer } from '@/lib/models/Customer';
import { CylinderHolding } from '@/lib/models/CylinderHolding';
import { AssetLedger } from '@/lib/models/AssetLedger';
import { Invoice } from '@/lib/models/Invoice';
import { CYLINDER_SKUS, DASHBOARD_SEGMENTS, resolveLegacyCode } from '@/lib/cylinder-costs';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const DATE_FLOOR = new Date('2025-04-01');

function getStatus(lastDeliveryDate: Date | null): 'Active' | 'At Risk' | 'Cylinders Stuck' {
  if (!lastDeliveryDate) return 'Cylinders Stuck';
  const days = (Date.now() - new Date(lastDeliveryDate).getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 30) return 'Active';
  if (days <= 90) return 'At Risk';
  return 'Cylinders Stuck';
}

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const segment = searchParams.get('segment'); // optional filter
  const status = searchParams.get('status');    // optional: Active, At Risk, Cylinders Stuck
  const search = searchParams.get('search');    // name search
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  // 1. Base customer query
  const customerQuery: Record<string, unknown> = {
    segment: segment ? segment : { $in: [...DASHBOARD_SEGMENTS] },
    trackaboutMid: { $exists: true, $ne: null },
  };
  if (search) {
    customerQuery.name = { $regex: search, $options: 'i' };
  }

  const customers = await Customer.find(customerQuery, {
    customerId: 1, name: 1, segment: 1, trackaboutMid: 1,
  }).lean();

  const customerIds = customers.map(c => c.customerId);

  // 2. Get latest holdings filtered to cylinder SKUs
  const holdingsAgg = await CylinderHolding.aggregate([
    { $sort: { asOfDate: -1 } },
    { $group: { _id: '$customerId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $match: { customerId: { $in: customerIds } } },
  ]);

  const customerHoldingsMap = new Map<string, number>();
  for (const h of holdingsAgg) {
    let total = 0;
    for (const item of (h.holdings || [])) {
      const resolved = resolveLegacyCode(item.productCode) || item.productCode;
      if (CYLINDER_SKUS.includes(resolved as typeof CYLINDER_SKUS[number])) total += item.cylinderCount || 0;
    }
    if (total > 0) customerHoldingsMap.set(h.customerId, total);
  }

  // Baseline: only customers with positive holdings
  const baselineIds = [...customerHoldingsMap.keys()];

  // 3. Last delivery per customer
  const lastDeliveries = await AssetLedger.aggregate([
    {
      $match: {
        customerId: { $in: baselineIds },
        direction: 'outbound',
        productCode: { $in: [...CYLINDER_SKUS], $not: /\/PC/i },
        eventDate: { $gte: DATE_FLOOR },
      },
    },
    { $group: { _id: '$customerId', lastDelivery: { $max: '$eventDate' } } },
  ]);
  const lastDeliveryMap = new Map(lastDeliveries.map((d: { _id: string; lastDelivery: Date }) => [d._id, d.lastDelivery]));

  // 4. Billing totals (since April 2025)
  const billingAgg = await Invoice.aggregate([
    { $match: { customerId: { $in: baselineIds }, date: { $gte: DATE_FLOOR } } },
    { $group: { _id: '$customerId', totalBilling: { $sum: '$amount' }, invoiceCount: { $sum: 1 }, lastInvoice: { $max: '$date' } } },
  ]);
  const billingMap = new Map(billingAgg.map((b: { _id: string; totalBilling: number; invoiceCount: number; lastInvoice: Date }) => [b._id, b]));

  // 5. Build result list
  const customerMap = new Map(customers.map(c => [c.customerId, c]));
  let results = baselineIds.map(cid => {
    const cust = customerMap.get(cid);
    const lastDel = lastDeliveryMap.get(cid) || null;
    const billing = billingMap.get(cid);
    return {
      customerId: cid,
      name: cust?.name || cid,
      segment: cust?.segment || 'Unknown',
      cylindersHeld: customerHoldingsMap.get(cid) || 0,
      status: getStatus(lastDel),
      lastDelivery: lastDel,
      totalBilling: billing?.totalBilling || 0,
      invoiceCount: billing?.invoiceCount || 0,
      lastInvoice: billing?.lastInvoice || null,
    };
  });

  // Filter by status if requested
  if (status) {
    results = results.filter(r => r.status === status);
  }

  // Sort by cylindersHeld descending
  results.sort((a, b) => b.cylindersHeld - a.cylindersHeld);

  // Paginate
  const total = results.length;
  const paginated = results.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    customers: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts: {
      Active: results.filter(r => r.status === 'Active').length,
      'At Risk': results.filter(r => r.status === 'At Risk').length,
      'Cylinders Stuck': results.filter(r => r.status === 'Cylinders Stuck').length,
    },
  });
}
