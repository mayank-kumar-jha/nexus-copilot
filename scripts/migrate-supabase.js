'use strict';

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../backend/node_modules/@prisma/client'));

const url = 'postgresql://postgres.vrryxibdvwmfylmxcxsd:NexusPass2026%21@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require';

const prisma = new PrismaClient({
  datasources: { db: { url } },
});

async function migrate() {
  console.log('[Migration] Creating tables in Supabase...');

  const statements = [
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "stepCount" INTEGER NOT NULL DEFAULT 0,
      "recoveryCount" INTEGER NOT NULL DEFAULT 0,
      "modelCallCount" INTEGER NOT NULL DEFAULT 0,
      "visionCallCount" INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT,
      "pendingApproval" JSONB,
      "plannedSteps" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "startedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      "taskId" TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      "stepNumber" INTEGER NOT NULL,
      tool TEXT NOT NULL,
      arguments JSONB NOT NULL,
      outcome TEXT,
      success BOOLEAN NOT NULL DEFAULT false,
      verified BOOLEAN NOT NULL DEFAULT false,
      timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  try {
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log('[Migration] ✓ All tables (sessions, tasks, steps, memories) created successfully in Supabase!');
    
    // Verify by querying tables
    const check = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('[Migration] Public tables now in Supabase:', check.map(r => r.table_name));

    await prisma.$disconnect();
  } catch (err) {
    console.error('[Migration] Failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

migrate();
