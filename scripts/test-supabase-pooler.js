'use strict';

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../backend/node_modules/@prisma/client'));

const regions = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
];

async function check() {
  for (const host of regions) {
    const url = `postgresql://postgres.vrryxibdvwmfylmxcxsd:Yash91597%40ya@${host}:5432/postgres?sslmode=require`;
    console.log(`[Testing] Trying ${host}:5432 ...`);
    const prisma = new PrismaClient({
      datasources: { db: { url } },
    });

    try {
      await prisma.$connect();
      console.log(`[SUCCESS] ✓ Connected to Supabase at: ${host}!`);
      const res = await prisma.$queryRawUnsafe('SELECT 1 as connected');
      console.log('[SUCCESS] Query result:', res);
      await prisma.$disconnect();
      return url;
    } catch (err) {
      console.log(`[Failed] ${host}:`, err.message.split('\n')[0]);
      await prisma.$disconnect().catch(() => {});
    }
  }
}

check();
