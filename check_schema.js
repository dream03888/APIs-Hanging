const { pool } = require('./initial');

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tbl_order_items' OR table_name = 'tbl_orders';
        `);
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

checkSchema();
