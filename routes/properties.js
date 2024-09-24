const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getDBPool } = require('../utility/database');
require('dotenv').config();

const pool = getDBPool()

// GET all properties
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM my_schema.properties');
    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'No properties found', data: [] });
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// POST a new property
router.post('/', async (req, res) => {
  const { property_name, property_address } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO my_schema.properties (property_name, property_address) VALUES ($1, $2) RETURNING *',
      [property_name, property_address]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// UPDATE a property
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { property_name, property_address } = req.body;
  console.log(id)
  try {
    const result = await pool.query(
      'UPDATE my_schema.properties SET property_name = $1, property_address = $2 WHERE property_id = $3 RETURNING *',
      [property_name, property_address, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

// DELETE a property
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM my_schema.properties WHERE property_id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).send('Error executing query');
  }
});

module.exports = router;
