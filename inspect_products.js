const { Pool } = require("pg");
const pool = new Pool({
    user: 'postgres',
    password: 'dream039',
    database: 'Safari-Pos',
    host: '10.0.0.100',
    port: 5432,
});

const inspect = async () => {
    try {
        console.log("Inspecting products table schema...");
        const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'`);
        console.log(JSON.stringify(columns.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
inspect();
