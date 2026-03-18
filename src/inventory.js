const { pool } = require("../initial");

// --- Ingredients Management ---

const getIngredients = async (store_id) => {
    try {
        if (!store_id || store_id === '0' || store_id === 0) return { status: 200, msg: [] };
        const queryStr = `SELECT * FROM tbl_ingredients WHERE store_id::text = $1::text ORDER BY name ASC`;
        const result = await pool.query(queryStr, [store_id]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getIngredients: ", error);
        return { status: 400, msg: error.message };
    }
};

const createIngredient = async (data) => {
    try {
        const queryStr = `
            INSERT INTO tbl_ingredients (store_id, name, unit, min_alert_level) 
            VALUES ($1, $2, $3, $4) RETURNING *`;
        const values = [data.store_id, data.name, data.unit, data.min_alert_level || 0];
        const result = await pool.query(queryStr, values);
        return { status: 200, msg: result.rows[0] };
    } catch (error) {
        console.error("Error createIngredient: ", error);
        return { status: 400, msg: error.message };
    }
};

const updateIngredient = async (data) => {
    try {
        if (!data.id || data.id === '0' || data.id === 0) return { status: 404, msg: "Ingredient not found" };
        const queryStr = `
            UPDATE tbl_ingredients 
            SET name = $1, unit = $2, min_alert_level = $3 
            WHERE id::text = $4::text RETURNING *`;
        const values = [data.name, data.unit, data.min_alert_level || 0, data.id];
        const result = await pool.query(queryStr, values);
        return { status: 200, msg: result.rows[0] };
    } catch (error) {
        console.error("Error updateIngredient: ", error);
        return { status: 400, msg: error.message };
    }
};

const deleteIngredient = async (id) => {
    try {
        if (!id || id === '0' || id === 0) return { status: 404, msg: "Not found" };
        await pool.query(`DELETE FROM tbl_ingredients WHERE id::text = $1::text`, [id]);
        return { status: 200, msg: "success" };
    } catch (error) {
        console.error("Error deleteIngredient: ", error);
        return { status: 400, msg: error.message };
    }
};

// --- Stock Transactions ---

const getStockTransactions = async (store_id) => {
    try {
        if (!store_id || store_id === '0' || store_id === 0) return { status: 200, msg: [] };
        // Only return transactions for ingredients belonging to this store
        const queryStr = `
            SELECT t.*, i.name as ingredient_name, i.unit 
            FROM tbl_stock_transactions t
            JOIN tbl_ingredients i ON t.ingredient_id = i.id
            WHERE i.store_id::text = $1::text
            ORDER BY t.created_at DESC
            LIMIT 100
        `;
        const result = await pool.query(queryStr, [store_id]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getStockTransactions: ", error);
        return { status: 400, msg: error.message };
    }
};

const createTransaction = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Insert Transaction
        const insertTxSql = `
            INSERT INTO tbl_stock_transactions (ingredient_id, type, quantity_changed, reason, created_by)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const txValues = [data.ingredient_id, data.type, data.quantity_changed, data.reason, data.created_by];
        const txResult = await client.query(insertTxSql, txValues);

        // 2. Update Ingredient Current Quantity
        // type: 'in' (+), 'out' (-), 'adjust' (sets absolute value, though we can calculate difference, or we pass delta)
        // Assume 'quantity_changed' is the positive or negative delta amount (e.g. +10 or -5) for simplicity.
        // Wait, if transaction type is 'in', we add. If 'out' or 'adjust-loss', we subtract.
        // To keep it simple, let's treat quantity_changed as exactly what to add (can be negative).
        const updateStockSql = `
            UPDATE tbl_ingredients 
            SET current_quantity = current_quantity + $1
            WHERE id::text = $2::text RETURNING current_quantity
        `;
        await client.query(updateStockSql, [data.quantity_changed, data.ingredient_id]);

        await client.query("COMMIT");
        return { status: 200, msg: txResult.rows[0] };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error createTransaction: ", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

// --- Recipes (BOM) ---

const getRecipe = async (product_id) => {
    try {
        if (!product_id || product_id === '0' || product_id === 0) return { status: 200, msg: [] };
        const queryStr = `
            SELECT r.*, i.name as ingredient_name, i.unit 
            FROM tbl_recipe_items r
            JOIN tbl_ingredients i ON r.ingredient_id = i.id
            WHERE r.product_id::text = $1::text
        `;
        const result = await pool.query(queryStr, [product_id]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getRecipe: ", error);
        return { status: 400, msg: error.message };
    }
};

const upsertRecipe = async (data) => {
    // data: { product_id, items: [{ ingredient_id, quantity_required }] }
    const client = await pool.connect();
    try {
        if (!data.product_id || data.product_id === '0' || data.product_id === 0) return { status: 400, msg: "Invalid product ID" };
        await client.query("BEGIN");

        await client.query(`DELETE FROM tbl_recipe_items WHERE product_id::text = $1::text`, [data.product_id]);

        if (data.items && data.items.length > 0) {
            for (let item of data.items) {
                await client.query(`
                    INSERT INTO tbl_recipe_items (product_id, ingredient_id, quantity_required)
                    VALUES ($1, $2, $3)
                `, [data.product_id, item.ingredient_id, item.quantity_required]);
            }
        }

        await client.query("COMMIT");
        return { status: 200, msg: "success" };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error upsertRecipe: ", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

module.exports = {
    getIngredients,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    getStockTransactions,
    createTransaction,
    getRecipe,
    upsertRecipe
};
