
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
        insertUserSql = `INSERT INTO products (store_id , name , price,image_url , name_eng , discount_value , discount_type) 
    VALUES($1 , $2,$3,$4,$5,$6,$7) RETURNING *;`;
        questrValue = [data.storeId, data.name, data.price, data.image_url, data.name_eng, discountValue, discountType];
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
        return { status: 200, msg: "success" };
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
        const discountValue = data.discount_value ?? null;
        const discountType = data.discount_type ?? null;

        const updateProductSql = `
            UPDATE products 
            SET name = $1, price = $2, image_url = $3, name_eng = $4, discount_value = $5, discount_type = $6, is_active = $7
            WHERE id = $8;
        `;
        const productValues = [
            data.name, data.price, data.image_url, data.name_eng,
            discountValue, discountType, data.product_active, data.product_id
        ];
        await client.query(updateProductSql, productValues);

        // 2. Delete existing options
        const deleteOptionsSql = `DELETE FROM addon_groups WHERE product_id = $1;`;
        await client.query(deleteOptionsSql, [data.product_id]);

        // 3. Insert new option groups and choices
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
        return { status: 200, msg: "success updated!" };

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
        )
      )
      ORDER BY ag.id
    ) AS items
  FROM addon_groups ag
  GROUP BY ag.product_id
)
SELECT
  p.id AS product_id,
  p.name,
  p.name_eng,
  p.price,
  p.image_url,
  p.is_active AS product_active,
  p.discount_type,
  p.discount_value,
  COALESCE(o.items, '[]'::jsonb) AS items
FROM products p
LEFT JOIN options o ON p.id = o.product_id
WHERE p.store_id = $1`;
    const questrValue = [store_id];
    try {
        return pool
            .query(queryStr, questrValue)
            .then((result) => {
                if (result.rows.length < 0) {
                    return { status: 201, msg: [] };
                }
                return { status: 200, msg: result.rows };

            })
            .catch((error) => {
                console.log("Error Funtions userLogin" + error);
                return { status: 201, msg: error };
            });
    } catch (error) {
        console.log("Error Connect : " + error);
        return { status: 400, msg: error };
    }
};

module.exports = {
    createProduct,
    getProduct,
    updateProduct
};
