const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    port: Number(process.env.PG_PORT || 5432),
});

async function check() {
    const res = await pool.query("SELECT id, name, store_id FROM products WHERE store_id = '00000000-0000-0000-0000-000000000000'");
    console.log("Master Products Count:", res.rowCount);
    console.log(res.rows);
    process.exit();
}

check();
