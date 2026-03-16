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
const member = require("./src/member.js");
const config = require("./src/config.js");
const masterOption = require("./src/master_option.js");
const promotion = require("./src/promotion.js");
const coupon = require("./src/coupon.js");
const shift = require("./src/shift.js");


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
      const storeId = data.storeId || data.store_id;
      const isMaster = storeId === '00000000-0000-0000-0000-000000000000';
      io.emit("menu_updated", { store_id: isMaster ? null : storeId, action: 'CREATE' });
    }
  });

  socket.on("updateProduct", async (data) => {
    const result = await product.updateProduct(data);
    socket.emit("return_updateProduct", result);
    if (result.status === 200) {
      const storeId = data.storeId || data.store_id;
      const isMaster = storeId === '00000000-0000-0000-0000-000000000000';
      io.emit("menu_updated", { store_id: isMaster ? null : storeId, action: 'UPDATE' });
    }
  });

  socket.on("cloneProductFromMaster", async (data) => {
    const result = await product.cloneProductFromMaster(data);
    socket.emit("return_cloneProductFromMaster", result);
    if (result.status === 200) {
      io.emit("menu_updated", { store_id: data.target_store_id, action: 'CLONE' });
    }
  });

  socket.on("getProduct", async (store_id) => {
    const result = await product.getProduct(store_id);
    socket.emit("return_getProduct", result);
  });

  socket.on("getMenuSets", async (store_id) => {
    const result = await product.getMenuSets(store_id);
    socket.emit("return_getMenuSets", result);
  });

  // --- Shift Management ---
  socket.on("startShift", async (data) => {
    const result = await shift.startShift(data);
    socket.emit("return_startShift", result);
  });

  socket.on("getShiftSummary", async (shift_id) => {
    const result = await shift.getShiftSummary(shift_id);
    socket.emit("return_getShiftSummary", result);
  });

  socket.on("endShift", async (data) => {
    const result = await shift.endShift(data);
    socket.emit("return_endShift", result);
  });

  socket.on("getCurrentShift", async (store_id) => {
    const result = await shift.getCurrentShift(store_id);
    socket.emit("return_getCurrentShift", result);
  });

  socket.on("getMasterAddonGroups", async () => {
    const result = await product.getMasterAddonGroups();
    socket.emit("return_getMasterAddonGroups", result);
  });

  socket.on("getSyncStatus", async (master_product_id) => {
    const result = await product.getSyncStatus(master_product_id);
    socket.emit("return_getSyncStatus", result);
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

  // --- Coupon Management ---
  socket.on("createCouponCampaign", async (data) => {
    const result = await coupon.createCouponCampaign(data);
    socket.emit("return_createCouponCampaign", result);
  });

  socket.on("getCouponCampaigns", async () => {
    const result = await coupon.getCouponCampaigns();
    socket.emit("return_getCouponCampaigns", result);
  });

  socket.on("getCouponCampaignById", async (id) => {
    const result = await coupon.getCouponCampaignById(id);
    socket.emit("return_getCouponCampaignById", result);
  });

  socket.on("toggleCouponCampaign", async (id) => {
    const result = await coupon.toggleCouponCampaign(id);
    socket.emit("return_toggleCouponCampaign", result);
  });

  socket.on("updateCouponCampaign", async (data) => {
    const result = await coupon.updateCouponCampaign(data);
    socket.emit("return_updateCouponCampaign", result);
  });

  socket.on("appendCoupons", async (data) => {
    const result = await coupon.appendCoupons(data.campaignId, data.count);
    socket.emit("return_appendCoupons", result);
  });

  socket.on("deleteCouponCampaign", async (id) => {
    const result = await coupon.deleteCouponCampaign(id);
    socket.emit("return_deleteCouponCampaign", result);
  });

  socket.on("validateCoupon", async (data) => {
    // data: { code, storeId, productIds }
    const result = await coupon.validateCoupon(data.code, data.storeId, data.productIds);
    socket.emit("return_validateCoupon", result);
  });

  socket.on("markCouponAsUsed", async (data) => {
    // data: { code, orderId }
    const result = await coupon.markCouponAsUsed(data.code, data.orderId);
    socket.emit("return_markCouponAsUsed", result);
  });

  socket.on("getCouponUsage", async (campaignId) => {
    const result = await coupon.getCouponUsage(campaignId);
    socket.emit("return_getCouponUsage", result);
  });

  // --- Member Management ---
  socket.on("getMembers", async (filters) => {
    const result = await member.getMembers(filters);
    socket.emit("return_getMembers", result);
  });

  socket.on("getMemberGroups", async () => {
    const result = await member.getMemberGroups();
    socket.emit("return_getMemberGroups", result);
  });

  socket.on("upsertMember", async (data) => {
    const result = await member.upsertMember(data);
    socket.emit("return_upsertMember", result);
  });

  socket.on("upsertMemberGroup", async (data) => {
    const result = await member.upsertMemberGroup(data);
    socket.emit("return_upsertMemberGroup", result);
  });

  socket.on("deleteMember", async (id) => {
    const result = await member.deleteMember(id);
    socket.emit("return_deleteMember", result);
  });

  socket.on("getMemberTransactions", async (memberId) => {
    const result = await member.getMemberTransactions(memberId);
    socket.emit("return_getMemberTransactions", result);
  });

  socket.on("adjustPoints", async (data) => {
    const result = await member.adjustPoints(data);
    socket.emit("return_adjustPoints", result);
  });

  socket.on("getMemberByCode", async (code) => {
    const result = await member.getMemberByCode(code);
    socket.emit("return_getMemberByCode", result);
  });

  // --- Credit Card Companies ---
  socket.on("getCreditCardCompanies", async () => {
    const result = await config.getCreditCardCompanies();
    socket.emit("return_getCreditCardCompanies", result);
  });

  socket.on("upsertCreditCardCompany", async (data) => {
    const result = await config.upsertCreditCardCompany(data);
    socket.emit("return_upsertCreditCardCompany", result);
  });

  socket.on("deleteCreditCardCompany", async (id) => {
    const result = await config.deleteCreditCardCompany(id);
    socket.emit("return_deleteCreditCardCompany", result);
  });

  // --- Payment Configuration ---
  socket.on("getPaymentConfigs", async () => {
    const result = await config.getPaymentConfigs();
    socket.emit("return_getPaymentConfigs", result);
  });

  socket.on("updatePaymentConfig", async (data) => {
    const result = await config.updatePaymentConfig(data, io);
    socket.emit("return_updatePaymentConfig", result);
  });

  socket.on("triggerPaymentSync", async () => {
    const result = await config.triggerPaymentSync(io);
    socket.emit("return_triggerPaymentSync", result);
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

  socket.on("getOrderDetails", async (orderId) => {
    const result = await order.getOrderDetails(orderId);
    socket.emit("return_getOrderDetails", result);
  });

  // --- Promotions ---
  socket.on("getPromotions", async (store_id) => {
    const result = await promotion.getPromotions(store_id);
    socket.emit("return_getPromotions", result);
  });

  socket.on("createPromotion", async (data) => {
    const result = await promotion.createPromotion(data);
    socket.emit("return_createPromotion", result);
  });

  socket.on("updatePromotion", async (data) => {
    const result = await promotion.updatePromotion(data);
    socket.emit("return_updatePromotion", result);
  });

  socket.on("deletePromotion", async (data) => {
    const result = await promotion.deletePromotion(data);
    socket.emit("return_deletePromotion", result);
  });

  socket.on("togglePromotion", async (id) => {
    const result = await promotion.togglePromotion(id);
    socket.emit("return_togglePromotion", result);
  });

  socket.on("getPromotionById", async (id) => {
    const result = await promotion.getPromotionById(id);
    socket.emit("return_getPromotionById", result);
  });

  socket.on("validatePromotion", async (data) => {
    const result = await promotion.validatePromotion(data);
    socket.emit("return_validatePromotion", result);
  });

  socket.on("getPromotionUsage", async (promotion_id) => {
    const result = await promotion.getPromotionUsage(promotion_id);
    socket.emit("return_getPromotionUsage", result);
  });

  // --- Master Options (Global) ---
  socket.on("getMasterOptions", async () => {
    const result = await masterOption.getMasterOptions();
    socket.emit("return_getMasterOptions", result);
  });

  socket.on("createMasterOption", async (data) => {
    const result = await masterOption.createMasterOption(data);
    socket.emit("return_createMasterOption", result);
  });

  socket.on("updateMasterOption", async (data) => {
    const result = await masterOption.updateMasterOption(data);
    socket.emit("return_updateMasterOption", result);
  });

  socket.on("deleteMasterOption", async (id) => {
    const result = await masterOption.deleteMasterOption(id);
    socket.emit("return_deleteMasterOption", result);
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
