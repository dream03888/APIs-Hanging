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
        console.log("Creating tbl_master_addon_groups...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_master_addon_groups (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name        VARCHAR(255) NOT NULL,
                name_eng    VARCHAR(255),
                is_required BOOLEAN DEFAULT false,
                is_multiple BOOLEAN DEFAULT false,
                min_choices INT DEFAULT 0,
                max_choices INT DEFAULT 0,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("Creating tbl_master_addon_options...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_master_addon_options (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id   UUID NOT NULL REFERENCES tbl_master_addon_groups(id) ON DELETE CASCADE,
                name       VARCHAR(255) NOT NULL,
                name_eng   VARCHAR(255),
                price      NUMERIC(10,2) DEFAULT 0,
                is_active  BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("Migration complete! Tables created successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
        process.exit();
    }
}

migrate();
