require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function loadJsonDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file not found: ${DB_PATH}`);
  }

  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

async function main() {
  const data = loadJsonDatabase();

  console.log('Starting JSON -> Neon migration...');
  console.log(`Users: ${data.users.length}`);
  console.log(`Products: ${data.products.length}`);
  console.log(`Sales: ${data.sales.length}`);
  console.log(`Audit logs: ${data.auditLog.length}`);
  console.log(`Payments: ${data.payments.length}`);
  console.log(`Login attempts: ${data.loginAttempts.length}`);
  console.log(`Notifications: ${data.notifications.length}`);

  for (const user of data.users) {
    await sql`
      INSERT INTO users (
        id,
        name,
        email,
        phone,
        password_hash,
        role,
        parent_admin_id,
        status,
        language,
        permissions,
        created_at
      )
      VALUES (
        ${user.id},
        ${user.name},
        ${user.email},
        ${user.phone || null},
        ${user.passwordHash || null},
        ${user.role || null},
        ${user.parentAdminId || null},
        ${user.status || null},
        ${user.language || null},
        ${JSON.stringify(user.permissions || [])}::jsonb,
        ${user.createdAt || null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const product of data.products) {
    await sql`
      INSERT INTO products (
        id,
        name,
        price,
        stock,
        low_stock_limit
      )
      VALUES (
        ${product.id},
        ${product.name},
        ${product.price ?? 0},
        ${product.stock ?? 0},
        ${product.lowStockLimit ?? 0}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const sale of data.sales) {
    await sql`
      INSERT INTO sales (
        id,
        data
      )
      VALUES (
        ${sale.id},
        ${JSON.stringify(sale)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const audit of data.auditLog) {
    await sql`
      INSERT INTO audit_log (
        id,
        actor_id,
        action,
        entity,
        entity_id,
        details,
        timestamp
      )
      VALUES (
        ${audit.id},
        ${audit.actorId || null},
        ${audit.action || null},
        ${audit.entity || null},
        ${audit.entityId || null},
        ${JSON.stringify(audit.details || {})}::jsonb,
        ${audit.timestamp || null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const payment of data.payments) {
    await sql`
      INSERT INTO payments (
        id,
        data
      )
      VALUES (
        ${payment.id},
        ${JSON.stringify(payment)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const attempt of data.loginAttempts) {
    await sql`
      INSERT INTO login_attempts (
        id,
        email,
        success,
        ip,
        timestamp
      )
      VALUES (
        ${attempt.id},
        ${attempt.email || null},
        ${Boolean(attempt.success)},
        ${attempt.ip || null},
        ${attempt.timestamp || null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const notification of data.notifications) {
    await sql`
      INSERT INTO notifications (
        id,
        to_role,
        to_user_id,
        type,
        message,
        read,
        timestamp
      )
      VALUES (
        ${notification.id},
        ${notification.toRole || null},
        ${notification.toUserId || null},
        ${notification.type || null},
        ${notification.message || null},
        ${Boolean(notification.read)},
        ${notification.timestamp || null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  console.log('');
  console.log('Migration completed successfully.');
}

main().catch((error) => {
  console.error('');
  console.error('Migration failed:');
  console.error(error);
  process.exit(1);
});
