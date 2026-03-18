const { pool } = require("../initial");

// Helper to check if date range is more than 30 days
const isLongRange = (start, end) => {
    if (!start || !end) return false;
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = Math.abs(e - s);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 30;
};

// 1. Get Sales Summary (Total Revenue & Order Count)
const getSalesSummary = async (data) => {
    try {
        const { storeId, startDate, endDate } = data;
        if (!storeId || storeId === '0' || storeId === 0) {
            return { status: 200, msg: { totalOrders: 0, totalRevenue: 0 } };
        }

        let queryStr = `
            SELECT 
                COUNT(id) AS total_orders, 
                COALESCE(SUM(total_amount), 0) AS total_revenue 
            FROM tbl_orders 
            WHERE store_id::text = $1::text AND status != 'canceled'
        `;
        const params = [storeId];

        if (startDate && endDate) {
            queryStr += ` AND created_at BETWEEN $2 AND $3`;
            params.push(startDate, endDate);
        }

        const result = await pool.query(queryStr, params);

        return {
            status: 200,
            msg: {
                totalOrders: parseInt(result.rows[0].total_orders || 0, 10),
                totalRevenue: parseFloat(result.rows[0].total_revenue || 0)
            }
        };
    } catch (error) {
        console.error("Error getSalesSummary: ", error);
        return { status: 400, msg: error.message };
    }
};

// 2. Get Top Selling Items
const getTopSellingItems = async (data) => {
    try {
        const { storeId, startDate, endDate } = data;
        if (!storeId || storeId === '0' || storeId === 0) {
            return { status: 200, msg: [] };
        }

        let queryStr = `
            SELECT 
                p.name AS product_name, 
                p.image_url,
                SUM(oi.quantity) AS total_sold, 
                COALESCE(SUM(oi.quantity * oi.price_at_time_of_sale), 0) AS total_revenue
            FROM tbl_order_items oi
            JOIN tbl_orders o ON oi.order_id = o.id::text
            JOIN products p ON oi.product_id = p.id::text
            WHERE o.store_id::text = $1::text AND o.status != 'canceled'
        `;
        const params = [storeId];

        if (startDate && endDate) {
            queryStr += ` AND o.created_at BETWEEN $2 AND $3`;
            params.push(startDate, endDate);
        }

        queryStr += `
            GROUP BY p.id, p.name, p.image_url
            ORDER BY total_sold DESC
            LIMIT 5;
        `;

        const result = await pool.query(queryStr, params);

        const mappedItems = result.rows.map(row => ({
            productName: row.product_name,
            imageUrl: row.image_url,
            totalSold: parseInt(row.total_sold || 0, 10),
            totalRevenue: parseFloat(row.total_revenue || 0)
        }));

        return { status: 200, msg: mappedItems };
    } catch (error) {
        console.error("Error getTopSellingItems: ", error);
        return { status: 400, msg: error.message };
    }
};

