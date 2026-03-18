const { pool } = require("../initial");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || 'hanging_home_secret_key_2026';

// 1. Get All Users
const getUsers = async () => {
    try {
        const queryStr = `
            SELECT 
                user_id as id,
                username,
                f_name,
                l_name,
                emp_code,
                phone,
                role_id,
                store_id,
                store_ids,
                permissions,
                create_at
            FROM tbl_users 
            ORDER BY user_id DESC
        `;
        const result = await pool.query(queryStr);
        // Map database roles back to frontend terminology if needed, 
        // 1 = superadmin, 2 = storeadmin
        const mappedUsers = result.rows.map(row => ({
            ...row,
            role: row.role_id === 1 ? 'superadmin' : 'storeadmin',
            store_ids: typeof row.store_ids === 'string' ? JSON.parse(row.store_ids) : (row.store_ids || []),
            permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions || [])
        }));

        return { status: 200, msg: mappedUsers };
    } catch (error) {
        console.error("Error getUsers: ", error);
        return { status: 400, msg: error.message };
    }
};

// 2. Create User
const createUser = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Ensure permissions is stored as JSON
        const permissionsJson = JSON.stringify(data.permissions || []);

        const insertUserSql = `
            INSERT INTO tbl_users (username, password, f_name, l_name, emp_code, phone, role_id, store_id, store_ids, permissions) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING user_id;
        `;

        // Hash the password, default to 'password' if none provided
        const plainPassword = data.password || 'password';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);

        const values = [
            data.username,
            hashedPassword,
            data.f_name || '',
            data.l_name || '',
            data.emp_code || '',
            data.phone || '',
            data.role === 'superadmin' ? 1 : 2,
            data.storeId || null,
            JSON.stringify(data.storeIds || (data.storeId ? [data.storeId] : [])),
            permissionsJson
        ];

        const result = await client.query(insertUserSql, values);
        await client.query("COMMIT");
        return { status: 200, msg: "User created successfully", user_id: result.rows[0].user_id };

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error createUser: ", error);
        // Check for unique constraint violation (duplicate username)
        if (error.code === '23505') {
            return { status: 400, msg: "Username already exists." };
        }
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

// 3. Update User
const updateUser = async (data) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const permissionsJson = JSON.stringify(data.permissions || []);

        let updateSql = `
            UPDATE tbl_users 
            SET username = $1, f_name = $2, l_name = $3, emp_code = $4, phone = $5, role_id = $6, store_id = $7, store_ids = $8, permissions = $9
        `;
        let values = [
            data.username,
            data.f_name || '',
            data.l_name || '',
            data.emp_code || '',
            data.phone || '',
            data.role === 'superadmin' ? 1 : 2,
            data.storeId || null,
            JSON.stringify(data.storeIds || (data.storeId ? [data.storeId] : [])),
            permissionsJson
        ];

        // Only update password if provided
        if (data.password && data.password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(data.password, salt);

            updateSql += `, password = $10 WHERE user_id = $11`;
            values.push(hashedPassword, data.id);
        } else {
            updateSql += ` WHERE user_id = $10`;
            values.push(data.id);
        }

        await client.query(updateSql, values);
        await client.query("COMMIT");
        return { status: 200, msg: "User updated successfully" };

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error updateUser: ", error);
        if (error.code === '23505') {
            return { status: 400, msg: "Username already exists." };
        }
        return { status: 400, msg: error.message };
    } finally {
        client.release();
    }
};

// 4. Delete User
const deleteUser = async (user_id) => {
    try {
        const deleteSql = `DELETE FROM tbl_users WHERE user_id = $1`;
        await pool.query(deleteSql, [user_id]);
        return { status: 200, msg: "User deleted successfully" };
    } catch (error) {
        console.error("Error deleteUser: ", error);
        return { status: 400, msg: error.message };
    }
};

// 5. Login
const login = async (data) => {
    try {
        const { username, password } = data;
        const queryStr = `SELECT * FROM tbl_users WHERE username = $1 LIMIT 1`;
        const result = await pool.query(queryStr, [username]);

        if (result.rows.length === 0) {
            return { status: 401, msg: "Invalid username or password" };
        }

        const user = result.rows[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return { status: 401, msg: "Invalid username or password" };
        }

        const role = user.role_id === 1 ? 'superadmin' : 'storeadmin';
        const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
        const storeIds = typeof user.store_ids === 'string' ? JSON.parse(user.store_ids) : (user.store_ids || []);

        // Fetch assigned stores details
        let assignedStores = [];
        if (role === 'superadmin') {
            const allStores = await pool.query(`SELECT id, name, name_eng, allow_tables, table_count FROM stores ORDER BY name`);
            assignedStores = allStores.rows;
        } else {
            // For back-compat and multi-store, we take both store_id and store_ids
            const ids = new Set(storeIds);
            if (user.store_id) ids.add(user.store_id);
            
            if (ids.size > 0) {
                const storeResult = await pool.query(
                    `SELECT id, name, name_eng, allow_tables, table_count FROM stores WHERE id = ANY($1::uuid[]) ORDER BY name`,
                    [Array.from(ids)]
                );
                assignedStores = storeResult.rows;
            }
        }

        // Check if session is already active
        if (user.active_token && !data.force) {
            try {
                // Verify if the current token is still valid
                jwt.verify(user.active_token, JWT_SECRET);
                // If it didn't throw, it's still alive
                return { 
                    status: 409, 
                    msg: "Session already active on another device.",
                    user_id: user.user_id 
                };
            } catch (e) {
                // Token expired or invalid, we can proceed to overwrite
            }
        }

        // Sign JWT Payload
        const payload = {
            id: user.user_id,
            username: user.username,
            role: role,
            storeId: user.store_id || (assignedStores.length > 0 ? assignedStores[0].id : null),
            stores: assignedStores, // Provide full list of stores for selector
            permissions: permissions
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        // Store active token to prevent multiple logins
        await pool.query(`UPDATE tbl_users SET active_token = $1 WHERE user_id = $2`, [token, user.user_id]);

        return {
            status: 200,
            msg: "Login successful",
            token: token,
            user: payload
        };

    } catch (error) {
        console.error("Error login: ", error);
        return { status: 500, msg: "Internal server error" };
    }
};

// 6. Logout (Clear active session)
const logoutSession = async (userId) => {
    try {
        await pool.query(`UPDATE tbl_users SET active_token = NULL WHERE user_id = $1`, [userId]);
        return { status: 200, msg: "Logged out from server" };
    } catch (error) {
        console.error("Error logout: ", error);
        return { status: 500, msg: "Server error during logout" };
    }
}

// 7. Verify Auth Token against DB
const verifySession = async (data) => {
    try {
        const { id, token } = data;
        const result = await pool.query(`SELECT active_token FROM tbl_users WHERE user_id = $1`, [id]);

        if (result.rows.length === 0) return { status: 401, isValid: false };

        const activeToken = result.rows[0].active_token;
        if (activeToken !== token) {
            return { status: 401, isValid: false, msg: "Session revoked or logged in elsewhere" };
        }

        return { status: 200, isValid: true };
    } catch (error) {
        return { status: 500, isValid: false };
    }
}

module.exports = {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    login,
    logoutSession,
    verifySession
};
