'use strict';

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../backend/node_modules/@prisma/client'));

async function testAuth() {
  const configs = [
    {
      name: 'Pooler 6543 transaction (encoded)',
      url: 'postgresql://postgres.vrryxibdvwmfylmxcxsd:NexusPass2026%21@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
    },
    {
      name: 'Pooler 5432 session (encoded)',
      url: 'postgresql://postgres.vrryxibdvwmfylmxcxsd:NexusPass2026%21@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require',
    },
    {
      name: 'Direct IPv6/IPv4 db host',
      url: 'postgresql://postgres:NexusPass2026%21@db.vrryxibdvwmfylmxcxsd.supabase.co:5432/postgres?sslmode=require',
    },
  ];

  for (const cfg of configs) {
    console.log(`[Testing] ${cfg.name}...`);
    const prisma = new PrismaClient({
      datasources: { db: { url: cfg.url } },
    });

    try {
      await prisma.$connect();
      console.log(`[SUCCESS] ✓ Connected with ${cfg.name}!`);
      const res = await prisma.$queryRawUnsafe('SELECT 1 as success');
      console.log('[SUCCESS] Query:', res);
      await prisma.$disconnect();
      return cfg.url;
    } catch (err) {
      console.log(`[Failed] ${cfg.name}:`, err.message.split('\n')[0]);
      await prisma.$disconnect().catch(() => {});
    }
  }
}

testAuth();
