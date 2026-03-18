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
        
        // Add name_en
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='menu_sets' AND column_name='name_en') THEN
                    ALTER TABLE menu_sets ADD COLUMN name_en TEXT;
                    RAISE NOTICE 'Column name_en added to menu_sets';
                END IF;
            END $$;
        `);

        console.log("Migration complete.");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
migrate();
