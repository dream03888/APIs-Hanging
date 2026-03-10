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
        await client.query('BEGIN');

        await client.query(`
      ALTER TABLE addon_groups 
      ADD COLUMN IF NOT EXISTS min_choices INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_choices INT DEFAULT 0;
    `);

        await client.query(`
      UPDATE addon_groups SET min_choices = 1, max_choices = 1 WHERE is_required = true AND is_multiple = false AND min_choices = 0;
      UPDATE addon_groups SET max_choices = 0 WHERE is_multiple = true AND max_choices = 0;
    `);

        await client.query('COMMIT');
        console.log("Migration successful: Added min_choices and max_choices to addon_groups.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", error);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
