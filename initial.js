const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const axios = require('axios');
const { Client } = require("pg");
const { Pool } = require('pg');

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '500mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app)

httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: Number(process.env.PG_PORT || 5432),
});

// สร้าง Socket.io
const io = require('socket.io')(httpServer, { 
  cors: { origin: '*' }
});

module.exports = { app, io, pool, axios  };
