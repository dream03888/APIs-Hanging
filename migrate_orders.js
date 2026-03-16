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
        console.log("Checking tbl_orders table schema...");
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tbl_orders'`);
        const columnNames = columns.rows.map(c => c.column_name);
        
        if (!columnNames.includes('order_type')) {
            console.log("Adding column order_type...");
            await pool.query(`ALTER TABLE tbl_orders ADD COLUMN order_type VARCHAR(20) DEFAULT 'takeaway'`);
        }
        
        if (!columnNames.includes('table_number')) {
            console.log("Adding column table_number...");
            await pool.query(`ALTER TABLE tbl_orders ADD COLUMN table_number VARCHAR(50)`);
        }
        
        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
