const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
require("dotenv").config();

const pool = getDBPool();

// GET all tenants
router.get("/", async (req, res) => {
  const { property_id, room_id } = req.query;
  let query = "SELECT * FROM my_schema.tenants";
  const params = [];
  let conditionAdded = false; // Track if WHERE is added

  if (property_id) {
    params.push(property_id);
    query += ` WHERE property_id = $${params.length}`;
    conditionAdded = true;
  }

  if (room_id === 'null' || room_id === null) {
    query += conditionAdded ? ` AND room_id IS NULL` : ` WHERE room_id IS NULL`;
  } else if (room_id) {
    params.push(room_id);
    query += conditionAdded ? ` AND room_id = $${params.length}` : ` WHERE room_id = $${params.length}`;
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});


// POST a new tenant
router.post("/", async (req, res) => {
  const { tenant_name, move_in_date, last_due_created_month, document_type, document_no, phone_no } = req.body;
  console.log(tenant_name);
  const fields = [];
  const values = [];
  const placeholders = [];
  fields.push("tenant_name");
  values.push(tenant_name);
  placeholders.push(`$${values.length}`);
  if (document_type !== undefined) {
    fields.push("document_type");
    values.push(document_type);
    placeholders.push(`$${values.length}`);
  }
  if (document_no !== undefined) {
    fields.push("document_no");
    values.push(document_no);
    placeholders.push(`$${values.length}`);
  }
  if (phone_no !== undefined) {
    fields.push("phone_no");
    values.push(phone_no);
    placeholders.push(`$${values.length}`);
  }
  if (move_in_date !== undefined) {
    fields.push("move_in_date");
    values.push(move_in_date);
    placeholders.push(`$${values.length}`);
  }
  if (last_due_created_month !== undefined) {
    fields.push("last_due_created_month");
    values.push(last_due_created_month);
    placeholders.push(`$${values.length}`);
  }
  const query = `
  INSERT INTO my_schema.tenants (${fields.join(", ")})
  VALUES (${placeholders.join(", ")})
  RETURNING *;
`;
console.log(query);
  try {
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});


// PATCH method to update tenant's room_id
router.patch('/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  const { room_id } = req.body;
  console.log(tenant_id);

  if (room_id === undefined) {
    return res.status(400).json({ error: "room_id is required" });
  }

  const query = `
    UPDATE my_schema.tenants
    SET room_id = $1
    WHERE tenant_id = $2
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [room_id, tenant_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

// UPDATE a tenant
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { tenant_name, room_id, document_type, document_no, phone_no, available_balance, last_due_created_month } =
    req.body;
  try {
    const result = await pool.query(
      "UPDATE my_schema.tenants SET tenant_name = $1, room_id = $2, document_type = $3, document_no = $4, phone_no = $5, available_balance = $6, last_due_created_month = $7  WHERE tenant_id = $8 RETURNING *",
      [tenant_name, room_id, document_type, document_no, phone_no, available_balance, last_due_created_month, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

// DELETE a tenant
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM my_schema.tenants WHERE tenant_id = $1", [id]);
    res.status(204).send();
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

module.exports = router;
