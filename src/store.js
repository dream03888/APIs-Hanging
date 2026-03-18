
const { pool } = require("../initial");


const CreateStore = async (data) => {
  const client = await pool.connect();
  console.log(data);
  try {
    await client.query("BEGIN");
    const insertUserSql = `
     INSERT INTO stores (name, name_eng, description, is_stock_enabled, allow_tables, table_count, store_code, hardware_config) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
    `;
    const questrValue = [
      data.name,
      data.name_eng || '',
      data.description,
      data.is_stock_enabled || false,
      data.allow_tables || false,
      data.table_count || 0,
      data.store_code || null,
      data.hardware_config || {}
    ];
    await client.query(insertUserSql, questrValue);
    await client.query("COMMIT");
    return { status: 200, msg: "success" };
  } catch (error) {
    await client.query("ROLLBACK");
    return {
      status: 400,
      msg: error.message,
    };
  } finally {
    client.release();
  }
};

const UpdateStore = async (data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updateSql = `
     UPDATE stores 
     SET name = $1, name_eng = $2, description = $3, is_stock_enabled = $4, allow_tables = $5, table_count = $6, store_code = $7, hardware_config = $8
     WHERE id = $9 RETURNING *;
    `;
    const values = [
      data.name,
      data.name_eng || '',
      data.description,
      data.is_stock_enabled || false,
      data.allow_tables || false,
      data.table_count || 0,
      data.store_code || null,
      data.hardware_config || {},
      data.id
    ];
    await client.query(updateSql, values);
    await client.query("COMMIT");
    return { status: 200, msg: "success" };
  } catch (error) {
    await client.query("ROLLBACK");
    return {
      status: 400,
      msg: error.message,
    };
  } finally {
    client.release();
  }
};

const getStore = async () => {
  const queryStr = `
     SELECT id, name, name_eng, is_active, description, is_stock_enabled, allow_tables, table_count, store_code, hardware_config 
     FROM stores 
     WHERE id != '00000000-0000-0000-0000-000000000000'`;
  try {
    return pool
      .query(queryStr)
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

const deleteStore = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = async (sql) => {
      await client.query("SAVEPOINT sp1");
      try {
        await client.query(sql, [id]);
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT sp1");
        console.log("Cascading skip:", e.message);
      }
    };

    // 1. Logs and Jobs
    await q("DELETE FROM log_order_item_addons WHERE order_item_id IN (SELECT id FROM log_order_items WHERE order_id IN (SELECT id FROM log_oders WHERE store_id = $1))");
    await q("DELETE FROM log_order_items WHERE order_id IN (SELECT id FROM log_oders WHERE store_id = $1)");
    await q("DELETE FROM log_oders WHERE store_id = $1");
    await q("DELETE FROM print_jobs WHERE store_id = $1");
    await q("DELETE FROM printers WHERE store_id = $1");
    await q("DELETE FROM audit_logs WHERE store_id = $1");

    // 2. Orders and Payments
    await q("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)");
    await q("DELETE FROM order_item_addons WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1))");
    await q("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)");
    await q("DELETE FROM orders WHERE store_id = $1");

    // 3. Inventory
    await q("DELETE FROM tbl_stock_transactions WHERE ingredient_id IN (SELECT id FROM tbl_ingredients WHERE store_id = $1)");
    await q("DELETE FROM tbl_recipe_items WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)");
    await q("DELETE FROM tbl_ingredients WHERE store_id = $1");

    // 4. Products and Menus
    await q("DELETE FROM addon_options WHERE group_id IN (SELECT id FROM addon_groups WHERE product_id IN (SELECT id FROM products WHERE store_id = $1))");
    await q("DELETE FROM addon_groups WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)");
    await q("DELETE FROM products WHERE store_id = $1");
    await q("DELETE FROM categories WHERE store_id = $1");

    // Menu sets
    await q("DELETE FROM menu_sets_items WHERE menu_set_id IN (SELECT id FROM menu_sets WHERE store_id = $1)");
    await q("DELETE FROM menu_sets WHERE store_id = $1");

    // 5. Basal relationships
    await q("DELETE FROM terminals WHERE store_id = $1");
    await q("DELETE FROM users WHERE store_id = $1");

    const deleteSql = `DELETE FROM stores WHERE id = $1 RETURNING *;`;
    await client.query(deleteSql, [id]);
    await client.query("COMMIT");
    return { status: 200, msg: "success" };
  } catch (error) {
    await client.query("ROLLBACK");
    return {
      status: 400,
      msg: error.message,
    };
  } finally {
    client.release();
  }
};

module.exports = {
  CreateStore,
  UpdateStore,
  getStore,
  deleteStore
};
