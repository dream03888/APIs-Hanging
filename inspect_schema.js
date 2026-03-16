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
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
        const tableList = tables.rows.map(r => r.table_name);
        console.log("Tables:", tableList.join(', '));
        
        // Check for existing member or payment related tables
        const relevantTables = tableList.filter(t => t.includes('member') || t.includes('card') || t.includes('payment') || t.includes('config'));
        
        for (const table of relevantTables) {
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
