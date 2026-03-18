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
        console.log("Creating missing tables...");
        
        // Create menu_sets
        await pool.query(`
            CREATE TABLE IF NOT EXISTS menu_sets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id UUID NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Table menu_sets created/verified.");

        // Create menu_sets_items
        await pool.query(`
            CREATE TABLE IF NOT EXISTS menu_sets_items (
                id SERIAL PRIMARY KEY,
                menu_set_id UUID REFERENCES menu_sets(id) ON DELETE CASCADE,
                product_id UUID NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Table menu_sets_items created/verified.");
        
        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
