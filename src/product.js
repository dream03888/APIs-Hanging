
const { pool } = require("../initial");


const createProduct = async (data) => {
    const client = await pool.connect();
    console.log(data);
    try {
        await client.query("BEGIN");
        let insertUserSql = ''
        let questrValue = []
        const discountValue = data.discountParams?.value ?? null;
        const discountType = data.discountParams?.type ?? null;
        insertUserSql = `INSERT INTO products (store_id , name , price,image_url , name_eng , discount_value , discount_type, promotion_id, category_id, is_stock_tracked, stock_quantity, min_stock_level) 
    VALUES($1 , $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *;`;
        questrValue = [data.storeId, data.name, data.price, data.image_url, data.name_eng, discountValue, discountType, data.promotion_id || null, data.menu_set_id || null, data.is_stock_tracked || false, data.stock_quantity || 0, data.min_stock_level || 0];
        const result = await client.query(insertUserSql, questrValue);
        if (data.items && data.items.length > 0) {
            for (let i = 0; i < data.items.length; i++) {
                insertUserSql = `INSERT INTO addon_groups (product_id, name, name_eng, is_required, is_multiple, min_choices, max_choices) 
            VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
                questrValue = [result.rows[0].id, data.items[i].group_name, data.items[i].group_name_eng, data.items[i].isRequired || false, data.items[i].isMultiple || false, data.items[i].minChoices || 0, data.items[i].maxChoices || 0];
                const resGruopId = await client.query(insertUserSql, questrValue);

                if (data.items[i].choices && data.items[i].choices.length > 0) {
                    for (let j = 0; j < data.items[i].choices.length; j++) {
                        insertUserSql = `INSERT INTO addon_options (group_id , name ,price,name_eng ,product_id ) 
                    VALUES($1 , $2,$3,$4,$5) RETURNING *;`;
                        questrValue = [resGruopId.rows[0].id, data.items[i].choices[j].options_name, data.items[i].choices[j].options_price, data.items[i].choices[j].options_name_eng, result.rows[0].id];
                        await client.query(insertUserSql, questrValue);
                    }
                }
            }
        }
        await client.query("COMMIT");
        return { status: 200, msg: "success", data: result.rows[0] };
    } catch (error) {
        await client.query("ROLLBACK");
        console.log(error);
        return {
            status: 400,
            msg: error.message,
        };
    } finally {
        client.release();
    }
};

const updateProduct = async (data) => {
    const client = await pool.connect();
    console.log("Updating Product:", data);

    try {
        await client.query("BEGIN");

        // 1. Update products main table
        const masterStoreId = '00000000-0000-0000-0000-000000000000';
        const currentProd = await client.query(`SELECT store_id FROM products WHERE id = $1`, [data.product_id]);

        // Use COALESCE so that master-linked products (which store name/image as NULL
        // and read them from the master row) don't accidentally violate NOT NULL.
        const discountValue = data.discount_value ?? null;
        const discountType = data.discount_type ?? null;

        const updateProductSql = `
            UPDATE products 
            SET name          = COALESCE($1, name),
                price         = $2,
                image_url     = COALESCE($3, image_url),
                name_eng      = COALESCE($4, name_eng),
                discount_value = $5,
                discount_type  = $6,
                is_active     = $7,
                promotion_id  = $8,
                category_id   = $9,
                is_stock_tracked = $10,
                stock_quantity = $11,
                min_stock_level = $12
            WHERE id = $13;
        `;
        const isMaster = currentProd.rows[0]?.store_id === masterStoreId;
        const hasPromo = !!data.promotion_id;

        const productValues = [
            data.name || null,
            data.price,
            data.image_url || null,
            data.name_eng || null,
            hasPromo ? discountValue : 0,
            hasPromo ? discountType : null,
            data.product_active,
            data.promotion_id || null,
            data.menu_set_id || null,
            data.is_stock_tracked ?? false,
            data.stock_quantity ?? 0,
            data.min_stock_level ?? 0,
            data.product_id
        ];
        await client.query(updateProductSql, productValues);

        // --- Master to Child Sync logic ---
        // Only sync is_active from master. Promotions & discounts are now managed per-store.
        if (isMaster) {
            console.log(`Master product ${data.product_id} updated. Syncing is_active to all child products...`);
            await client.query(
                `UPDATE products SET is_active = $1 WHERE master_product_id = $2;`,
                [data.product_active, data.product_id]
            );
        }

        // 2. We now ALLOW master-linked products to have their own addon overrides.
        // If a local store manager saves addons, they will be stored locally for this product_id.
        // We always perform the upsert for addons now, unless it's a child that wants to KEEP master addons.
        // For simplicity, if the user hits "Save" on the menu form, we assume they want to save these specific addons.

        // 3. Delete existing local options
        await client.query(`DELETE FROM addon_groups WHERE product_id = $1;`, [data.product_id]);

        // 4. Insert new option groups and choices
        if (data.items && data.items.length > 0) {
            for (let i = 0; i < data.items.length; i++) {
                const insertGroupSql = `INSERT INTO addon_groups (product_id, name, name_eng, is_required, is_multiple, min_choices, max_choices) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`;
                const groupValues = [data.product_id, data.items[i].group_name, data.items[i].group_name_eng, data.items[i].isRequired || false, data.items[i].isMultiple || false, data.items[i].minChoices || 0, data.items[i].maxChoices || 0];
                const resGroupId = await client.query(insertGroupSql, groupValues);

                if (data.items[i].choices && data.items[i].choices.length > 0) {
                    for (let j = 0; j < data.items[i].choices.length; j++) {
                        const insertChoiceSql = `INSERT INTO addon_options (group_id, name, price, name_eng, product_id, is_active) VALUES ($1, $2, $3, $4, $5, $6);`;
                        const choiceValues = [
                            resGroupId.rows[0].id,
                            data.items[i].choices[j].options_name,
                            data.items[i].choices[j].options_price,
                            data.items[i].choices[j].options_name_eng,
                            data.product_id,
                            data.items[i].choices[j].options_active || true
                        ];
                        await client.query(insertChoiceSql, choiceValues);
                    }
                }
            }
        }

        await client.query("COMMIT");
        return { status: 200, msg: "success updated!", data: { id: data.product_id } };

    } catch (error) {
        await client.query("ROLLBACK");
        console.log("Error Update Product:", error);
        return {
            status: 400,
            msg: error.message,
        };
    } finally {
        client.release();
    }
};

const getProduct = async (store_id) => {
    // If empty string, default to Master Store ID
    if (store_id === '') store_id = '00000000-0000-0000-0000-000000000000';

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!store_id || !uuidRegex.test(store_id)) {
        console.log("Invalid or empty store_id provided to getProduct:", store_id);
        return { status: 200, msg: [] };
    }

    const queryStr = `
WITH options AS (
  SELECT
    ag.product_id,
    jsonb_agg(
      jsonb_build_object(
        'group_id', ag.id,
        'group_name', ag.name,
        'group_name_eng', ag.name_eng,
        'isRequired', ag.is_required,
        'isMultiple', ag.is_multiple,
        'minChoices', ag.min_choices,
        'maxChoices', ag.max_choices,
        'choices', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'option_id', ao.id,
              'options_name', ao.name,
              'options_name_eng', ao.name_eng,
              'options_price', ao.price,
              'options_active', ao.is_active
            )
          ), '[]'::jsonb)
          FROM addon_options ao
          WHERE ao.group_id = ag.id
        )
      )
      ORDER BY ag.id
    ) AS items
  FROM addon_groups ag
  GROUP BY ag.product_id
)
SELECT
  p.id AS product_id,
  COALESCE(mp.name, p.name) AS name,
  COALESCE(mp.name_eng, p.name_eng) AS name_eng,
  p.price,
  COALESCE(mp.image_url, p.image_url) AS image_url,
  p.is_active AS product_active,
  COALESCE(tp.type::TEXT, p.discount_type::TEXT, mp.discount_type::TEXT) AS discount_type,
  COALESCE(tp.value::NUMERIC, p.discount_value::NUMERIC, mp.discount_value::NUMERIC) AS discount_value,
  -- Prefer local product's own promotion, fallback to master's if branch has none set
  COALESCE(p.promotion_id, mp.promotion_id) AS promotion_id,
  p.category_id AS menu_set_id,
  p.is_stock_tracked,
  p.stock_quantity,
  p.min_stock_level,
  COALESCE(p.master_product_id, NULL) as master_product_id,
  (
    SELECT jsonb_agg(s.name) 
    FROM products p2 
    JOIN stores s ON p2.store_id = s.id 
    WHERE p2.master_product_id = p.id
  ) as linked_stores,
  -- Smart Addon Selection: Use local addons if they exist (count > 0), otherwise fallback to master's addons
  CASE 
    WHEN (SELECT COUNT(*) FROM addon_groups WHERE product_id = p.id) > 0 THEN COALESCE(olocal.items, '[]'::jsonb)
    ELSE COALESCE(omaster.items, '[]'::jsonb)
  END AS items
