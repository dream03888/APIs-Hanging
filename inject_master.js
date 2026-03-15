const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = new Pool({
    host: process.env.PG_HOST, user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DATABASE, port: Number(process.env.PG_PORT || 5432),
});
pool.query(`
    INSERT INTO stores (id, name, description) 
    VALUES ('00000000-0000-0000-0000-000000000000', 'MASTER_CATALOG', 'System Master Catalog') 
    ON CONFLICT (id) DO NOTHING;
`).then(() => {
    console.log("Master store injected.");
    pool.end();
}).catch(console.error);
