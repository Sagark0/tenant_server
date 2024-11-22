const express = require("express");
const router = express.Router();
const moment = require("moment");
const { getDBPool } = require("../utility/database");
const { schema } = require("../utility/constants");
const { sendBulkPushNotification } = require("../utility/pushNotification");
const pool = getDBPool();

// manage add payment
router.post("/:room_id", async (req, res) => {
  const { payment_amount, new_electricity_reading, prev_electricity_reading, electricity_rate } =
    req.body;
  const { room_id } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Step 1: Fetch all pending dues for the room, ordered by due_date
    const duesResult = await client.query(
      `SELECT * FROM ${schema}.dues WHERE room_id = $1 AND (status = 'Pending' OR status = 'Partially Paid') ORDER BY due_date`,
      [room_id]
    );

    let amountPaid = parseFloat(payment_amount);

    for (const due of duesResult.rows) {
      if (amountPaid <= 0) break; // Stop if there's no more payment to allocate
      const { due_id, due_amount, payment_remaining } = due;
      let status = "Paid";
      var remainingAmount;
      if (amountPaid < payment_remaining) {
        // If payment_amount < due_amount, subtract from due_amount and update the due
        remainingAmount = payment_remaining - amountPaid;
        status = "Partially Paid";
        // await client.query(
        //   `UPDATE ${schema}.dues SET payment_remaining = $1, status = 'Partially Paid' WHERE due_id = $2`,
        //   [remainingAmount, due_id]
        // );
        amountPaid = 0; // All payment has been allocated
      } else {
        // Step 4: If payment_amount > due_amount, mark the due as paid and continue to the next one
        // await client.query(
        //   `UPDATE ${schema}.dues SET payment_remaining = 0, status = 'Paid' WHERE due_id = $1`,
        //   [due_id]
        // );
        remainingAmount = 0;
        amountPaid -= due_amount;
      }
      await client.query(
        `UPDATE ${schema}.dues SET payment_remaining = $1, status = $2 WHERE due_id = $3`,
        [remainingAmount, status, due_id]
      );
    }

    if (
      Number(prev_electricity_reading) &&
      Number(new_electricity_reading) &&
      Number(new_electricity_reading) > Number(prev_electricity_reading)
    ) {
      const new_electricity_due =
        (parseFloat(new_electricity_reading) - parseFloat(prev_electricity_reading)) *
        electricity_rate;
      var status;
      console.log({ "new due": new_electricity_due });
      var electricity_remaining_amount;
      if (amountPaid == 0) {
        status = "Pending";
        electricity_remaining_amount = new_electricity_due;
      } else if (amountPaid < new_electricity_due) {
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
        [room_id, new_electricity_due, electricity_remaining_amount, status]
      );
      await client.query(`UPDATE ${schema}.rooms SET electricity_reading = $1 WHERE room_id = $2`, [
        new_electricity_reading,
        room_id,
      ]);
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

    await client.query("COMMIT");
    res.status(201).json(paymentResult.rows);
  } catch (err) {
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

// fetch all dues status IN {Partial, Pending}
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

router.get("/notificationDues/:date", async (req, res) => {
  const { date } = req.params;
  try {
    const result = await pool.query(
      `SELECT d.*, p.property_name, r.room_no from ${schema}.dues d 
      join ${schema}.rooms r on d.room_id = r.room_id 
      join ${schema}.properties p on r.property_id = p.property_id 
      where DATE(d.created_at) = $1 ORDER BY due_date DESC`,
      [date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

router.get("/roomDues", async (req, res) => {
  const query = `SELECT room_id, min(due_date) as min_due_date from ${schema}.dues where status != 'Paid' group by room_id`;
  try {
    const result = await pool.query(query);
    const resultMap = new Map();
    result.rows.forEach((row) => {
      const today = moment().startOf("day");
      const min_due_date = moment(row.min_due_date);
      const color = min_due_date.isBefore(today) ? "red" : "orange";
      resultMap.set(row.room_id, color);
    });
    const resultArray = Array.from(resultMap);
    res.json(resultArray);
  } catch (err) {
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  }
});

router.get("/generateDues", async (req, res) => {
  let client;
  let duesCreatedCount = 0;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const roomsResult = await client.query(
      `SELECT room_id, last_due_created_month, available_balance, room_rent FROM ${schema}.rooms where seat_occupied != 0`
    ); // Selecting all rooms where seat occupied is not 0
    const rooms = roomsResult.rows;
    const today = moment().startOf("day");
    console.log("Called Generate Due");

    for (const room of rooms) {
      const { room_id, last_due_created_month, available_balance, room_rent } = room;

      // Calculate the next due creation date by adding 20 days to the last_due_created_month
      var nextDueCreatedDate = moment(last_due_created_month).add(20, "days");
      var new_available_balance = available_balance;
      var new_last_due_created_month = last_due_created_month;
      // Check if the next due creation date is less than today
      if (nextDueCreatedDate.isBefore(today)) {
        while (nextDueCreatedDate.isBefore(today)) {
          var dueDate = moment(new_last_due_created_month).add(1, "month"); // Next month of last_due_created_month
          let dueStatus = "Pending";
          let paymentRemaining = room_rent;

          if (new_available_balance > room_rent) {
            new_available_balance = new_available_balance - room_rent;
            dueStatus = "Paid";
            paymentRemaining = 0;
          } else if (new_available_balance > 0 && new_available_balance < room_rent) {
            new_available_balance = 0;
            dueStatus = "Partially Paid";
            paymentRemaining = room_rent - new_available_balance;
          }

          // Insert the due record in the dues table with the formatted date
          await client.query(
            `INSERT INTO ${schema}.dues (room_id, due_amount, due_date, status, payment_remaining) VALUES ($1, $2, $3, $4, $5)`,
            [room_id, room_rent, dueDate.format("YYYY-MM-DD"), dueStatus, paymentRemaining]
          );
          duesCreatedCount++;
          new_last_due_created_month = dueDate;
          nextDueCreatedDate = moment(new_last_due_created_month).add(20, "days");
        }
        // Update the room's last_due_created_month with the formatted date
        await client.query(
          `UPDATE ${schema}.rooms SET last_due_created_month = $1, available_balance = $2 WHERE room_id = $3`,
          [dueDate.format("YYYY-MM-DD"), new_available_balance, room_id]
        );

        console.log(
          `Due created for room_id: ${room_id} for date: ${dueDate.format("YYYY-MM-DD")}`
        );
      }
    }
    if (duesCreatedCount) {
      const result = await client.query(`SELECT expo_push_token from ${schema}.devices`);
      const pushTokens = result.rows.map((res) => res.expo_push_token);
      const body = `${duesCreatedCount} new ${duesCreatedCount > 1 ? "Dues" : "Due"} created.`;
      const title = "New Dues Created";
      await client.query(
        `INSERT INTO ${schema}.notifications (notification_title, notification_body, notification_type) values($1, $2, $3)`,
        [title, body, "dues"]
      );
      const response = await sendBulkPushNotification(pushTokens, body, title);
      console.log("Notification Respone", response);
    }
    await client.query("COMMIT");

    res.status(200).json({ message: "Dues generated successfully", duesCreated: duesCreatedCount });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("Error executing query", err.stack);
    res.status(500).send("Error executing query");
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
