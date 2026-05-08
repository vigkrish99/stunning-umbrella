/**
 * Cylinder Alert Engine
 * Pipeline checks for cylinder tracking anomalies:
 * 1. cylinder_unbilled — cylinders at customer with no invoice for 30+ days
 * 2. cylinder_on_truck — cylinders on a truck for 48+ hours with no delivery
 * 3. cylinder_idle_plant — cylinders at plant locations idle for 30+ days
 */

import AssetLedger from '../lib/models/AssetLedger.js';
import Invoice from '../lib/models/Invoice.js';
import Alert from '../lib/models/Alert.js';
import logger from '../lib/logger.js';

const PLANT_MIDS = ['GGPL', 'Basni', 'LPG'];
const UNBILLED_DAYS = 30;
const TRUCK_STUCK_HOURS = 48;
const PLANT_IDLE_DAYS = 30;
const DEDUP_HOURS = 24;

/**
 * Check if an alert of the given type+customerId was already created within DEDUP_HOURS.
 * @param {string} alertType
 * @param {string} alertCustomerId
 * @returns {Promise<boolean>} true if a duplicate exists
 */
async function isDuplicate(alertType, alertCustomerId) {
  const existing = await Alert.findOne({
    type: alertType,
    customerId: alertCustomerId,
    createdAt: { $gte: new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000) },
  });
  return existing != null;
}

/**
 * Check 1: cylinder_unbilled
 * Customers holding cylinders (last event outbound, 30+ days ago) with no invoice in 30+ days.
 * @returns {Promise<Array>} alerts created
 */
