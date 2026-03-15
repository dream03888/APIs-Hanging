const { pool } = require("../initial");

/**
 * Places a new order from the Kiosk
 * @param {Object} data 
 * {
 *   storeId: string,
 *   posRefNo: string,
 *   paymentMethod: string,
 *   totalAmount: number,
 *   items: [
 *     { cartItemId: string, productId: string, name: string, price: number, qty: number, options: [...] }
 *   ]
 * }
 */
const submitOrder = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Check if store exists (ignore stock check for now, keep it simple first)
        const storeIdStr = data.storeId || data.store_id || "";
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(storeIdStr)) {
            throw new Error(`Invalid Store ID format (expected UUID, got: ${storeIdStr})`);
        }

        const storeRes = await client.query(`SELECT id, name FROM stores WHERE id = $1`, [storeIdStr]);
        if (storeRes.rows.length === 0) {
            throw new Error("Store not found");
        }

        // 2. Generate Daily Queue Number (Starts from 1 every day per store)
        // Check highest queue number for this store today
        const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
        const queueRes = await client.query(`
            SELECT MAX(queue_number) as max_q 
            FROM tbl_orders 
            WHERE store_id = $1 AND DATE(created_at) = CURRENT_DATE
        `, [storeIdStr]);

        let nextQueueNo = 1;
        if (queueRes.rows[0].max_q !== null) {
            nextQueueNo = Number(queueRes.rows[0].max_q) + 1;
        }

        // 3. Insert main order
        const insertOrderSql = `
            INSERT INTO tbl_orders (store_id, total_amount, status, pos_ref_no, payment_method, queue_number, subtotal, discount_amount, promotion_id)
            VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7, $8) RETURNING id, queue_number
        `;
        const orderParams = [
            storeIdStr,
            data.totalAmount,
            data.posRefNo || 'UNKNOWN',
            data.paymentMethod || 'UNKNOWN',
            nextQueueNo,
            data.subtotal || data.totalAmount,
            data.discount_amount || 0,
            data.promotion_id || null
        ];

        const orderRes = await client.query(insertOrderSql, orderParams);
        const orderId = orderRes.rows[0].id;
        const assignedQueueNum = orderRes.rows[0].queue_number;

        // 4. Insert order items
        if (data.items && data.items.length > 0) {
            console.log("Items to insert:", data.items);
            for (let item of data.items) {
                // Formatting options into string if it exists
                let optSummary = '';
                if (item.options && Array.isArray(item.options) && item.options.length > 0) {
                    optSummary = item.options.map(o => {
                        const priceAdd = (o.priceDelta && o.priceDelta > 0) ? ` (+${o.priceDelta})` : '';
                        return `${o.name}${priceAdd}`;
                    }).join(', ');
                }

                const itemPrice = item.price || 0;
                const qty = item.qty || item.quantity || 1;
                const pId = item.productId || item.product_id;

                const insertItemSql = `
                    INSERT INTO tbl_order_items (order_id, product_id, quantity, price_at_time_of_sale, options_summary)
                    VALUES ($1, $2, $3, $4, $5)
                `;
                await client.query(insertItemSql, [orderId, pId, qty, itemPrice, optSummary]);
            }
        }

        // 5. Increment Promotion Used Count
        if (data.promotion_id) {
            await client.query(`
                UPDATE tbl_promotions 
                SET used_count = used_count + 1 
                WHERE id = $1
            `, [data.promotion_id]);
        }

        await client.query("COMMIT");
        return {
            status: 200,
            msg: {
                order_id: orderId,
                queue_number: assignedQueueNum,
                pos_ref_no: data.posRefNo,
                success: true
            }
        };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error submitOrder: ", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const getOrderDetails = async (orderId) => {
    const queryOrder = `
        SELECT o.*, s.name as store_name 
        FROM tbl_orders o
        LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.id = $1
    `;
    const queryItems = `
        SELECT oi.*, p.name, p.name_eng 
        FROM tbl_order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
    `;
    try {
        const orderRes = await pool.query(queryOrder, [orderId]);
        if (orderRes.rows.length === 0) return { status: 404, msg: "Order not found" };

        const itemsRes = await pool.query(queryItems, [orderId]);
        const order = orderRes.rows[0];
        order.items = itemsRes.rows;

        return { status: 200, msg: order };
    } catch (error) {
        console.error("Error getOrderDetails:", error);
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    submitOrder,
    getOrderDetails
};
