const { pool } = require("./initial");

async function migrate() {
    try {
        console.log("Starting migration: Add hardware_config to stores...");
        
        // 1. Add hardware_config column as JSONB
        await pool.query(`
            ALTER TABLE stores 
            ADD COLUMN IF NOT EXISTS hardware_config JSONB DEFAULT '{}';
        `);
        console.log("Success: Added hardware_config column.");

        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
