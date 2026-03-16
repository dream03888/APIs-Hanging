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

async function migrateCreditCards() {
  try {
    console.log("Starting Credit Card migration...");
    // Check if env loaded
    if (!process.env.PG_DATABASE) {
        throw new Error("Environment variables not loaded correctly. Check .env path.");
    }

    // 1. Create tbl_credit_card_companies
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_credit_card_companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        fee_pct DECIMAL(5,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("- Table tbl_credit_card_companies check/creation done.");

    // Add new columns if they don't exist
    await pool.query(`
      ALTER TABLE tbl_credit_card_companies ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE tbl_credit_card_companies ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
      ALTER TABLE tbl_credit_card_companies ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE tbl_credit_card_companies ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
    `);
    console.log("- Added extra columns to tbl_credit_card_companies.");

    // 2. Insert some default providers
    const providers = ['VISA', 'MASTERCARD', 'AMEX', 'JCB', 'PromptPay'];
    for (const p of providers) {
      await pool.query(
        "INSERT INTO tbl_credit_card_companies (name, fee_pct) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [p, 0]
      );
    }
    console.log("- Default providers inserted.");

    console.log("Migration successful: Credit Card tables created.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
    process.exit();
  }
}

migrateCreditCards();
