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
      ALTER TABLE stores 
      ADD COLUMN IF NOT EXISTS name_eng VARCHAR(255);
    `);

        await client.query('COMMIT');
        console.log("Migration successful: Added name_eng to stores.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", error);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