async function checkUnbilledCylinders() {
  const alerts = [];
  const cutoff = new Date(Date.now() - UNBILLED_DAYS * 24 * 60 * 60 * 1000);

  // Per asset: get the latest event; keep those that are outbound, have a customerId,
  // and whose latest event is older than 30 days ago.
  // Then group by customerId. Finally, $lookup into invoices to exclude customers
  // with a recent invoice.
  const results = await AssetLedger.aggregate([
    { $sort: { assetTId: 1, eventDate: -1 } },
    {
      $group: {
        _id: '$assetTId',
        direction: { $first: '$direction' },
        customerId: { $first: '$customerId' },
        customerName: { $first: '$customerName' },
        eventDate: { $first: '$eventDate' },
        serialNumber: { $first: '$serialNumber' },
      },
    },
    {
      $match: {
        direction: 'outbound',
        customerId: { $ne: null },
        eventDate: { $lt: cutoff },
        productCode: { $not: /\/PC/i },
      },
    },
    {
      $group: {
        _id: '$customerId',
        customerName: { $first: '$customerName' },
        cylinderCount: { $sum: 1 },
        sampleSerials: { $push: '$serialNumber' },
        oldestEventDate: { $min: '$eventDate' },
      },
    },
    {
      $lookup: {
        from: 'invoices',
        let: { cid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$customerId', '$$cid'] },
                  { $gte: ['$date', cutoff] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'recentInvoices',
      },
    },
    {
      $match: { recentInvoices: { $size: 0 } },
    },
  ]);

  for (const row of results) {
    const customerId = row._id;
    const customerName = row.customerName || customerId;

    if (await isDuplicate('cylinder_unbilled', customerId)) {
      logger.info(`Cylinder alerts: skipping duplicate cylinder_unbilled for ${customerId}`);
      continue;
    }

    const daysSinceLastBill = Math.floor(
      (Date.now() - row.oldestEventDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    const alert = await Alert.create({
      type: 'cylinder_unbilled',
      severity: 'warning',
      customerId,
      customerName,
      message: `${row.cylinderCount} cylinders at ${customerName} with no billing for 30+ days`,
      data: {
        cylinderCount: row.cylinderCount,
        sampleSerials: row.sampleSerials.slice(0, 5),
        daysSinceLastBill,
      },
    });

    alerts.push(alert);
    logger.info(`Cylinder alerts: created cylinder_unbilled for ${customerName} (${row.cylinderCount} cylinders)`);
  }

  return alerts;
}

/**
 * Check 2: cylinder_on_truck
 * Assets whose latest event is "Load Truck" and the event is older than 48 hours.
 * Groups by truck name, creates one alert per truck.
 * @returns {Promise<Array>} alerts created
 */
async function checkCylindersOnTruck() {
  const alerts = [];
  const cutoff = new Date(Date.now() - TRUCK_STUCK_HOURS * 60 * 60 * 1000);

  // Get the latest event per asset; keep those where it is a Load Truck event
  // older than 48 hours. Group by truck (destination.name).
  const results = await AssetLedger.aggregate([
    { $sort: { assetTId: 1, eventDate: -1 } },
    {
      $group: {
        _id: '$assetTId',
        actionName: { $first: '$actionName' },
        eventDate: { $first: '$eventDate' },
        serialNumber: { $first: '$serialNumber' },
        truckName: { $first: '$destination.name' },
      },
    },
    {
      $match: {
        actionName: 'Load Truck',
        eventDate: { $lt: cutoff },
        productCode: { $not: /\/PC/i },
      },
    },
    {
      $group: {
        _id: '$truckName',
        cylinderCount: { $sum: 1 },
        sampleSerials: { $push: '$serialNumber' },
        loadedSince: { $min: '$eventDate' },
      },
    },
  ]);

  for (const row of results) {
    const truckName = row._id || 'Unknown Truck';
    // Use truckName as the dedup key (stored in customerId field)
    const dedupKey = `truck:${truckName}`;

    if (await isDuplicate('cylinder_on_truck', dedupKey)) {
      logger.info(`Cylinder alerts: skipping duplicate cylinder_on_truck for ${truckName}`);
      continue;
    }

    const alert = await Alert.create({
      type: 'cylinder_on_truck',
      severity: 'critical',
      customerId: dedupKey,
      customerName: truckName,
      message: `${row.cylinderCount} cylinders on truck ${truckName} for 48+ hours without delivery`,
      data: {
        truckName,
        cylinderCount: row.cylinderCount,
        sampleSerials: row.sampleSerials.slice(0, 5),
        loadedSince: row.loadedSince,
      },
    });

    alerts.push(alert);
    logger.info(`Cylinder alerts: created cylinder_on_truck for ${truckName} (${row.cylinderCount} cylinders)`);
  }

  return alerts;
}

/**
 * Check 3: cylinder_idle_plant
 * Cylinders at plant locations (GGPL, Basni, LPG) whose last event is 30+ days ago
 * and whose last action was NOT Fill / Simple Fill (those were recently processed).
 * Groups by productCode, one alert per product.
 * @returns {Promise<Array>} alerts created
 */
async function checkIdlePlantCylinders() {
  const alerts = [];
  const cutoff = new Date(Date.now() - PLANT_IDLE_DAYS * 24 * 60 * 60 * 1000);

  const results = await AssetLedger.aggregate([
    { $sort: { assetTId: 1, eventDate: -1 } },
    {
      $group: {
        _id: '$assetTId',
        actionName: { $first: '$actionName' },
        eventDate: { $first: '$eventDate' },
        destinationMId: { $first: '$destination.mId' },
        productCode: { $first: '$productCode' },
      },
    },
    {
      $match: {
        destinationMId: { $in: PLANT_MIDS },
        eventDate: { $lt: cutoff },
        actionName: { $nin: ['Fill', 'Simple Fill'] },
        productCode: { $not: /\/PC/i },
      },
    },
    {
      $group: {
        _id: '$productCode',
        cylinderCount: { $sum: 1 },
      },
    },
  ]);

  for (const row of results) {
    const productCode = row._id || 'UNKNOWN';

    if (await isDuplicate('cylinder_idle_plant', productCode)) {
      logger.info(`Cylinder alerts: skipping duplicate cylinder_idle_plant for ${productCode}`);
      continue;
    }

    const alert = await Alert.create({
      type: 'cylinder_idle_plant',
      severity: 'info',
      customerId: productCode,
      customerName: 'Plant',
      message: `${row.cylinderCount} ${productCode} cylinders idle at plant for 30+ days`,
      data: {
        productCode,
        cylinderCount: row.cylinderCount,
        locations: PLANT_MIDS,
      },
    });

    alerts.push(alert);
    logger.info(`Cylinder alerts: created cylinder_idle_plant for ${productCode} (${row.cylinderCount} cylinders)`);
  }

  return alerts;
}

/**
 * Run all 3 cylinder alert checks.
 * @returns {Promise<Array>} all alerts created across the 3 checks
 */
export async function checkCylinderAlerts() {
  logger.info('Cylinder alert engine: running 3 pipeline checks...');

  const [unbilled, onTruck, idlePlant] = await Promise.all([
    checkUnbilledCylinders(),
    checkCylindersOnTruck(),
    checkIdlePlantCylinders(),
  ]);

  const all = [...unbilled, ...onTruck, ...idlePlant];
  logger.info(`Cylinder alert engine: created ${all.length} alerts (unbilled=${unbilled.length}, onTruck=${onTruck.length}, idlePlant=${idlePlant.length})`);
  return all;
}
