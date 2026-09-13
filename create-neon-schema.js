const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ntabwo ibonetse.');
  console.error('Banza ushyire DATABASE_URL muri environment yawe.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Connecting to Neon...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT,
      role TEXT,
      parent_admin_id TEXT,
      status TEXT,
      language TEXT,
      permissions JSONB,
      created_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      price NUMERIC,
      stock NUMERIC,
      low_stock_limit NUMERIC
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT,
      entity TEXT,
      entity_id TEXT,
      details JSONB,
      timestamp TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      email TEXT,
      success BOOLEAN,
      ip TEXT,
      timestamp TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      to_role TEXT,
      to_user_id TEXT,
      type TEXT,
      message TEXT,
      read BOOLEAN,
      timestamp TIMESTAMPTZ
    )
  `;

  console.log('Neon schema created successfully.');
}

main().catch((error) => {
  console.error('Neon schema creation failed:');
  console.error(error);
  process.exit(1);
});