FROM products p
LEFT JOIN products mp ON p.master_product_id = mp.id
-- Join promotion on the local product's own promotion first, then fallback to master's
LEFT JOIN tbl_promotions tp ON COALESCE(p.promotion_id, mp.promotion_id) = tp.id
LEFT JOIN options olocal ON p.id = olocal.product_id
LEFT JOIN options omaster ON p.master_product_id = omaster.product_id
WHERE p.store_id::text = $1::text;`;
    const questrValue = [store_id];
    try {
        return pool
            .query(queryStr, questrValue)
            .then((result) => {
                return { status: 200, msg: result.rows };
            })
            .catch((error) => {
                console.log("Error getProduct: " + error);
                return { status: 201, msg: error.message };
            });
    } catch (error) {
        console.log("Error Connect : " + error);
        return { status: 400, msg: error.message };
    }
};

const cloneProductFromMaster = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const masterProductIds = data.master_product_ids; // Array of product IDs
        const targetStoreId = data.target_store_id;

        for (let i = 0; i < masterProductIds.length; i++) {
            const masterId = masterProductIds[i];

            // 1. Fetch master product details
            const masterProductRes = await client.query("SELECT * FROM products WHERE id = $1", [masterId]);
            if (masterProductRes.rows.length === 0) continue;
            const mp = masterProductRes.rows[0];

            // 2. Insert cloned product with master reference
            const insertProductSql = `
                INSERT INTO products (store_id, name, price, image_url, name_eng, discount_value, discount_type, promotion_id, master_product_id) 
                VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;`;
            const pValues = [targetStoreId, mp.name, mp.price, mp.image_url, mp.name_eng, mp.discount_value, mp.discount_type, mp.promotion_id || null, mp.id];
            const newProductRes = await client.query(insertProductSql, pValues);
            const newProductId = newProductRes.rows[0].id;

            // (Skipped copying addon groups and options because master-linked products
            // automatically inherit their addons dynamically via getProduct API)
        }
        await client.query("COMMIT");
        return { status: 200, msg: "success cloned from master" };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error cloning product:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const getMasterAddonGroups = async () => {
    const queryStr = `
        SELECT
            ag.id AS group_id,
            ag.name AS group_name,
            ag.name_eng AS group_name_eng,
            ag.is_required AS "isRequired",
            ag.is_multiple AS "isMultiple",
            ag.min_choices AS "minChoices",
            ag.max_choices AS "maxChoices",
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'option_id', ao.id,
                        'options_name', ao.name,
                        'options_name_eng', ao.name_eng,
                        'options_price', ao.price,
                        'options_active', ao.is_active
                    )
                )
                FROM addon_options ao
                WHERE ao.group_id = ag.id
            ) AS choices,
            p.name AS product_template_name
        FROM addon_groups ag
        JOIN products p ON ag.product_id = p.id
        WHERE p.store_id = '00000000-0000-0000-0000-000000000000'
        ORDER BY p.name, ag.id
    `;
    try {
        const result = await pool.query(queryStr);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.log("Error getMasterAddonGroups: " + error);
        return { status: 400, msg: error.message };
    }
};

const getSyncStatus = async (master_product_id) => {
    try {
        const query = `
            SELECT store_id 
            FROM products 
            WHERE master_product_id = $1
        `;
        const res = await pool.query(query, [master_product_id]);
        return { status: 200, msg: res.rows.map(r => r.store_id) };
    } catch (e) {
        console.error('Error getSyncStatus:', e);
        return { status: 400, msg: e.message };
    }
}

const getMenuSets = async (store_id) => {
    try {
        const queryStr = `
            SELECT ms.id, ms.name, ms.name_en as "nameEn", ms.store_id as "storeId", ms.sort_order as "sortOrder",
                   COALESCE(array_agg(p.id) FILTER (WHERE p.id IS NOT NULL), '{}') as "menuIds"
            FROM menu_sets ms
            LEFT JOIN products p ON ms.id = p.category_id
            WHERE ms.store_id::text = $1::text
            GROUP BY ms.id
            ORDER BY ms.sort_order, ms.name;
        `;
        const result = await pool.query(queryStr, [store_id]);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getMenuSets:", error);
        return { status: 400, msg: error.message };
    }
};

const upsertMenuSet = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let setId = data.id;

        // 1. Upsert menu_sets
        if (data.isNew || !setId) {
            const res = await client.query(
                `INSERT INTO menu_sets (name, name_en, store_id, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
                [data.name, data.nameEn, data.storeId, data.sortOrder || 0]
            );
            setId = res.rows[0].id;
        } else {
            await client.query(
                `UPDATE menu_sets SET name = $1, name_en = $2, sort_order = $3 WHERE id = $4`,
                [data.name, data.nameEn, data.sortOrder || 0, setId]
            );
        }

        // 2. Refresh items (Update products category_id)
        // First, clear old links for this set
        await client.query(`UPDATE products SET category_id = NULL WHERE category_id = $1`, [setId]);
        if (data.menuIds && data.menuIds.length > 0) {
            await client.query(
                `UPDATE products SET category_id = $1 WHERE id = ANY($2)`,
                [setId, data.menuIds]
            );
        }

        await client.query("COMMIT");
        return { status: 200, msg: "success", data: { id: setId } };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error upsertMenuSet:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
}

