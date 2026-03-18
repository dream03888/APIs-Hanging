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
        console.log("Checking menu_sets table schema...");
        const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_sets'`);
        const columnNames = columns.rows.map(c => c.column_name);
        
        if (!columnNames.includes('sort_order')) {
            console.log("Adding column sort_order (INTEGER)...");
            await pool.query(`ALTER TABLE menu_sets ADD COLUMN sort_order INTEGER DEFAULT 0`);
        }
        
        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
