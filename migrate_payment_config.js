const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
});

async function migratePaymentConfig() {
  try {
    console.log("Starting Payment Config migration...");

    // 1. Create tbl_payment_configs
    // Key: value pair for global settings (e.g. 'PAYMENT_METHODS', 'KIOSK_PRINT_RECEIPT')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_payment_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("- Table tbl_payment_configs created.");

    // 2. Insert default payment methods configuration
    const defaultMethods = [
      { id: 'CASH', name: 'Cash', enabled: true, icon: 'banknote' },
      { id: 'PROMPTPAY', name: 'PromptPay (QR)', enabled: true, icon: 'qr-code' },
      { id: 'CREDIT_CARD', name: 'Credit Card', enabled: true, icon: 'credit-card' },
      { id: 'MEMBER_POINTS', name: 'Member Points', enabled: false, icon: 'star' }
    ];

    await pool.query(
      `INSERT INTO tbl_payment_configs (config_key, config_value, description) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2`,
      ['PAYMENT_METHODS', JSON.stringify(defaultMethods), 'Available payment methods for the Kiosk']
    );
    console.log("- Default Payment Methods config inserted.");

    console.log("Migration successful: Payment Config tables created.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
    process.exit();
  }
}

migratePaymentConfig();
