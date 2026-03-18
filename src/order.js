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

        const storeRes = await client.query(`SELECT id, name, store_code FROM stores WHERE id = $1`, [storeIdStr]);
        if (storeRes.rows.length === 0) {
            throw new Error("Store not found");
        }
        const storeCode = storeRes.rows[0].store_code || "POS";

        // 2. Generate Daily Queue Number (Starts from 1 every day per store)
        // Check highest queue number for this store today
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const timestampStr = `${year}${month}${day}${hour}${minute}${second}`;
        
        // Final Invoice Number format: [STORE_CODE]-[YYYYMMDDHHMMSS]
        const invoiceNo = `${storeCode}-${timestampStr}`;

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
            INSERT INTO tbl_orders (store_id, total_amount, status, pos_ref_no, payment_method, queue_number, subtotal, discount_amount, promotion_id, order_type, table_number, shift_id)
            VALUES ($1, $2, 'completed', $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, queue_number
        `;
        const orderParams = [
            storeIdStr,
            data.totalAmount || data.total_amount,
            invoiceNo, // Use the new generated invoice number
            data.paymentMethod || data.payment_method || 'CASH',
            nextQueueNo,
            data.subtotal || data.sub_total || data.totalAmount || data.total_amount,
            data.discount_amount || 0,
            data.promotion_id || data.promo_id || null,
            data.orderType || data.order_type || 'takeaway',
            data.tableNumber || data.table_number || null,
            data.shiftId || data.shift_id || null
        ];

        const orderRes = await client.query(insertOrderSql, orderParams);
        const orderId = orderRes.rows[0].id;
        const assignedQueueNum = orderRes.rows[0].queue_number;

        // 4. Insert order items
        if (data.items && data.items.length > 0) {
            console.log("Items to insert:", data.items);
            for (let item of data.items) {
                // Formatting options into string if it exists
                // Use provided summary or format from options array
                let optSummary = item.optionsSummary || '';
                if (!optSummary && item.options && Array.isArray(item.options) && item.options.length > 0) {
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

                // --- Stock Reduction ---
                // 1. Direct Product Stock (1-to-1)
                const productRes = await client.query(`SELECT is_stock_tracked, stock_quantity FROM products WHERE id = $1`, [pId]);
                if (productRes.rows.length > 0) {
                    const prod = productRes.rows[0];
                    if (prod.is_stock_tracked) {
                        await client.query(`
                            UPDATE products 
                            SET stock_quantity = stock_quantity - $1 
                            WHERE id = $2
                        `, [qty, pId]);
                    }
                }

                // 2. Bill of Materials (BOM) / Ingredients
                const recipeRes = await client.query(`
                    SELECT ingredient_id, quantity_required 
                    FROM tbl_recipe_items 
                    WHERE product_id = $1
                `, [pId]);
                
                if (recipeRes.rows.length > 0) {
                    for (let recipe of recipeRes.rows) {
                        const totalReq = recipe.quantity_required * qty;
                        await client.query(`
                            UPDATE tbl_ingredients 
                            SET current_quantity = current_quantity - $1 
                            WHERE id = $2
                        `, [totalReq, recipe.ingredient_id]);
                        
                        // Optional: Create a stock transaction record for transparency
                        await client.query(`
                            INSERT INTO tbl_stock_transactions (ingredient_id, type, quantity_changed, reason)
                            VALUES ($1, 'out', $2, $3)
                        `, [recipe.ingredient_id, -totalReq, `Order ${invoiceNo}`]);
                    }
                }
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
    placeOrder: submitOrder, // Alias to support different socket events
    getOrderDetails
};
