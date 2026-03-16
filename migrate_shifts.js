const { Pool } = require("pg");
const pool = new Pool({
    user: 'postgres',
    password: 'dream039',
    database: 'Safari-Pos',
    host: '10.0.0.100',
    port: 5432,
});

const migrate = async () => {
    try {
        console.log("Starting Migration for Shift System...");

        // 1. Create pos_shifts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_shifts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id UUID NOT NULL REFERENCES stores(id),
                user_id UUID REFERENCES users(id),
                start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP WITH TIME ZONE,
                opening_balance DECIMAL(12,2) DEFAULT 0,
                closing_balance_actual DECIMAL(12,2),
                status VARCHAR(20) DEFAULT 'open', -- 'open', 'closed'
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Table pos_shifts created or already exists.");

        // 2. Add shift_id to tbl_orders
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tbl_orders'`);
        const columnNames = columns.rows.map(c => c.column_name);
        
        if (!columnNames.includes('shift_id')) {
            console.log("Adding column shift_id to tbl_orders...");
            await pool.query(`ALTER TABLE tbl_orders ADD COLUMN shift_id UUID REFERENCES pos_shifts(id)`);
        }

        console.log("Migration for Shift System complete.");
    } catch (e) {
        console.error("Migration Error:", e);
    } finally {
        pool.end();
    }
}
migrate();