const deleteMenuSet = async (id) => {
    try {
        await pool.query(`UPDATE products SET category_id = NULL WHERE category_id = $1`, [id]);
        await pool.query(`DELETE FROM menu_sets_items WHERE menu_set_id = $1`, [id]);
        await pool.query(`DELETE FROM menu_sets WHERE id = $1`, [id]);
        return { status: 200, msg: "success" };
    } catch (error) {
        console.error("Error deleteMenuSet:", error);
        return { status: 400, msg: error.message };
    }
}

const unsyncProductFromStore = async (data) => {
    const { master_product_id, store_id } = data;
    try {
        // Delete the record in products where it points to the master_product_id for that specific store
        const query = `
            DELETE FROM products 
            WHERE master_product_id = $1 
            AND store_id = $2;
        `;
        await pool.query(query, [master_product_id, store_id]);
        return { status: 200, msg: "success unsynced" };
    } catch (error) {
        console.error("Error unsyncProductFromStore:", error);
        return { status: 400, msg: error.message };
    }
}

module.exports = {
    createProduct,
    updateProduct,
    cloneProductFromMaster,
    getProduct,
    getMasterAddonGroups,
    getSyncStatus,
    getMenuSets,
    upsertMenuSet,
    deleteMenuSet,
    unsyncProductFromStore
};
