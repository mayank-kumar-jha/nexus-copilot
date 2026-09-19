'use strict';

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../backend/node_modules/@prisma/client'));

const url = 'postgresql://postgres.vrryxibdvwmfylmxcxsd:NexusPass2026%21@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require';

const prisma = new PrismaClient({
  datasources: { db: { url } },
});

async function verify() {
  console.log('====================================================');
  console.log('       NEXUS SUPABASE CLOUD DATABASE STATUS         ');
  console.log('====================================================\n');

  try {
    const [sessionCount, taskCount, stepCount, memoryCount] = await Promise.all([
      prisma.session.count(),
      prisma.task.count(),
      prisma.step.count(),
      prisma.memoryItem.count(),
    ]);

    console.log(`✓ Sessions in Cloud DB:    ${sessionCount}`);
    console.log(`✓ Tasks in Cloud DB:       ${taskCount}`);
    console.log(`✓ Steps Executed:          ${stepCount}`);
    console.log(`✓ Long-Term Memory Items:  ${memoryCount}`);

    const latestTasks = await prisma.task.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        goal: true,
        status: true,
        stepCount: true,
        result: true,
        createdAt: true,
      },
    });

    if (latestTasks.length > 0) {
      console.log('\n--- Latest 3 Tasks in Supabase ---');
      latestTasks.forEach((t, i) => {
        console.log(`\n[${i + 1}] Goal: "${t.goal}"`);
        console.log(`    Status: ${t.status} | Steps: ${t.stepCount} | Created: ${t.createdAt.toISOString()}`);
        if (t.result) console.log(`    Result: ${t.result.substring(0, 100)}...`);
      });
    }

    await prisma.$disconnect();
    console.log('\n✓ Supabase PostgreSQL Cloud Database is 100% HEALTHY & ACTIVE!');
  } catch (err) {
    console.error('[Error] Verification failed:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verify();
