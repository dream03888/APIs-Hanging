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
        const query = `
            SELECT 
                s.id, s.opening_balance, s.start_time,
                COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'cash'), 0) as cash_sales,
                COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'credit'), 0) as credit_sales,
                COALESCE(SUM(o.total_amount), 0) as total_sales,
                COUNT(o.id) as order_count
            FROM pos_shifts s
            LEFT JOIN tbl_orders o ON s.id = o.shift_id
            WHERE s.id = $1
            GROUP BY s.id;
        `;
        const res = await pool.query(query, [shift_id]);
        if (res.rows.length === 0) return { status: 404, msg: "Shift not found" };
        return { status: 200, msg: res.rows[0] };
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
        const values = [data.closing_balance_actual, data.shift_id];
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
