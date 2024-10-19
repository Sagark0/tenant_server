const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
const { schema } = require("../utility/constants");
const pool = getDBPool();

router.get("/", async (req, res) => {
  const query = `SELECT * FROM ${schema}.notifications ORDER BY notification_date_time DESC`;
  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch(err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

module.exports = router;
