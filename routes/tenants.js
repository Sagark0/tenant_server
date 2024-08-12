const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getDBPool } = require('../utility/database');
require('dotenv').config();

// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT,
// });

const pool = getDBPool()

// GET all tenants
router.get('/', async (req, res) => {
  const { property_id, room_id } = req.query;
  let query = 'SELECT * FROM my_schema.tenants';
  const params = [];
  
  if (property_id) {
    params.push(property_id);
    query += ` WHERE property_id = $${params.length}`;
  }
  
  if (room_id) {
    params.push(room_id);
    query += params.length === 1 ? ` WHERE room_id = $${params.length}` : ` AND room_id = $${params.length}`;
  }
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// POST a new tenant
router.post('/', async (req, res) => {
  const { tenant_name, room_id, document_type, document_no, phone_no } = req.body;

  const fields = [];
  const values = [];
  const placeholders = [];
  fields.push('tenant_name');
  values.push(tenant_name);
  placeholders.push(`$${values.length}`); 
  if (room_id !== undefined) {
    fields.push('room_id');
    values.push(room_id);
    placeholders.push(`$${values.length}`);
  }
  if (document_type !== undefined) {
    fields.push('document_type');
    values.push(document_type);
    placeholders.push(`$${values.length}`);
  }
  if (document_no !== undefined) {
    fields.push('document_no');
    values.push(document_no);
    placeholders.push(`$${values.length}`);
  }
  if (phone_no !== undefined) {
    fields.push('phone_no');
    values.push(phone_no);
    placeholders.push(`$${values.length}`);
  }
  const query = `
  INSERT INTO my_schema.tenants (${fields.join(', ')})
  VALUES (${placeholders.join(', ')})
  RETURNING *;
`;
  try {
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// UPDATE a tenant
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { tenant_name, room_id, document_type, document_no, phone_no } = req.body;
  try {
    const result = await pool.query(
      'UPDATE my_schema.tenants SET tenant_name = $1, room_id = $2, document_type = $3, document_no = $4, phone_no = $5  WHERE tenant_id = $6 RETURNING *',
      [tenant_name, room_id, document_type, document_no, phone_no, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// DELETE a tenant
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM my_schema.tenants WHERE tenant_id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

module.exports = router;
