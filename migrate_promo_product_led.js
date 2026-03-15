const { Pool } = require("pg");
require("dotenv").config();

// Ensure we pick up the same credentials used by initial.js and app.js
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'dream039',
    database: process.env.PG_DATABASE || 'Safari-Pos',
    host: process.env.PG_HOST || '10.0.0.100',
    port: process.env.PG_PORT || 5432,
});

const migratePromoArchitecture = async () => {
    try {
        console.log("Starting Product-Led Promotions Migration...");

        // 1. Create global tbl_promotions (no store_id, no target_type, no target_product_ids)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tbl_promotions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code VARCHAR(50) UNIQUE NOT NULL,
                type VARCHAR(20) NOT NULL,
                value NUMERIC NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Created tbl_promotions completely unbound from stores.");

        // 2. Alter products: Add promotion_id
        await pool.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES tbl_promotions(id) ON DELETE SET NULL;
        `);
        console.log("Added promotion_id column to products table.");

        console.log("Product-Led Promotions Migration completed successfully!");
    } catch (error) {
        console.error("Migration Error:", error);
    } finally {
        await pool.end();
    }
};

module.exports = migratePromoArchitecture;

// Allow running directly
if (require.main === module) {
    migratePromoArchitecture();
}
