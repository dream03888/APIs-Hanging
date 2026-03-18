const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: Number(process.env.PG_PORT || 5432),
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Checking for terminals table columns...");

    // 1. Add mac_address if not exists
    await client.query(`
      ALTER TABLE terminals ADD COLUMN IF NOT EXISTS mac_address TEXT;
    `);
    
    // 2. Add hardware_config if not exists
    await client.query(`
      ALTER TABLE terminals ADD COLUMN IF NOT EXISTS hardware_config JSONB DEFAULT '{}';
    `);

    // 3. Ensure last_seen_at exists (it does based on checkSchema but good to be safe)
    await client.query(`
      ALTER TABLE terminals ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);

    // 4. Drop NOT NULL constraint on device_uid if it exists
    await client.query(`
      ALTER TABLE terminals ALTER COLUMN device_uid DROP NOT NULL;
    `);

    // 4. Unique constraint for mac_address per store
    try {
        await client.query(`
          ALTER TABLE terminals ADD CONSTRAINT unique_mac_store UNIQUE (mac_address, store_id);
        `);
    } catch (e) {
        // Might already exist
    }

    // 5. Create indices
    await client.query("CREATE INDEX IF NOT EXISTS idx_terminals_mac ON terminals(mac_address);");
    await client.query("CREATE INDEX IF NOT EXISTS idx_terminals_store ON terminals(store_id);");

    console.log("✅ Terminals table updated successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
