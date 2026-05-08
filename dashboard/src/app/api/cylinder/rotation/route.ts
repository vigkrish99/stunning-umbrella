import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { AssetLedger } from '@/lib/models/AssetLedger';
import { CylinderHolding } from '@/lib/models/CylinderHolding';
import { Customer } from '@/lib/models/Customer';
import {
  CYLINDER_SKUS, DASHBOARD_SEGMENTS, resolveLegacyCode,
  classifySkuPerformance, getFillCost,
} from '@/lib/cylinder-costs';

export const dynamic = 'force-dynamic';

const DATE_FLOOR = new Date('2025-04-01');

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customerId'); // optional: single customer
  const productCode = searchParams.get('productCode'); // optional: single SKU
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');

  // Default: last 30 days
  const now = new Date();
  const to = toDate ? new Date(toDate) : now;
  const from = fromDate ? new Date(fromDate) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Enforce minimum 30 days
  const daysDiff = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (daysDiff < 30) {
    return NextResponse.json({ error: 'Minimum 30-day period required' }, { status: 400 });
  }

  // Enforce date floor
  const effectiveFrom = from < DATE_FLOOR ? DATE_FLOOR : from;

  // Get qualifying customer IDs
  const customerMatch: Record<string, unknown> = {
    segment: { $in: [...DASHBOARD_SEGMENTS] },
    trackaboutMid: { $exists: true, $ne: null },
  };
  if (customerId) customerMatch.customerId = customerId;

  const customers = await Customer.find(customerMatch, { customerId: 1, name: 1, segment: 1 }).lean();
  const customerIds = customers.map(c => c.customerId);
  const customerNameMap = new Map(customers.map(c => [c.customerId, c.name]));
  const customerSegmentMap = new Map(customers.map(c => [c.customerId, c.segment || 'Unknown']));

  // SKU filter
  const skuFilter: string[] = productCode ? [productCode] : [...CYLINDER_SKUS];

  // 1. Deliveries: count outbound events per customer per productCode
  const deliveries = await AssetLedger.aggregate([
    {
      $match: {
        customerId: { $in: customerIds },
        direction: 'outbound',
        productCode: { $in: skuFilter, $not: /\/PC/i },
        eventDate: { $gte: effectiveFrom, $lte: to },
      },
    },
    {
      $group: {
        _id: { customerId: '$customerId', productCode: '$productCode' },
        deliveryCount: { $sum: 1 },
      },
    },
  ]);

  // 2. Holdings: latest snapshot per customer, filtered to cylinder SKUs
  const holdings = await CylinderHolding.aggregate([
    { $match: { customerId: { $in: customerIds } } },
    { $sort: { asOfDate: -1 } },
    { $group: { _id: '$customerId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $unwind: '$holdings' },
  ]);

  // Build holdings lookup: customerId:productCode -> cylinderCount
  const holdingsMap = new Map<string, number>();
  for (const h of holdings) {
    const resolved = resolveLegacyCode(h.holdings.productCode) || h.holdings.productCode;
    if (!skuFilter.includes(resolved)) continue;
    const key = `${h.customerId}:${resolved}`;
    holdingsMap.set(key, (holdingsMap.get(key) || 0) + (h.holdings.cylinderCount || 0));
  }

  // 3. Calculate rotation per customer per SKU
  const results = deliveries.map((d: { _id: { customerId: string; productCode: string }; deliveryCount: number }) => {
    const resolved = resolveLegacyCode(d._id.productCode) || d._id.productCode;
    const key = `${d._id.customerId}:${resolved}`;
    const held = holdingsMap.get(key) || 0;
    const rotation = held > 0 ? d.deliveryCount / held : 0;
    const rating = classifySkuPerformance(rotation, resolved);
    const fillCost = getFillCost(resolved);

    return {
      customerId: d._id.customerId,
      customerName: customerNameMap.get(d._id.customerId) || d._id.customerId,
      segment: customerSegmentMap.get(d._id.customerId) || 'Unknown',
      productCode: resolved,
      deliveries: d.deliveryCount,
      holding: held,
      rotation: Math.round(rotation * 100) / 100,
      rating,
      fillCost,
    };
  });

  // Sort by rotation descending
  results.sort((a, b) => b.rotation - a.rotation);

  return NextResponse.json({
    rotation: results,
    period: { from: effectiveFrom.toISOString(), to: to.toISOString(), days: Math.round(daysDiff) },
    total: results.length,
  });
}
