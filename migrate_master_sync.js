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
        console.log("Checking for master_product_id column...");
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='products' and column_name='master_product_id';
        `);

        if (res.rows.length === 0) {
            console.log("Adding master_product_id column to products table...");
            await client.query(`
                ALTER TABLE products 
                ADD COLUMN master_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
            `);
            console.log("Migration successful!");
        } else {
            console.log("master_product_id column already exists.");
        }
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
        process.exit();
    }
}

migrate();
