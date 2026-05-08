/**
 * Seed initial AgentRole entries.
 * Run once after deploy: npm run seed:roles
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../lib/db.js';
import AgentRole from '../lib/models/AgentRole.js';

const SEED_ROLES = [
  {
    name: 'Vignesh Ramakrishnan',
    email: 'vignesh@southarcdigital.com',
    phone: '919600194429',
    role: 'owner',
    permissions: {
      reports: { daily: true, monday: true, friday: true, channels: ['email', 'whatsapp'] },
      orders: { canPlace: true, canApprove: true, canCancel: true },
      queries: { canQueryCustomers: true, canQueryMetrics: true, canQueryFinancials: true },
    },
    isActive: true,
  },
  {
    name: 'Client Owner',
    email: 'owner@helix-gases.com',
    phone: '<REDACTED_PHONE>',
    role: 'owner',
    permissions: {
      reports: { daily: true, monday: true, friday: true, channels: ['email', 'whatsapp'] },
      orders: { canPlace: true, canApprove: true, canCancel: true },
      queries: { canQueryCustomers: true, canQueryMetrics: true, canQueryFinancials: true },
    },
    isActive: true,
  },
  {
    name: 'Ram',
    email: '',
    phone: '919962414498',
    role: 'owner',
    permissions: {
      reports: { daily: true, monday: true, friday: true, channels: ['email', 'whatsapp'] },
      orders: { canPlace: true, canApprove: true, canCancel: true },
      queries: { canQueryCustomers: true, canQueryMetrics: true, canQueryFinancials: true },
    },
    isActive: true,
  },
];

async function seed() {
  await connectDB();
  for (const role of SEED_ROLES) {
    const result = await AgentRole.findOneAndUpdate(
      { email: role.email },
      { $set: role },
      { upsert: true, new: true }
    );
    console.log(`Upserted: ${result.name} (${result.role}) - ${result.email}`);
  }
  await disconnectDB();
}

seed().catch(console.error);
