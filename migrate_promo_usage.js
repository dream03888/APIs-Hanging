const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'dream039',
    database: process.env.PG_DATABASE || 'Safari-Pos',
    host: process.env.PG_HOST || '10.0.0.100',
    port: process.env.PG_PORT || 5432,
});

async function runMigration() {
    try {
        console.log("Starting migration for Promotion Usage Limits...");

        // 1. Add columns to tbl_promotions
        const promoColsSql = `
            ALTER TABLE tbl_promotions 
            ADD COLUMN IF NOT EXISTS usage_limit INT DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;
        `;
        await pool.query(promoColsSql);
        console.log("tbl_promotions updated.");

        // 2. Add promotion_id to tbl_orders (already exists in some versions but let's be sure)
        const orderColsSql = `
            ALTER TABLE tbl_orders 
            ADD COLUMN IF NOT EXISTS promotion_id UUID DEFAULT NULL;
        `;
        await pool.query(orderColsSql);
        console.log("tbl_orders updated.");

        console.log("Migration successful!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runMigration();
