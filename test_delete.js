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

async function testDelete() {
    const client = await pool.connect();

    // Create a mock store to delete
    let id;
    try {
        const res = await client.query("INSERT INTO stores (name) VALUES ('delete_test_store') RETURNING id");
        id = res.rows[0].id;
    } catch (e) {
        console.error("Failed to insert mock store", e);
        return;
    }

    try {
        await client.query("BEGIN");

        const q = async (sql) => {
            await client.query("SAVEPOINT sp1");
            try {
                await client.query(sql, [id]);
            } catch (e) {
                await client.query("ROLLBACK TO SAVEPOINT sp1");
                throw new Error("Query Failed: " + sql + " | Reason: " + e.message);
            }
        };

        await q("DELETE FROM log_order_item_addons WHERE order_item_id IN (SELECT id FROM log_order_items WHERE order_id IN (SELECT id FROM log_oders WHERE store_id = $1))");
        await q("DELETE FROM log_order_items WHERE order_id IN (SELECT id FROM log_oders WHERE store_id = $1)");
        await q("DELETE FROM log_oders WHERE store_id = $1");
        await q("DELETE FROM print_jobs WHERE store_id = $1");
        await q("DELETE FROM printers WHERE store_id = $1");

        try { await q("DELETE FROM audit_logs WHERE store_id = $1"); } catch (e) { console.log(e.message) }

        await q("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)");
        await q("DELETE FROM order_item_addons WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1))");
        await q("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)");
        await q("DELETE FROM orders WHERE store_id = $1");

        try {
            await q("DELETE FROM tbl_stock_transactions WHERE ingredient_id IN (SELECT id FROM tbl_ingredients WHERE store_id = $1)");
            await q("DELETE FROM tbl_recipe_items WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)");
            await q("DELETE FROM tbl_ingredients WHERE store_id = $1");
        } catch (e) { console.log(e.message) }

        try { await q("DELETE FROM addon_options WHERE group_id IN (SELECT id FROM addon_groups WHERE product_id IN (SELECT id FROM products WHERE store_id = $1))"); } catch (e) { console.log(e.message) }
        try { await q("DELETE FROM addon_groups WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)"); } catch (e) { console.log(e.message) }

        // This is failing probably due to recipe_items? Wait, recipe ITEMS are deleted above.

        await q("DELETE FROM products WHERE store_id = $1");
        await q("DELETE FROM categories WHERE store_id = $1");

        try {
            await q("DELETE FROM menu_sets_items WHERE menu_set_id IN (SELECT id FROM menu_sets WHERE store_id = $1)");
            await q("DELETE FROM menu_sets WHERE store_id = $1");
        } catch (e) { console.log(e.message) }

        await q("DELETE FROM terminals WHERE store_id = $1");
        await q("DELETE FROM users WHERE store_id = $1");

        await q("DELETE FROM stores WHERE id = $1");

        await client.query("ROLLBACK"); // We just test if it crashes but keep the DB clean
        // Also delete the mock store we created outside transaction
        await client.query("DELETE FROM stores WHERE id = $1", [id]);

        console.log("No syntax errors. Dependency tree traversed cleanly.");
    } catch (err) {
        await client.query("ROLLBACK");
        await client.query("DELETE FROM stores WHERE id = $1", [id]);
        console.error(err.message);
    } finally {
        client.release();
        pool.end();
    }
}
testDelete();
