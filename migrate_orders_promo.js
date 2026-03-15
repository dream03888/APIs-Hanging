const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: '10.0.0.100',
    database: 'Safari-Pos',
    password: 'dream039',
    port: 5432,
});

async function migrateOrderTable() {
    try {
        console.log("Starting Migration: Adding promotion columns to tbl_orders...");
        await pool.query(`
            ALTER TABLE tbl_orders
            ADD COLUMN IF NOT EXISTS promotion_id UUID,
            ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
        `);
        console.log("Migration Successful: tbl_orders updated.");
    } catch (err) {
        console.error("Error migrating tbl_orders:", err);
    } finally {
        pool.end();
    }
}

migrateOrderTable();
