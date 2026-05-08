import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Customer } from '@/lib/models/Customer';
import { CylinderHolding } from '@/lib/models/CylinderHolding';
import { AssetLedger } from '@/lib/models/AssetLedger';
import { RotationMetric } from '@/lib/models/RotationMetric';
import { CYLINDER_SKUS, DASHBOARD_SEGMENTS, resolveLegacyCode, getVesselCost } from '@/lib/cylinder-costs';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const DATE_FLOOR = new Date('2025-04-01');

export async function GET() {
  await connectDB();
  const now = new Date();

  // 1. Get customers in the 3 dashboard segments
  const customers = await Customer.find({
    segment: { $in: [...DASHBOARD_SEGMENTS] },
    trackaboutMid: { $exists: true, $ne: null },
  }, { customerId: 1, trackaboutMid: 1, name: 1 }).lean();

  const customerIds = customers.map(c => c.customerId);

  // 2. Get latest holdings for these customers, filtered to cylinder SKUs
  const holdings = await CylinderHolding.aggregate([
    { $sort: { asOfDate: -1 } },
    { $group: { _id: '$customerId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $match: { customerId: { $in: customerIds } } },
    { $unwind: '$holdings' },
  ]);

  // Filter to cylinder SKUs and compute totals
  let totalCylinders = 0;
  let totalCapitalLocked = 0;
  const customerHoldings: Record<string, number> = {};

  for (const h of holdings) {
    const resolved = resolveLegacyCode(h.holdings.productCode) || h.holdings.productCode;
    if (!CYLINDER_SKUS.includes(resolved as typeof CYLINDER_SKUS[number])) continue;
    const qty = h.holdings.cylinderCount || 0;
    totalCylinders += qty;
    totalCapitalLocked += qty * (getVesselCost(resolved) || 0);
    customerHoldings[h.customerId] = (customerHoldings[h.customerId] || 0) + qty;
  }

  // Only customers with positive holdings (baseline filter)
  const activeCustomerIds = Object.entries(customerHoldings)
    .filter(([, qty]) => qty > 0)
    .map(([id]) => id);

  // 3. Get last delivery date per customer from AssetLedger (outbound events, cylinder SKUs)
  const lastDeliveries = await AssetLedger.aggregate([
    {
      $match: {
        customerId: { $in: activeCustomerIds },
        direction: 'outbound',
        productCode: { $in: [...CYLINDER_SKUS], $not: /\/PC/i },
        eventDate: { $gte: DATE_FLOOR },
      },
    },
    { $group: { _id: '$customerId', lastDelivery: { $max: '$eventDate' } } },
  ]);

  const lastDeliveryMap = new Map(lastDeliveries.map((d: { _id: string; lastDelivery: Date }) => [d._id, d.lastDelivery]));

  // 4. Classify customer status
  let active = 0, atRisk = 0, stuck = 0;
  for (const cid of activeCustomerIds) {
    const last = lastDeliveryMap.get(cid);
    if (!last) { stuck++; continue; }
    const daysSince = now.getTime() - new Date(last).getTime();
    if (daysSince <= THIRTY_DAYS) active++;
    else if (daysSince <= NINETY_DAYS) atRisk++;
    else stuck++;
  }

  // 5. Calculate avg rotation (last 30 days, simplified)
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS);
  const deliveryCounts = await AssetLedger.aggregate([
    {
      $match: {
        customerId: { $in: activeCustomerIds },
        direction: 'outbound',
        productCode: { $in: [...CYLINDER_SKUS], $not: /\/PC/i },
        eventDate: { $gte: thirtyDaysAgo },
      },
    },
    { $group: { _id: '$customerId', deliveries: { $sum: 1 } } },
  ]);

  let totalRotation = 0;
  let rotationCount = 0;
  for (const d of deliveryCounts) {
    const held = customerHoldings[d._id] || 0;
    if (held > 0) {
      totalRotation += d.deliveries / held;
      rotationCount++;
    }
  }
  const avgRotation = rotationCount > 0 ? totalRotation / rotationCount : 0;

  // 6. Rotation trend — last 6 completed months from stored RotationMetric.
  // The previous implementation divided each month's deliveries by CURRENT holdings,
  // which made historical rotation rates inconsistent with the canonical formula
  // (deliveries ÷ period-average holdings) used in calculate-metrics-v2 and the
  // monthly reports. Pulling from RotationMetric makes Overview ↔ Reports agree.
  const trendLabels: string[] = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const trendAgg = await RotationMetric.aggregate([
    {
      $match: {
        customerId: { $in: activeCustomerIds },
        'period.label': { $in: trendLabels },
      },
    },
    {
      $group: {
        _id: '$period.label',
        avgRotation: { $avg: '$rotationRate' },
      },
    },
  ]);

  const trendByLabel = new Map<string, number>(
    trendAgg.map((row: { _id: string; avgRotation: number }) => [row._id, row.avgRotation || 0])
  );

  const rotationTrend = trendLabels.map((label) => ({
    month: label,
    avgRotation: Math.round((trendByLabel.get(label) || 0) * 100) / 100,
  }));

  return NextResponse.json({
    totalCustomers: activeCustomerIds.length,
    active,
    atRisk,
    stuck,
    totalCylinders,
    capitalLocked: totalCapitalLocked,
    avgRotation: Math.round(avgRotation * 100) / 100,
    dateFloor: DATE_FLOOR.toISOString(),
    rotationTrend,
  });
}
