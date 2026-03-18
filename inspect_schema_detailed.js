const { Pool } = require("pg");
const pool = new Pool({
    user: 'postgres',
    password: 'dream039',
    database: 'Safari-Pos',
    host: '10.0.0.100',
    port: 5432,
});

const checkDatabase = async () => {
    try {
        const tableList = ['tbl_orders', 'tbl_order_items', 'pos_shifts', 'products'];
        
        for (const table of tableList) {
            const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
            console.log(`\nTable: ${table}`);
            columns.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
checkDatabase();
