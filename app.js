const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { io, pool, app } = require("./initial");
// const google_api = require("./src/google_api.js");
const store = require("./src/store.js");
const product = require("./src/product.js");
const user = require("./src/user.js");
const dashboard = require("./src/dashboard.js");
const inventory = require("./src/inventory.js");
const order = require("./src/order.js");
const axios = require("axios");

// --- Image Upload Setup ---
const uploadDir = path.join(__dirname, 'public', 'uploads', 'menus');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const updateDir = path.join(__dirname, 'public', 'updates');
if (!fs.existsSync(updateDir)) {
  fs.mkdirSync(updateDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'menu-' + uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// Serve static files with caching
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '1y',
  immutable: true
}));

// Route for APK Updates
app.use('/updates', express.static(path.join(__dirname, 'public', 'updates')));

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'No file uploaded.' });
  }
  // Return relative path so front-end knows where to fetch
  const fileUrl = `/uploads/menus/${req.file.filename}`;
  res.status(200).send({ url: fileUrl });
});
// ----------------------------

// pool.connect();
// pool.query("LISTEN queue_trigger");

// // ✅ เมื่อ PostgreSQL trigger ทำงาน
// pool.on("notification", (msg) => {
//   // console.log("🔔 Trigger fired:", msg.payload);
//   // แจ้งทุก client ให้ refresh queue
//   io.emit("queue_refresh");
// });

io.on("connection", (socket) => {

  socket.on("CreateStore", async (data) => {
    const result = await store.CreateStore(data);
    socket.emit("return_CreateStore", result);
  });

  socket.on("updateStore", async (data) => {
    const result = await store.UpdateStore(data);
    socket.emit("return_updateStore", result);
  });

  socket.on("getStore", async () => {
    const result = await store.getStore();
    socket.emit("return_getStore", result);
  });

  socket.on("deleteStore", async (id) => {
    const result = await store.deleteStore(id);
    socket.emit("return_deleteStore", result);
  });
  //-----------------------------------------------------------


  socket.on("createProduct", async (data) => {
    const result = await product.createProduct(data);
    socket.emit("return_createProduct", result);
    if (result.status === 200 || result.status === 201) {
      io.emit("menu_updated", { store_id: data.storeId || data.store_id, action: 'CREATE' });
    }
  });

  socket.on("updateProduct", async (data) => {
    const result = await product.updateProduct(data);
    socket.emit("return_updateProduct", result);
    if (result.status === 200) {
      io.emit("menu_updated", { store_id: data.storeId || data.store_id, action: 'UPDATE' });
    }
  });

  socket.on("getProduct", async (store_id) => {
    const result = await product.getProduct(store_id);
    socket.emit("return_getProduct", result);
  });

  // --- Dashboard Data ---
  socket.on("getSalesSummary", async (storeId) => {
    const result = await dashboard.getSalesSummary(storeId);
    socket.emit("return_getSalesSummary", result);
  });

  socket.on("getTopSellingItems", async (storeId) => {
    const result = await dashboard.getTopSellingItems(storeId);
    socket.emit("return_getTopSellingItems", result);
  });

  // --- User Management ---
  socket.on("login", async (data) => {
    const result = await user.login(data);
    socket.emit("return_login", result);
  });

  socket.on("verifySession", async (data) => {
    const result = await user.verifySession(data);
    socket.emit("return_verifySession", result);
  });

  socket.on("logoutSession", async (userId) => {
    const result = await user.logoutSession(userId);
    socket.emit("return_logoutSession", result);
  });

  socket.on("getUsers", async () => {
    const result = await user.getUsers();
    socket.emit("return_getUsers", result);
  });

  socket.on("createUser", async (data) => {
    const result = await user.createUser(data);
    socket.emit("return_createUser", result);
  });

  socket.on("updateUser", async (data) => {
    const result = await user.updateUser(data);
    socket.emit("return_updateUser", result);
  });

  socket.on("deleteUser", async (user_id) => {
    const result = await user.deleteUser(user_id);
    socket.emit("return_deleteUser", result);
  });

  // --- Orders ---
  socket.on("submitOrder", async (data) => {
    const result = await order.submitOrder(data);
    socket.emit("return_submitOrder", result);
    // แจ้งเตือน kitchen/dashboard สดๆ ร้อนๆ
    if (result.status === 200) {
      io.emit("new_order", result.msg);
    }
  });
  // -----------------------

  // --- Dashboard ---
  socket.on("getSalesSummary", async (store_id) => {
    const result = await dashboard.getSalesSummary(store_id);
    socket.emit("return_getSalesSummary", result);
  });

  socket.on("getTopSellingItems", async (store_id) => {
    const result = await dashboard.getTopSellingItems(store_id);
    socket.emit("return_getTopSellingItems", result);
  });

  // --- Order Execution ---
  socket.on("placeOrder", async (data) => {
    const result = await order.placeOrder(data);
    socket.emit("return_placeOrder", result);
    // Broadcast to all admins that a new order occurred so they refresh dashboards
    if (result.status === 200) {
      io.emit("new_order_placed", { store_id: data.store_id });
    }
  });

  // --- Inventory & Stock ---
  socket.on("getIngredients", async (store_id) => {
    const result = await inventory.getIngredients(store_id);
    socket.emit("return_getIngredients", result);
  });

  socket.on("createIngredient", async (data) => {
    const result = await inventory.createIngredient(data);
    socket.emit("return_createIngredient", result);
  });

  socket.on("updateIngredient", async (data) => {
    const result = await inventory.updateIngredient(data);
    socket.emit("return_updateIngredient", result);
  });

  socket.on("deleteIngredient", async (id) => {
    const result = await inventory.deleteIngredient(id);
    socket.emit("return_deleteIngredient", result);
  });

  socket.on("getStockTransactions", async (store_id) => {
    const result = await inventory.getStockTransactions(store_id);
    socket.emit("return_getStockTransactions", result);
  });

  socket.on("createTransaction", async (data) => {
    const result = await inventory.createTransaction(data);
    socket.emit("return_createTransaction", result);
  });

  socket.on("getRecipe", async (product_id) => {
    const result = await inventory.getRecipe(product_id);
    socket.emit("return_getRecipe", result);
  });

  socket.on("upsertRecipe", async (data) => {
    const result = await inventory.upsertRecipe(data);
    socket.emit("return_upsertRecipe", result);
  });
  // -----------------------

  socket.on("checkUpdate", async () => {
    try {
      const versionPath = path.join(__dirname, 'public', 'updates', 'version.json');
      if (fs.existsSync(versionPath)) {
        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        socket.emit("return_checkUpdate", {
          status: 200,
          header: 'Update Info',
          msg: { version: versionData.version }
        });
      } else {
        // ถ้าไม่เจอไฟล์ ให้ถือว่ายังเป็น 1.0.0
        socket.emit("return_checkUpdate", {
          status: 200,
          header: 'No Update Config',
          msg: { version: '1.0.0' }
        });
      }
    } catch (e) {
      console.error("Error reading version.json:", e);
      socket.emit("return_checkUpdate", {
        status: 500,
        msg: { version: '1.0.0' }
      });
    }
  });
  // -----------------------

  socket.on("disconnect", () => {
    // console.log(`❌ Socket disconnected: ${socket.id}`);
  });



});



module.exports = router;
