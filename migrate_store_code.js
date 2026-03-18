const { pool } = require("./initial");

async function migrate() {
    try {
        console.log("Starting migration: Add store_code to stores...");
        
        // 1. Add store_code column
        await pool.query(`
            ALTER TABLE stores 
            ADD COLUMN IF NOT EXISTS store_code VARCHAR(20) UNIQUE;
        `);
        
        // 2. Set default codes for existing stores if they are null
        const stores = await pool.query("SELECT id, name FROM stores WHERE store_code IS NULL");
        for (let row of stores.rows) {
            const generatedCode = row.name.substring(0, 3).toUpperCase() + Math.floor(100 + Math.random() * 900);
            await pool.query("UPDATE stores SET store_code = $1 WHERE id = $2", [generatedCode, row.id]);
            console.log(`Updated store ${row.name} with code ${generatedCode}`);
        }

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
