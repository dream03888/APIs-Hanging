const { pool } = require("../initial");

/**
 * Creates a coupon campaign and generates batch coupons.
 * Expected data: { name, prefix, count, discount_type, discount_value, start_date, end_date, is_all_bill, store_ids, product_ids }
 */
const createCouponCampaign = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Insert Campaign
        const campaignSql = `
            INSERT INTO tbl_coupon_campaigns (name, prefix, discount_type, discount_value, start_date, end_date, is_all_bill)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;
        `;
        const campaignValues = [
            data.name,
            data.prefix.toUpperCase(),
            data.discount_type,
            data.discount_value,
            data.start_date || null,
            data.end_date || null,
            data.is_all_bill !== undefined ? data.is_all_bill : true
        ];
        const campaignRes = await client.query(campaignSql, campaignValues);
        const campaignId = campaignRes.rows[0].id;

        // 2. Link Stores
        if (data.store_ids && data.store_ids.length > 0) {
            for (const storeId of data.store_ids) {
                await client.query(
                    `INSERT INTO tbl_coupon_store_links (campaign_id, store_id) VALUES ($1, $2)`,
                    [campaignId, storeId]
                );
            }
        }

        // 3. Link Products (if not all bill)
        if (!data.is_all_bill && data.product_ids && data.product_ids.length > 0) {
            for (const productId of data.product_ids) {
                await client.query(
                    `INSERT INTO tbl_coupon_product_links (campaign_id, product_id) VALUES ($1, $2)`,
                    [campaignId, productId]
                );
            }
        }

        // 4. Generate Batch Coupons (Prefix-0001 to Prefix-NNNN)
        const count = parseInt(data.count) || 1;
        const prefix = data.prefix.toUpperCase();

        const couponValues = [];
        for (let i = 1; i <= count; i++) {
            const sequence = String(i).padStart(4, '0');
            const code = `${prefix}-${sequence}`;
            couponValues.push([campaignId, code]);
        }

        // Bulk insert coupons (Postgres doesn't have a simple batch helper without external libs, so we loop or build a massive query)
        // For safety/simplicity in this script, we'll use a loop but in production a single insert is better.
        for (const [cId, code] of couponValues) {
            await client.query(
                `INSERT INTO tbl_coupons (campaign_id, code) VALUES ($1, $2)`,
                [cId, code]
            );
        }

        await client.query("COMMIT");
        return { status: 200, msg: "Campaign and coupons created successfully", campaign_id: campaignId };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error createCouponCampaign:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const getCouponCampaigns = async () => {
    try {
        const queryStr = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM tbl_coupons WHERE campaign_id = c.id) as total_coupons,
                   (SELECT COUNT(*) FROM tbl_coupons WHERE campaign_id = c.id AND is_used = TRUE) as used_coupons
            FROM tbl_coupon_campaigns c
            ORDER BY c.created_at DESC;
        `;
        const result = await pool.query(queryStr);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getCouponCampaigns:", error);
        return { status: 400, msg: error.message };
    }
};

const validateCoupon = async (code, storeId, productIds = []) => {
    try {
        const queryStr = `
            SELECT cp.*, cam.discount_type, cam.discount_value, cam.start_date, cam.end_date, cam.is_all_bill, cam.is_active as campaign_active
            FROM tbl_coupons cp
            JOIN tbl_coupon_campaigns cam ON cp.campaign_id = cam.id
            WHERE cp.code = $1;
        `;
        const result = await pool.query(queryStr, [code.toUpperCase()]);

        if (result.rows.length === 0) {
            return { status: 404, msg: "คูปองไม่ถูกต้อง" };
        }

        const coupon = result.rows[0];

        // 1. Check if used
        if (coupon.is_used) {
            return { status: 403, msg: "คูปองนี้ถูกใช้งานไปแล้ว" };
        }

        // 2. Check campaign status
        if (!coupon.campaign_active) {
            return { status: 403, msg: "แคมเปญนี้ถูกปิดใช้งานแล้ว" };
        }

        // 3. Check dates
        const now = new Date();
        if (coupon.start_date && new Date(coupon.start_date) > now) {
            return { status: 403, msg: "ยังไม่ถึงเวลาเริ่มใช้คูปองนี้" };
        }
        if (coupon.end_date && new Date(coupon.end_date) < now) {
            return { status: 403, msg: "คูปองนี้หมดอายุแล้ว" };
        }

        // 4. Check Store access
        const storeLinks = await pool.query(`SELECT store_id FROM tbl_coupon_store_links WHERE campaign_id = $1`, [coupon.campaign_id]);
        if (storeLinks.rows.length > 0) {
            const allowedStores = storeLinks.rows.map(r => r.store_id);
            if (!allowedStores.includes(storeId)) {
                return { status: 403, msg: "คูปองนี้ไม่สามารถใช้กับร้านค้าปี้นี้ได้" };
            }
        }

        // 5. Check Product targeting (if not all bill)
        if (!coupon.is_all_bill) {
            const productLinks = await pool.query(`SELECT product_id FROM tbl_coupon_product_links WHERE campaign_id = $1`, [coupon.campaign_id]);
            const allowedProductIds = productLinks.rows.map(r => r.product_id);

            // Fetch actual IDs and Master IDs for all products in the cart
            const cartProductDetails = await pool.query(
                `SELECT id, master_product_id FROM products WHERE id = ANY($1)`,
                [productIds]
            );

            // A cart item matches if its own ID is allowed OR its master_product_id is allowed
            const matchingCartProducts = cartProductDetails.rows.filter(p =>
                allowedProductIds.includes(p.id) ||
                (p.master_product_id && allowedProductIds.includes(p.master_product_id))
            );

            if (matchingCartProducts.length === 0) {
                return { status: 403, msg: "ไม่พบสินค้าที่เข้าร่วมโปรโมชั่นในตะกร้าของคุณ" };
            }

            // Return the specific store product IDs that matched
            coupon.target_product_ids = matchingCartProducts.map(p => p.id);
        }

        return { status: 200, msg: "คูปองใช้ได้", data: coupon };
    } catch (error) {
        console.error("Error validateCoupon:", error);
        return { status: 400, msg: error.message };
    }
};

const markCouponAsUsed = async (code, orderId) => {
    try {
        const queryStr = `
            UPDATE tbl_coupons 
            SET is_used = TRUE, used_at = CURRENT_TIMESTAMP, order_id = $1
            WHERE code = $2 AND is_used = FALSE
            RETURNING *;
        `;
        const result = await pool.query(queryStr, [orderId, code.toUpperCase()]);
        if (result.rowCount === 0) {
            return { status: 400, msg: "ไม่สามารถบันทึกการใช้คูปองได้ (รหัสไม่ถูกต้องหรือถูกใช้แล้ว)" };
        }
        return { status: 200, msg: "คูปองถูกใช้แล้ว" };
    } catch (error) {
        console.error("Error markCouponAsUsed:", error);
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    createCouponCampaign,
    getCouponCampaigns,
    validateCoupon,
    markCouponAsUsed
};
