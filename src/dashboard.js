const { pool } = require("../initial");

// 1. Get Sales Summary (Total Revenue & Order Count)
const getSalesSummary = async (store_id) => {
    try {
        const queryStr = `
            SELECT 
                COUNT(id) AS total_orders, 
                COALESCE(SUM(total_amount), 0) AS total_revenue 
            FROM tbl_orders 
            WHERE store_id = $1 AND status != 'canceled'
        `;
        const result = await pool.query(queryStr, [store_id]);

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
const getTopSellingItems = async (store_id) => {
    try {
        const queryStr = `
            SELECT 
                p.name AS product_name, 
                p.image_url,
                SUM(oi.quantity) AS total_sold, 
                COALESCE(SUM(oi.quantity * oi.price_at_time_of_sale), 0) AS total_revenue
            FROM tbl_order_items oi
            JOIN tbl_orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE o.store_id = $1 AND o.status != 'canceled'
            GROUP BY p.id, p.name, p.image_url
            ORDER BY total_sold DESC
            LIMIT 5;
        `;
        const result = await pool.query(queryStr, [store_id]);

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

module.exports = {
    getSalesSummary,
    getTopSellingItems
};
