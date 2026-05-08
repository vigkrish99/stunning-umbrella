import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Invoice } from '@/lib/models/Invoice';
import { Customer } from '@/lib/models/Customer';
import { CostOverride } from '@/lib/models/CostOverride';
import { CYLINDER_SKUS, DASHBOARD_SEGMENTS, resolveLegacyCode, getFillCost } from '@/lib/cylinder-costs';

export const dynamic = 'force-dynamic';

const DATE_FLOOR = new Date('2025-04-01');

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customerId');
  const productCode = searchParams.get('productCode');
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');

  const now = new Date();
  const to = toDate ? new Date(toDate) : now;
  const from = fromDate ? new Date(fromDate) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const effectiveFrom = from < DATE_FLOOR ? DATE_FLOOR : from;

  // Get customer IDs in dashboard segments
  const customerQuery: Record<string, unknown> = { segment: { $in: [...DASHBOARD_SEGMENTS] } };
  if (customerId) customerQuery.customerId = customerId;
  const customers = await Customer.find(customerQuery, { customerId: 1, name: 1, segment: 1 }).lean();
  const customerIds = customers.map(c => c.customerId);
  const nameMap = new Map(customers.map(c => [c.customerId, c.name]));
  const segmentMap = new Map(customers.map(c => [c.customerId, c.segment || 'Unknown']));

  // Get cost overrides
  const overrides = await CostOverride.find({ customerId: { $in: customerIds } }).lean();
  const overrideMap = new Map(overrides.map(o => [`${o.customerId}:${o.productCode}`, o.costPrice]));

  // Aggregate invoice line items by customer + productCode
  const skuFilter: string[] = productCode ? [productCode] : [...CYLINDER_SKUS];

  const lineItemAgg = await Invoice.aggregate([
    { $match: { customerId: { $in: customerIds }, date: { $gte: effectiveFrom, $lte: to } } },
    { $unwind: '$lineItems' },
    { $match: { 'lineItems.productCode': { $in: skuFilter, $not: /\/PC/i } } },
    {
      $group: {
        _id: { customerId: '$customerId', productCode: '$lineItems.productCode' },
        totalQty: { $sum: '$lineItems.quantity' },
        totalRevenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.rate'] } },
        avgRate: { $avg: '$lineItems.rate' },
        invoiceCount: { $sum: 1 },
      },
    },
  ]);

  const results = lineItemAgg.map((item: { _id: { customerId: string; productCode: string }; totalQty: number; totalRevenue: number; avgRate: number; invoiceCount: number }) => {
    const cid = item._id.customerId;
    const pc = item._id.productCode;
    const resolved = resolveLegacyCode(pc) || pc;
    const sp = item.avgRate || 0;
    const cp = overrideMap.get(`${cid}:${resolved}`) ?? getFillCost(resolved) ?? 0;
    const profit = sp - cp;
    const gpPercent = cp > 0 ? ((sp - cp) / cp) * 100 : 0;

    return {
      customerId: cid,
      customerName: nameMap.get(cid) || cid,
      segment: segmentMap.get(cid) || 'Unknown',
      productCode: resolved,
      quantity: item.totalQty,
      revenue: Math.round(item.totalRevenue),
      sellingPrice: Math.round(sp * 100) / 100,
      costPrice: cp,
      costSource: overrideMap.has(`${cid}:${resolved}`) ? 'override' : 'catalog',
      profit: Math.round(profit * 100) / 100,
      gpPercent: Math.round(gpPercent * 10) / 10,
      invoiceCount: item.invoiceCount,
    };
  });

  results.sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({
    profit: results,
    period: { from: effectiveFrom.toISOString(), to: to.toISOString() },
    total: results.length,
  });
}
