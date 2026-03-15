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
        console.log("Starting migration to add start_date and end_date to tbl_promotions...");

        const addColumnsSql = `
            ALTER TABLE tbl_promotions 
            ADD COLUMN IF NOT EXISTS start_date timestamp WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS end_date timestamp WITH TIME ZONE;
        `;

        await pool.query(addColumnsSql);
        console.log("Migration successful! Columns added.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runMigration();
