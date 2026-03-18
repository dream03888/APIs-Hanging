const { pool } = require("../initial");

const startShift = async (data) => {
    try {
        if (!data.store_id || !data.user_id) {
            throw new Error("Missing Store ID or User ID");
        }
        const query = `
            INSERT INTO pos_shifts (store_id, user_id, opening_balance, status)
            VALUES ($1, $2, $3, 'open')
            RETURNING *;
        `;
        const values = [data.store_id, data.user_id, data.opening_balance || 0];
        const res = await pool.query(query, values);
        return { status: 200, msg: res.rows[0] };
    } catch (e) {
        console.error("Error startShift:", e);
        return { status: 400, msg: e.message };
    }
};

const getShiftSummary = async (shift_id) => {
    try {
        // 1. Get Shift and Store info
        const shiftQuery = `
            SELECT 
                s.*, 
                st.name as store_name,
                st.name_eng as store_name_eng,
                u.username as cashier_name
            FROM pos_shifts s
            LEFT JOIN stores st ON s.store_id = st.id
            LEFT JOIN tbl_users u ON s.user_id = u.user_id::text
            WHERE s.id = $1;
        `;
        const shiftRes = await pool.query(shiftQuery, [shift_id]);
        if (shiftRes.rows.length === 0) return { status: 404, msg: "Shift not found" };
        const shiftInfo = shiftRes.rows[0];

        // 2. Get Payment Method Breakdown
        const paymentQuery = `
            SELECT 
                payment_method, 
                COUNT(id) as count, 
                SUM(total_amount) as total
            FROM tbl_orders
            WHERE shift_id = $1 AND status = 'completed'
            GROUP BY payment_method;
        `;
        const paymentRes = await pool.query(paymentQuery, [shift_id]);
        const payments = paymentRes.rows;

        // 3. Get Product Category Summary
        // Note: Joining with product_menu_sets to find the category
        const categoryQuery = `
            SELECT 
                ms.name as category_name,
                SUM(oi.quantity) as total_qty,
                SUM(oi.quantity * oi.price_at_time_of_sale) as total_amount
            FROM tbl_order_items oi
            JOIN tbl_orders o ON oi.order_id = o.id::text
            JOIN products p ON oi.product_id = p.id::text
            LEFT JOIN menu_sets ms ON p.category_id = ms.id
            WHERE o.shift_id = $1 AND o.status = 'completed'
            GROUP BY ms.id, ms.name
            ORDER BY total_amount DESC;
        `;
        const categoryRes = await pool.query(categoryQuery, [shift_id]);
        const categories = categoryRes.rows.map(c => ({
            name: c.category_name || "Uncategorized",
            qty: Number(c.total_qty),
            amount: Number(c.total_amount)
        }));

        // 4. Get Addon Summary (Parsing from options_summary)
        // Since options_summary is a string "Option (+Price), ...", we might need a more structured approach if possible.
        // But for now, let's try to count how many items have non-empty options_summary
        const addonQuery = `
            SELECT 
                COUNT(*) as total_addons,
                SUM(0) as total_addon_amount -- Placeholder as price is usually bundled in price_at_time_of_sale
            FROM tbl_order_items oi
            JOIN tbl_orders o ON oi.order_id = o.id::text
            WHERE o.shift_id = $1 AND o.status = 'completed' AND oi.options_summary IS NOT NULL AND oi.options_summary != '';
        `;
        const addonRes = await pool.query(addonQuery, [shift_id]);
        const addons = addonRes.rows[0];

        // 5. Calculate overall totals
        const gross_sales = payments.reduce((sum, p) => sum + Number(p.total), 0);
        const order_count = payments.reduce((sum, p) => sum + Number(p.count), 0);
        
        // Sum of all discount_amount from tbl_orders
        const discountQuery = `
            SELECT 
                SUM(discount_amount) as total_discount,
                COALESCE(JSON_AGG(JSON_BUILD_OBJECT('name', tp.code, 'amount', o.discount_amount)) FILTER (WHERE o.promotion_id IS NOT NULL), '[]') as discount_list
            FROM tbl_orders o
            LEFT JOIN tbl_promotions tp ON o.promotion_id = tp.id
            WHERE o.shift_id = $1 AND o.status = 'completed';
        `;
        const discountRes = await pool.query(discountQuery, [shift_id]);
        const total_discount = Number(discountRes.rows[0].total_discount || 0);
        const discount_list = discountRes.rows[0].discount_list;

        const net_sales = gross_sales; // gross_sales in our tbl_orders usually means the final amount paid
        const vat_total = net_sales * 0.07 / 1.07; // Assumes price is inclusive
        const before_vat = net_sales - vat_total;

        return { 
            status: 200, 
            msg: {
                ...shiftInfo,
                gross_sales,
                net_sales,
                total_discount,
                discount_list,
                vat_total,
                before_vat,
                order_count,
                avg_per_bill: order_count > 0 ? (net_sales / order_count) : 0,
                payments,
                categories,
                addons: {
                    count: Number(addons.total_addons),
                    amount: Number(addons.total_addon_amount)
                }
            } 
        };
    } catch (e) {
        console.error("Error getShiftSummary:", e);
        return { status: 400, msg: e.message };
    }
};

const endShift = async (data) => {
    try {
        if (!data.shift_id) throw new Error("Missing Shift ID");
        const query = `
            UPDATE pos_shifts 
            SET end_time = CURRENT_TIMESTAMP, 
                closing_balance_actual = $1, 
                status = 'closed'
            WHERE id = $2
            RETURNING *;
        `;
        const values = [Number(data.closing_balance_actual || 0), data.shift_id];
        const res = await pool.query(query, values);
        return { status: 200, msg: res.rows[0] };
    } catch (e) {
        console.error("Error endShift:", e);
        return { status: 400, msg: e.message };
    }
};

const getCurrentShift = async (store_id) => {
    try {
        const query = `
            SELECT * FROM pos_shifts 
            WHERE store_id = $1 AND status = 'open' 
            ORDER BY start_time DESC LIMIT 1;
        `;
        const res = await pool.query(query, [store_id]);
        return { status: 200, msg: res.rows[0] || null };
    } catch (e) {
        console.error("Error getCurrentShift:", e);
        return { status: 400, msg: e.message };
    }
}

module.exports = {
    startShift,
    getShiftSummary,
    endShift,
    getCurrentShift
};
