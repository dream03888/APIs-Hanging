const { pool } = require("../initial");

// --- Credit Card Companies ---
const getCreditCardCompanies = async () => {
    try {
        const result = await pool.query("SELECT * FROM tbl_credit_card_companies ORDER BY name ASC");
        return { status: 200, msg: result.rows };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const upsertCreditCardCompany = async (data) => {
    try {
        let result;
        if (data.id) {
            result = await pool.query(
                `UPDATE tbl_credit_card_companies SET name=$1, fee_pct=$2, is_active=$3, address=$4, contact_name=$5, email=$6, phone=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
                [data.name, data.fee_pct || 0, data.is_active !== false, data.address, data.contact_name, data.email, data.phone, data.id]
            );
        } else {
            result = await pool.query(
                `INSERT INTO tbl_credit_card_companies (name, fee_pct, is_active, address, contact_name, email, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [data.name, data.fee_pct || 0, data.is_active !== false, data.address, data.contact_name, data.email, data.phone]
            );
        }
        return { status: 200, msg: "success", data: result.rows[0] };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const deleteCreditCardCompany = async (id) => {
    try {
        await pool.query("DELETE FROM tbl_credit_card_companies WHERE id = $1", [id]);
        return { status: 200, msg: "success" };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

// --- Payment Configuration ---
const getPaymentConfigs = async () => {
    try {
        const result = await pool.query("SELECT * FROM tbl_payment_configs");
        return { status: 200, msg: result.rows };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const updatePaymentConfig = async (data, io) => {
    try {
        const result = await pool.query(
            `INSERT INTO tbl_payment_configs (config_key, config_value, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW() 
             RETURNING *`,
            [data.config_key, JSON.stringify(data.config_value)]
        );
        
        // Broadcast moved to triggerPaymentSync
        return { status: 200, msg: "success", data: result.rows[0] };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

const triggerPaymentSync = async (io) => {
    try {
        const result = await pool.query("SELECT * FROM tbl_payment_configs");
        if (io) {
            // Send each config key to kiosks
            result.rows.forEach(row => {
                io.emit("payment_config_updated", row);
            });
        }
        return { status: 200, msg: "sync_triggered" };
    } catch (error) {
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getCreditCardCompanies,
    upsertCreditCardCompany,
    deleteCreditCardCompany,
    getPaymentConfigs,
    updatePaymentConfig,
    triggerPaymentSync
};
