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
pool.query("SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'addon_groups'").then(res => { console.table(res.rows); pool.end(); }).catch(console.error);
