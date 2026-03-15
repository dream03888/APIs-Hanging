const { Pool } = require('pg');
const dotenv = require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    port: Number(process.env.PG_PORT || 5432),
});

const migrate = async () => {
    const client = await pool.connect();
    try {
        console.log("Starting migration for Master Options...");

        // 1. Create Master Addon Groups table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_master_addon_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                name_eng TEXT,
                is_required BOOLEAN DEFAULT false,
                is_multiple BOOLEAN DEFAULT false,
                min_choices INTEGER DEFAULT 0,
                max_choices INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Create Master Addon Options table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_master_addon_options (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id UUID REFERENCES tbl_master_addon_groups(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                name_eng TEXT,
                price DECIMAL(10, 2) DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log("Migration completed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
    }
};

migrate();
