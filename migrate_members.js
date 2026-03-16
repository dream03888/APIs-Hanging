const { Pool } = require("pg");
const pool = new Pool({
    user: 'postgres',
    password: 'dream039',
    database: 'Safari-Pos',
    host: '10.0.0.100',
    port: 5432,
});

const migrate = async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Member Groups Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_member_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                discount_pct NUMERIC DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert a default group if none exists
        const groupCount = await client.query("SELECT count(*) FROM tbl_member_groups");
        if (parseInt(groupCount.rows[0].count) === 0) {
            await client.query("INSERT INTO tbl_member_groups (name, discount_pct) VALUES ($1, $2)", ['General Member', 0]);
        }

        // 2. Members Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_members (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                member_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                group_id UUID REFERENCES tbl_member_groups(id) ON DELETE SET NULL,
                points NUMERIC DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Member Transactions Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tbl_member_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                member_id UUID NOT NULL REFERENCES tbl_members(id) ON DELETE CASCADE,
                type TEXT NOT NULL, -- 'EARN', 'REDEEM', 'ADJUST'
                points NUMERIC NOT NULL,
                order_id UUID,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query("COMMIT");
        console.log("Migration successful: Member tables created.");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", e);
    } finally {
        client.release();
        pool.end();
    }
};

migrate();
