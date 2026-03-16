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
        console.log("Checking stores table schema...");
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'stores'`);
        const columnNames = columns.rows.map(c => c.column_name);
        
        if (!columnNames.includes('allow_tables')) {
            console.log("Adding column allow_tables...");
            await pool.query(`ALTER TABLE stores ADD COLUMN allow_tables BOOLEAN DEFAULT FALSE`);
        }
        
        if (!columnNames.includes('table_count')) {
            console.log("Adding column table_count...");
            await pool.query(`ALTER TABLE stores ADD COLUMN table_count INTEGER DEFAULT 0`);
        }
        
        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
