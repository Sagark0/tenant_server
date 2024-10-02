const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
const { schema, bucketName } = require("../utility/constants");
const { supabase } = require("../utility/supabaseClient");
const { sendPushNotification, sendBulkPushNotification } = require("../utility/pushNotification");
require("dotenv").config();
const pool = getDBPool();

router.get("/clearStorage", async (req, res) => {
  const query = `SELECT documents from ${schema}.tenants`;
  const result = await pool.query(query);
  const documents = result.rows;
  const documentSet = new Set();
  for (let docs of documents) {
    if (docs.documents) {
      for (let file of docs.documents) {
        documentSet.add(file);
      }
    }
  }
  const { data, error } = await supabase.storage.from(bucketName).list("documents");
  if (!error) {
    console.log(data);
  }
  console.log(documentSet);
  res.send(documentSet);
});

router.get("/sendBulkNotifications", async (req, res) => {
  const body = "This is Test Notificaiton";
  const title = "New Title";
  const query = `SELECT expo_push_token from ${schema}.devices`;
  const result = await pool.query(query);
  console.log(result.rows);
  const pushTokens = result.rows.map((res) => res.expo_push_token);
  sendBulkPushNotification(pushTokens, body, title);
  res.send("Notifications Sent");
});

router.get("/sendPushNotification", async (req, res) => {
  sendPushNotification("ExponentPushToken[4k9udtN7c1NZ7Un5Rreh__]");
  res.send("Notificaiton Sent");
});

router.post("/addPushToken", async (req, res) => {
  const { token } = req.body;
  const query = `INSERT INTO ${schema}.devices (expo_push_token) values($1) RETURNING *`;

  try {
    const result = await pool.query(query, [token]);
    res.json(result.rows[0]); 
  } catch (err) {
    if (err.code === "23505") {
      console.error("Duplicate token error", err.stack);
      const findQuery = `SELECT * FROM ${schema}.devices WHERE expo_push_token = $1`;
      try {
        const existingToken = await pool.query(findQuery, [token]);
        if (existingToken.rows.length > 0) {
          res.status(409).json({
            message: "Expo push token already exists",
            record: existingToken.rows[0],
          });
        } else {
          res.status(409).json({ message: "Expo push token already exists, but no record found." });
        }
      } catch (findErr) {
        console.error("Error querying existing token", findErr.stack);
        res.status(500).send("Error querying existing token");
      }
    } else {
      console.error("Error executing query", err.stack);
      res.status(500).send("Error executing query");
    }
  }
});

router.put("/addPushToken/:device_id", async (req, res) => {
  const { device_id } = req.params;
  const { token } = req.body;
  const query = `UPDATE ${schema}.devices SET expo_push_token = $1 WHERE device_id=$2 RETURNING *`;
  try {
    const result = await pool.query(query, [token, device_id]);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      console.error("Duplicate token error", err.stack);
      res.status(409).json({ message: "Expo push token already exists" });
    } else {
      console.error("Error executing query", err.stack);
      res.status(500).send("Error executing query");
    }
  }
});

module.exports = router;
