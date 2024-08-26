const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
require("dotenv").config();

const pool = getDBPool();
// GET all rooms
router.get("/", async (req, res) => {
  const { property_id } = req.query;
  try {
    const result = await pool.query(
      "SELECT * FROM my_schema.rooms where property_id=$1 order by room_no",
      [property_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

// POST a new room
router.post("/", async (req, res) => {
  const { property_id, room_no, room_rent, room_capacity, electricity_reading } = req.body;
  console.log("room details", req.body);

  try {
    let query = "INSERT INTO my_schema.rooms (property_id, room_no, room_rent, room_capacity";
    let values = [property_id, room_no, room_rent, room_capacity];
    let placeholders = ["$1", "$2", "$3", "$4"];

    if (electricity_reading !== undefined) {
      query += ", electricity_reading";
      placeholders.push(`$${values.length + 1}`);
      values.push(electricity_reading);
    }

    query += `) VALUES (${placeholders.join(", ")}) RETURNING *`;

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

// UPDATE a room
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { property_id, room_no, room_rent, room_capacity, electricity_reading, security_deposit } =
    req.body;
  try {
    const result = await pool.query(
      "UPDATE my_schema.rooms SET property_id = $1, room_no = $2, room_capacity = $3, room_rent = $4, electricity_reading = $5, security_deposit = $6 WHERE room_id = $7 RETURNING *",
      [property_id, room_no, room_capacity, room_rent, electricity_reading, security_deposit, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

// DELETE a room
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM my_schema.rooms WHERE room_id = $1", [id]);
    res.status(204).send();
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

module.exports = router;
