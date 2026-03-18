const { pool } = require("../initial");

/**
 * Get or register a terminal by MAC/IP
 */
const getTerminal = async (data) => {
    try {
        const { mac, ip, store_id, terminal_name } = data;
        
        // Search by MAC first (most unique)
        let queryStr = `SELECT * FROM terminals WHERE mac_address = $1 AND store_id = $2`;
        let result = await pool.query(queryStr, [mac, store_id]);

        if (result.rows.length > 0) {
            // Update last seen and IP if changed
            await pool.query(
                `UPDATE terminals SET last_seen_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE id = $2`,
                [ip, result.rows[0].id]
            );
            return { status: 200, msg: result.rows[0] };
        }

        // If not found, register it
        const insertSql = `
            INSERT INTO terminals (store_id, name, mac_address, ip_address)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const insertResult = await pool.query(insertSql, [
            store_id,
            terminal_name || `POS-${mac.slice(-4)}`,
            mac,
            ip || null
        ]);

        return { status: 201, msg: insertResult.rows[0] };
    } catch (error) {
        console.error("Error getTerminal: ", error);
        return { status: 400, msg: error.message };
    }
};

/**
 * Update terminal hardware config
 */
const updateTerminalConfig = async (data) => {
    try {
        const { id, hardware_config, terminal_name } = data;
        
        const updateSql = `
            UPDATE terminals 
            SET hardware_config = $1, 
                name = COALESCE($2, name),
                last_seen_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *;
        `;
        const result = await pool.query(updateSql, [JSON.stringify(hardware_config), terminal_name, id]);

        if (result.rows.length === 0) {
            return { status: 404, msg: "Terminal not found" };
        }

        return { status: 200, msg: "Configuration updated", data: result.rows[0] };
    } catch (error) {
        console.error("Error updateTerminalConfig: ", error);
        return { status: 400, msg: error.message };
    }
};

/**
 * Get all terminals for a store (Admin usage)
 */
const getStoreTerminals = async (store_id) => {
    try {
        const result = await pool.query(`SELECT * FROM terminals WHERE store_id = $1 ORDER BY last_seen_at DESC`, [store_id]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getTerminal,
    updateTerminalConfig,
    getStoreTerminals
};
