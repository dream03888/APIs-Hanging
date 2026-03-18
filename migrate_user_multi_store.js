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
        console.log("Checking tbl_users table schema...");
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tbl_users'`);
        const columnNames = columns.rows.map(c => c.column_name);
        
        if (!columnNames.includes('store_ids')) {
            console.log("Adding column store_ids (JSONB)...");
            await pool.query(`ALTER TABLE tbl_users ADD COLUMN store_ids JSONB DEFAULT '[]'::jsonb`);
        }
        
        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
