const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
const moment = require("moment");
const { schema } = require("../utility/constants");
const pool = getDBPool();

// manage add payment
router.post("/:room_id", async (req, res) => {
  const { payment_amount, new_electricity_reading, prev_electricity_reading, electricity_rate } = req.body;
  const { room_id } = req.params;
  console.log(req.body);
  let client;
  try {
    client = await pool.connect();

    // Start a transaction
    await client.query("BEGIN");

    // Step 1: Fetch all pending dues for the room, ordered by due_date in reverse (latest first)
    const duesResult = await client.query(
      `SELECT * FROM ${schema}.dues WHERE room_id = $1 AND (status = 'Pending' OR status = 'Partially Paid') ORDER BY due_date DESC`,
      [room_id]
    );

    let amountPaid = payment_amount; // amount paid

    for (const due of duesResult.rows) {
      if (amountPaid <= 0) break; // Stop if there's no more payment to allocate

      const { due_id, due_amount, payment_remaining } = due;

      if (amountPaid < payment_remaining) {
        // Step 2: If payment_amount < due_amount, subtract from due_amount and update the due
        const remainingAmount = payment_remaining - amountPaid;
        await client.query(
          `UPDATE ${schema}.dues SET payment_remaining = $1, status = 'Partially Paid' WHERE due_id = $2`,
          [remainingAmount, due_id]
        );
        amountPaid = 0; // All payment has been allocated
      } else {
        // Step 4: If payment_amount > due_amount, mark the due as paid and continue to the next one
        await client.query(
          `UPDATE ${schema}.dues SET payment_remaining = 0, status = 'Paid' WHERE due_id = $1`,
          [due_id]
        );
        amountPaid -= due_amount;
      }
    }

    if ( amountPaid > 0 && new_electricity_reading && new_electricity_reading > prev_electricity_reading ){
      const new_electricity_due = (parseFloat(new_electricity_reading) - parseFloat(prev_electricity_reading)) * electricity_rate;
      var status;
      console.log({'new due': new_electricity_due})
      var electricity_remaining_amount;
      if (amountPaid < new_electricity_due) {
        status = "Partially Paid";
        electricity_remaining_amount = new_electricity_due - amountPaid;
        amountPaid = 0;
      } else {
        status = "Paid";
        electricity_remaining_amount = 0;
        amountPaid = amountPaid - new_electricity_due;
      }
      await client.query(
        `INSERT INTO ${schema}.dues (room_id, due_date, due_amount, payment_remaining, status) VALUES ($1, NOW(), $2, $3, $4) RETURNING *`,
        [
          room_id,
          new_electricity_due,
          electricity_remaining_amount,  
          status             
        ]
      );
      await client.query(
        `UPDATE ${schema}.rooms SET electricity_reading = $1 WHERE room_id = $2`,
        [new_electricity_reading, room_id]
      );
    }
    // Step 5: If there's any remaining payment, add it to the room's available balance
    if (amountPaid > 0) {
      await client.query(
        `UPDATE ${schema}.rooms SET available_balance = available_balance + $1 WHERE room_id = $2`,
        [amountPaid, room_id]
      );
    }

    // Insert the payment record
    const paymentResult = await client.query(
      `INSERT INTO ${schema}.payments(payment_amount, room_id) VALUES ($1, $2) RETURNING *`,
      [payment_amount, room_id]
    );

    // Commit the transaction
    await client.query("COMMIT");

    res.status(201).json(paymentResult.rows);
  } catch (err) {
    // If there's an error, rollback the transaction
    if (client) await client.query("ROLLBACK");
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  } finally {
    if (client) client.release();
  }
});

// fetch dues with tenant id
router.get("/dues/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * from ${schema}.dues where room_id = $1 ORDER BY due_date DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

router.get("/dues", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.property_name, r.room_no, d.*
      from ${schema}.dues d join ${schema}.rooms r on d.room_id = r.room_id  
      join ${schema}.properties p on r.property_id = p.property_id 
      WHERE d.status IN ('Pending', 'Partially Paid') ORDER BY d.due_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

router.get("/generateDues", async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    // Start a transaction
    await client.query("BEGIN");

    const roomsResult = await client.query(
      `SELECT room_id, last_due_created_month, available_balance, room_rent, seat_occupied FROM ${schema}.rooms`
    );
    const rooms = roomsResult.rows;
    const today = moment().startOf("day");
    console.log("Called Generate Due");
    for (const room of rooms) {
      const { room_id, last_due_created_month, available_balance, room_rent, seat_occupied } = room;

      if (seat_occupied == 0) continue;

      // Calculate the next due creation date by adding 20 days to the last_due_created_month
      const nextDueCreatedDate = moment(last_due_created_month).add(20, "days");

      // Check if the next due creation date is less than today
      if (nextDueCreatedDate.isBefore(today)) {
        const dueDate = moment(last_due_created_month).add(1, "month"); // Next month of last_due_created_month
        let dueAmount = room_rent; // Amount to be paid
        let dueStatus = "Pending";
        let paymentRemaining = dueAmount;

        // Apply the conditions based on available balance
        if (available_balance > dueAmount) {
          // Case 1: available_balance > due_amount
          await client.query(
            `UPDATE ${schema}.rooms SET available_balance = available_balance - $1 WHERE room_id = $2`,
            [dueAmount, room_id]
          );
          dueStatus = "Paid";
          paymentRemaining = 0;
        } else if (available_balance > 0 && available_balance < dueAmount) {
          // Case 3: available_balance < due_amount
          await client.query(
            `UPDATE ${schema}.rooms SET available_balance = 0 WHERE room_id = $1`,
            [room_id]
          );
          dueStatus = "Partially Paid";
          paymentRemaining = dueAmount - available_balance;
        }

        // Insert the due record in the dues table with the formatted date
        await client.query(
          `INSERT INTO ${schema}.dues (room_id, due_amount, due_date, status, payment_remaining) VALUES ($1, $2, $3, $4, $5)`,
          [room_id, dueAmount, dueDate.format("DD-MM-YYYY"), dueStatus, paymentRemaining]
        );

        // Update the room's last_due_created_month with the formatted date
        await client.query(
          `UPDATE ${schema}.rooms SET last_due_created_month = $1 WHERE room_id = $2`,
          [dueDate.format("YYYY-MM-DD"), room_id]
        );

        console.log(
          `Due created for room_id: ${room_id} for date: ${dueDate.format("YYYY-MM-DD")}`
        );
      }
    }

    // Commit the transaction
    await client.query("COMMIT");

    res.status(204).send(); // No content response
  } catch (err) {
    // If there's an error, rollback the transaction
    if (client) await client.query("ROLLBACK");
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