// 3. Buy per Bill Dashboard
const getBuyPerBillDashboard = async (data) => {
    try {
        const { storeId, startDate, endDate } = data;
        const longRange = isLongRange(startDate, endDate);

        let queryStr = "";
        const params = [storeId, startDate, endDate];

        if (longRange) {
            // Group by Month
            queryStr = `
                SELECT 
                    TO_CHAR(created_at, 'YYYY-MM') as grouping_key,
                    MIN(TO_CHAR(created_at, 'DD/MM/YYYY')) as start_date,
                    MAX(TO_CHAR(created_at, 'DD/MM/YYYY')) as end_date,
                    COALESCE(SUM(subtotal), 0) as subtotal,
                    COALESCE(SUM(total_amount * 0.07 / 1.07), 0) as vat,
                    COALESCE(SUM(total_amount), 0) as total,
                    COUNT(id) as count
                FROM tbl_orders
                WHERE store_id::text = $1::text AND status != 'canceled'
                  AND created_at BETWEEN $2 AND $3
                GROUP BY grouping_key
                ORDER BY grouping_key DESC;
            `;
        } else {
            // Individual Bills
            queryStr = `
                SELECT 
                    id, 
                    created_at as grouping_key,
                    created_at,
                    total_amount as total,
                    subtotal,
                    discount_amount,
                    payment_method,
                    queue_number,
                    pos_ref_no
                FROM tbl_orders
                WHERE store_id::text = $1::text AND status != 'canceled'
                  AND created_at BETWEEN $2 AND $3
                ORDER BY created_at DESC;
            `;
        }

        const result = await pool.query(queryStr, params);
        return { status: 200, msg: { longRange, items: result.rows } };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

// 4. Product Sales Dashboard
const getProductSalesDashboard = async (data) => {
    try {
        const { storeId, startDate, endDate } = data;
        const longRange = isLongRange(startDate, endDate);

        let queryStr = "";
        const params = [storeId, startDate, endDate];

        if (longRange) {
            queryStr = `
                SELECT 
                    TO_CHAR(o.created_at, 'YYYY-MM') as grouping_key,
                    p.name,
                    p.name_eng,
                    SUM(oi.quantity) as total_qty,
                    SUM(oi.quantity * oi.price_at_time_of_sale) as total_amount
                FROM tbl_order_items oi
                JOIN tbl_orders o ON oi.order_id = o.id::text
                JOIN products p ON oi.product_id = p.id::text
                WHERE o.store_id::text = $1::text AND o.status != 'canceled'
                  AND o.created_at BETWEEN $2 AND $3
                GROUP BY grouping_key, p.id, p.name, p.name_eng
                ORDER BY grouping_key DESC, total_amount DESC;
            `;
        } else {
            queryStr = `
                SELECT 
                    p.name as grouping_key,
                    p.name,
                    p.name_eng,
                    SUM(oi.quantity) as total_qty,
                    SUM(oi.quantity * oi.price_at_time_of_sale) as total_amount
                FROM tbl_order_items oi
                JOIN tbl_orders o ON oi.order_id = o.id::text
                JOIN products p ON oi.product_id = p.id::text
                WHERE o.store_id::text = $1::text AND o.status != 'canceled'
                  AND o.created_at BETWEEN $2 AND $3
                GROUP BY p.id, p.name, p.name_eng
                ORDER BY total_amount DESC;
            `;
        }

        const result = await pool.query(queryStr, params);
        return { status: 200, msg: { longRange, items: result.rows } };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

// 5. Payment Dashboard
const getPaymentDashboard = async (data) => {
    try {
        const { storeId, startDate, endDate } = data;
        const longRange = isLongRange(startDate, endDate);

        let queryStr = "";
        const params = [storeId, startDate, endDate];

        if (longRange) {
            queryStr = `
                SELECT 
                    TO_CHAR(created_at, 'YYYY-MM') as grouping_key,
                    payment_method,
                    COUNT(id) as count,
                    SUM(total_amount) as total
                FROM tbl_orders
                WHERE store_id::text = $1::text AND status != 'canceled'
                  AND created_at BETWEEN $2 AND $3
                GROUP BY grouping_key, payment_method
                ORDER BY grouping_key DESC, total DESC;
            `;
        } else {
            queryStr = `
                SELECT 
                    payment_method as grouping_key,
                    payment_method,
                    COUNT(id) as count,
                    SUM(total_amount) as total
                FROM tbl_orders
                WHERE store_id::text = $1::text AND status != 'canceled'
                  AND created_at BETWEEN $2 AND $3
                GROUP BY payment_method
                ORDER BY total DESC;
            `;
        }

        const result = await pool.query(queryStr, params);
        return { status: 200, msg: { longRange, items: result.rows } };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getSalesSummary,
    getTopSellingItems,
    getBuyPerBillDashboard,
    getProductSalesDashboard,
    getPaymentDashboard
};
