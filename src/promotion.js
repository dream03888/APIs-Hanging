const { pool } = require("../initial");

const getPromotions = async (store_id) => {
    try {
        const queryStr = `SELECT * FROM tbl_promotions ORDER BY created_at DESC`;
        const result = await pool.query(queryStr);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getPromotions:", error);
        return { status: 400, msg: error.message };
    }
};

const createPromotion = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const queryStr = `
            INSERT INTO tbl_promotions (code, type, value, is_active, start_date, end_date, target_type, usage_limit)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
        `;
        const values = [
            data.code.toUpperCase(),
            data.type,
            data.value,
            data.is_active !== undefined ? data.is_active : true,
            data.start_date || null,
            data.end_date || null,
            data.target_type || 'product',
            data.usage_limit || null
        ];
        const result = await client.query(queryStr, values);
        const newPromo = result.rows[0];

        // If specific products are selected, link them
        if (data.target_type === 'product' && data.product_ids && data.product_ids.length > 0) {
            await client.query(
                `UPDATE products SET promotion_id = $1 WHERE id = ANY($2)`,
                [newPromo.id, data.product_ids]
            );
        }

        await client.query("COMMIT");
        return { status: 200, msg: "Promotion created successfully", data: newPromo };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error createPromotion:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const updatePromotion = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const queryStr = `
            UPDATE tbl_promotions 
            SET code = $1, type = $2, value = $3, is_active = $4, start_date = $5, end_date = $6, target_type = $7, usage_limit = $8
            WHERE id = $9 RETURNING *;
        `;
        const values = [
            data.code.toUpperCase(),
            data.type,
            data.value,
            data.is_active,
            data.start_date || null,
            data.end_date || null,
            data.target_type || 'product',
            data.usage_limit || null,
            data.id
        ];
        const result = await client.query(queryStr, values);
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return { status: 404, msg: "Promotion not found" };
        }
        const updatedPromo = result.rows[0];

        // Manage product links:
        // 1. Clear existing links for this promotion
        await client.query(`UPDATE products SET promotion_id = NULL WHERE promotion_id = $1`, [data.id]);

        // 2. If target_type is product and IDs are provided, link new ones
        if (data.target_type === 'product' && data.product_ids && data.product_ids.length > 0) {
            await client.query(
                `UPDATE products SET promotion_id = $1 WHERE id = ANY($2)`,
                [data.id, data.product_ids]
            );
        }

        await client.query("COMMIT");
        return { status: 200, msg: "Promotion updated successfully", data: updatedPromo };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error updatePromotion:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const deletePromotion = async (data) => {
    try {
        // Only require the promotion ID, not the store ID
        const promoId = typeof data === 'object' ? data.id : data;
        const queryStr = `DELETE FROM tbl_promotions WHERE id = $1`;
        const result = await pool.query(queryStr, [promoId]);
        if (result.rowCount === 0) return { status: 404, msg: "Promotion not found" };
        return { status: 200, msg: "Promotion deleted successfully" };
    } catch (error) {
        console.error("Error deletePromotion:", error);
        return { status: 400, msg: error.message };
    }
};

const validatePromotion = async (data) => {
    try {
        const code = data.code.toUpperCase();

        // 1. Basic check for existence and activity
        const queryBasic = `SELECT * FROM tbl_promotions WHERE code = $1`;
        const resBasic = await pool.query(queryBasic, [code]);

        if (resBasic.rows.length === 0) {
            return { status: 404, msg: "Invalid promotion code" };
        }

        const promo = resBasic.rows[0];

        if (!promo.is_active) {
            return { status: 403, msg: "Promotion is currently inactive" };
        }

        // 2. Date checks
        const now = new Date();
        if (promo.start_date && new Date(promo.start_date) > now) {
            return { status: 403, msg: "Promotion has not started yet" };
        }
        if (promo.end_date && new Date(promo.end_date) < now) {
            return { status: 410, msg: "Promotion has expired" };
        }

        // 3. Usage limit check
        if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
            return { status: 403, msg: "Usage limit reached for this promotion" };
        }

        // 4. If target_type is product, fetch associated product IDs from the products table
        if (promo.target_type === 'product') {
            const productRes = await pool.query(`SELECT id FROM products WHERE promotion_id = $1`, [promo.id]);
            promo.product_ids = productRes.rows.map(r => r.id);
        }

        return { status: 200, msg: "Promotion is valid", data: promo };
    } catch (error) {
        console.error("Error validatePromotion:", error);
        return { status: 400, msg: error.message };
    }
};

const getPromotionUsage = async (promotionId) => {
    const queryStr = `
        SELECT 
            o.id,
            o.pos_ref_no,
            o.order_date,
            o.total_amount,
            o.subtotal,
            o.discount_amount,
            o.payment_method,
            o.order_status,
            s.name as store_name
        FROM tbl_orders o
        LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.promotion_id = $1
        ORDER BY o.order_date DESC;
    `;
    try {
        const result = await pool.query(queryStr, [promotionId]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getPromotionUsage:", error);
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    validatePromotion,
    getPromotionUsage
};


// module.exports = {
//     getPromotions,
//     createPromotion,
//     updatePromotion,
//     deletePromotion,
//     validatePromotion,
//     getPromotionUsage,
//     togglePromotion,
//     getPromotionById
// };
