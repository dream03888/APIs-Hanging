const { pool } = require("../initial");

const getMembers = async (filters = {}) => {
    try {
        let sql = `
            SELECT m.*, mg.name as group_name 
            FROM tbl_members m
            LEFT JOIN tbl_member_groups mg ON m.group_id = mg.id
            WHERE 1=1
        `;
        const values = [];
        
        if (filters.search) {
            values.push(`%${filters.search}%`);
            sql += ` AND (m.name ILIKE $${values.length} OR m.member_code ILIKE $${values.length} OR m.phone ILIKE $${values.length})`;
        }
        
        if (filters.group_id) {
            values.push(filters.group_id);
            sql += ` AND m.group_id = $${values.length}`;
        }

        sql += " ORDER BY m.created_at DESC";
        
        const result = await pool.query(sql, values);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getMembers:", error);
        return { status: 400, msg: error.message };
    }
};

const getMemberGroups = async () => {
    try {
        const result = await pool.query("SELECT * FROM tbl_member_groups ORDER BY name ASC");
        return { status: 200, msg: result.rows };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const upsertMember = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let result;
        if (data.id) {
            // Update
            result = await client.query(
                `UPDATE tbl_members SET name=$1, phone=$2, email=$3, group_id=$4, member_code=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
                [data.name, data.phone, data.email, data.group_id, data.member_code, data.is_active !== false, data.id]
            );
        } else {
            // Insert
            result = await client.query(
                `INSERT INTO tbl_members (name, phone, email, group_id, member_code, points) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [data.name, data.phone, data.email, data.group_id, data.member_code, data.points || 0]
            );
        }
        await client.query("COMMIT");
        return { status: 200, msg: "success", data: result.rows[0] };
    } catch (error) {
        await client.query("ROLLBACK");
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const upsertMemberGroup = async (data) => {
    try {
        let result;
        if (data.id) {
            result = await pool.query(
                `UPDATE tbl_member_groups SET name=$1, discount_pct=$2 WHERE id=$3 RETURNING *`,
                [data.name, data.discount_pct, data.id]
            );
        } else {
            result = await pool.query(
                `INSERT INTO tbl_member_groups (name, discount_pct) VALUES ($1, $2) RETURNING *`,
                [data.name, data.discount_pct]
            );
        }
        return { status: 200, msg: "success", data: result.rows[0] };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const deleteMember = async (id) => {
    try {
        await pool.query("DELETE FROM tbl_members WHERE id = $1", [id]);
        return { status: 200, msg: "success" };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const getMemberTransactions = async (memberId) => {
    try {
        const result = await pool.query(
            "SELECT * FROM tbl_member_transactions WHERE member_id = $1 ORDER BY created_at DESC",
            [memberId]
        );
        return { status: 200, msg: result.rows };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const adjustPoints = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // 1. Log transaction
        await client.query(
            `INSERT INTO tbl_member_transactions (member_id, type, points, description) VALUES ($1, $2, $3, $4)`,
            [data.member_id, data.type || 'ADJUST', data.points, data.description || 'Manual adjustment']
        );
        // 2. Update member points
        const result = await client.query(
            `UPDATE tbl_members SET points = points + $1 WHERE id = $2 RETURNING points`,
            [data.points, data.member_id]
        );
        await client.query("COMMIT");
        return { status: 200, msg: "Points adjusted", newPoints: result.rows[0].points };
    } catch (error) {
        await client.query("ROLLBACK");
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const getMemberByCode = async (code) => {
    try {
        const result = await pool.query(`
            SELECT m.*, mg.name as group_name, mg.discount_pct
            FROM tbl_members m
            LEFT JOIN tbl_member_groups mg ON m.group_id = mg.id
            WHERE m.member_code = $1 AND m.is_active = TRUE
        `, [code]);
        if (result.rows.length === 0) return { status: 404, msg: "ไม่พบข้อมูลสมาชิก" };
        return { status: 200, msg: "Found", data: result.rows[0] };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getMembers,
    getMemberGroups,
    upsertMember,
    upsertMemberGroup,
    deleteMember,
    getMemberTransactions,
    adjustPoints,
    getMemberByCode
};
