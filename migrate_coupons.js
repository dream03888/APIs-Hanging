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

const migrateCoupons = async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        console.log("Creating tbl_coupon_campaigns...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_coupon_campaigns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                prefix VARCHAR(50) NOT NULL,
                discount_type VARCHAR(20) NOT NULL, -- 'percentage' or 'amount'
                discount_value NUMERIC(10, 2) NOT NULL,
                start_date TIMESTAMP WITH TIME ZONE,
                end_date TIMESTAMP WITH TIME ZONE,
                is_all_bill BOOLEAN DEFAULT TRUE, -- TRUE = applies to whole bill, FALSE = certain products only
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating tbl_coupons...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_coupons (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                campaign_id UUID REFERENCES tbl_coupon_campaigns(id) ON DELETE CASCADE,
                code VARCHAR(100) UNIQUE NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                used_at TIMESTAMP WITH TIME ZONE,
                order_id UUID, -- Links to tbl_orders if needed later
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating tbl_coupon_store_links...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_coupon_store_links (
                campaign_id UUID REFERENCES tbl_coupon_campaigns(id) ON DELETE CASCADE,
                store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
                PRIMARY KEY (campaign_id, store_id)
            );
        `);

        console.log("Creating tbl_coupon_product_links...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_coupon_product_links (
                campaign_id UUID REFERENCES tbl_coupon_campaigns(id) ON DELETE CASCADE,
                product_id UUID REFERENCES products(id) ON DELETE CASCADE,
                PRIMARY KEY (campaign_id, product_id)
            );
        `);

        await client.query("COMMIT");
        console.log("Migration for Coupon System completed successfully.");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", error);
    } finally {
        client.release();
        process.exit();
    }
};

migrateCoupons();
