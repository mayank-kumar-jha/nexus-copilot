'use strict';

const dns = require('dns').promises;

async function testDNS() {
  const hosts = [
    'db.vrryxibdvwmfylmxcxsd.supabase.co',
    'aws-0-ap-south-1.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-eu-central-1.pooler.supabase.com',
    'aws-0-ap-southeast-1.pooler.supabase.com',
  ];

  for (const h of hosts) {
    try {
      const addresses = await dns.lookup(h, { all: true });
      console.log(`[DNS] ${h} ->`, addresses);
    } catch (err) {
      console.log(`[DNS] ${h} FAILED:`, err.message);
    }
  }
}

testDNS();
