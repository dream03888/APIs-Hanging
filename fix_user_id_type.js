const { Pool } = require("pg");
const pool = new Pool({
    user: 'postgres',
    password: 'dream039',
    database: 'Safari-Pos',
    host: '10.0.0.100',
    port: 5432,
});

const fix = async () => {
    try {
        console.log("Fixing user_id type in pos_shifts...");

        // 1. Drop the foreign key constraint first if it exists
        // Note: The table might not have been created with a specific constraint name, 
        // but Postgres usually names it like 'pos_shifts_user_id_fkey'
        try {
            await pool.query(`ALTER TABLE pos_shifts DROP CONSTRAINT IF EXISTS pos_shifts_user_id_fkey`);
        } catch (e) {
            console.log("Constraint drop skip or fail:", e.message);
        }

        // 2. Change column type
        await pool.query(`ALTER TABLE pos_shifts ALTER COLUMN user_id TYPE VARCHAR(50)`);
        
        console.log("Successfully changed user_id type to VARCHAR(50).");

    } catch (e) {
        console.error("Fix Error:", e);
    } finally {
        pool.end();
    }
}
fix();
