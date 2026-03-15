const { pool } = require("../initial");

const getMasterOptions = async () => {
    try {
        const queryStr = `
            SELECT 
                mag.id AS group_id,
                mag.name AS group_name,
                mag.name_eng AS group_name_eng,
                mag.is_required AS "isRequired",
                mag.is_multiple AS "isMultiple",
                mag.min_choices AS "minChoices",
                mag.max_choices AS "maxChoices",
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'option_id', mao.id,
                            'options_name', mao.name,
                            'options_name_eng', mao.name_eng,
                            'options_price', mao.price,
                            'options_active', mao.is_active
                        ) ORDER BY mao.created_at
                    )
                    FROM tbl_master_addon_options mao
                    WHERE mao.group_id = mag.id
                ) AS choices
            FROM tbl_master_addon_groups mag
            ORDER BY mag.created_at DESC;
        `;
        const result = await pool.query(queryStr);
        return { status: 200, msg: result.rows };
    } catch (error) {
        console.error("Error getMasterOptions:", error);
        return { status: 400, msg: error.message };
    }
};

const createMasterOption = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const insertGroupSql = `
            INSERT INTO tbl_master_addon_groups (name, name_eng, is_required, is_multiple, min_choices, max_choices)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
        `;
        const groupValues = [data.group_name, data.group_name_eng, data.isRequired || false, data.isMultiple || false, data.minChoices || 0, data.maxChoices || 0];
        const resGroup = await client.query(insertGroupSql, groupValues);
        const groupId = resGroup.rows[0].id;

        if (data.choices && data.choices.length > 0) {
            for (const choice of data.choices) {
                const insertChoiceSql = `
                    INSERT INTO tbl_master_addon_options (group_id, name, name_eng, price, is_active)
                    VALUES ($1, $2, $3, $4, $5);
                `;
                const choiceValues = [groupId, choice.options_name, choice.options_name_eng, choice.options_price, choice.options_active !== false];
                await client.query(insertChoiceSql, choiceValues);
            }
        }

        await client.query("COMMIT");
        return { status: 200, msg: "Master Option created successfully", data: { id: groupId } };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error createMasterOption:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const updateMasterOption = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const updateGroupSql = `
            UPDATE tbl_master_addon_groups 
            SET name = $1, name_eng = $2, is_required = $3, is_multiple = $4, min_choices = $5, max_choices = $6
            WHERE id = $7;
        `;
        const groupValues = [data.group_name, data.group_name_eng, data.isRequired, data.isMultiple, data.minChoices, data.maxChoices, data.group_id];
        await client.query(updateGroupSql, groupValues);

        // Delete existing choices and re-insert
        await client.query(`DELETE FROM tbl_master_addon_options WHERE group_id = $1`, [data.group_id]);

        if (data.choices && data.choices.length > 0) {
            for (const choice of data.choices) {
                const insertChoiceSql = `
                    INSERT INTO tbl_master_addon_options (group_id, name, name_eng, price, is_active)
                    VALUES ($1, $2, $3, $4, $5);
                `;
                const choiceValues = [data.group_id, choice.options_name, choice.options_name_eng, choice.options_price, choice.options_active !== false];
                await client.query(insertChoiceSql, choiceValues);
            }
        }

        await client.query("COMMIT");
        return { status: 200, msg: "Master Option updated successfully" };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error updateMasterOption:", error);
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

const deleteMasterOption = async (id) => {
    try {
        await pool.query(`DELETE FROM tbl_master_addon_groups WHERE id = $1`, [id]);
        return { status: 200, msg: "Master Option deleted successfully" };
    } catch (error) {
        console.error("Error deleteMasterOption:", error);
        return { status: 400, msg: error.message };
    }
};

module.exports = {
    getMasterOptions,
    createMasterOption,
    updateMasterOption,
    deleteMasterOption
};
