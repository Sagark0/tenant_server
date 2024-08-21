const express = require("express");
const router = express.Router();
const { getDBPool } = require("../utility/database");
const moment = require("moment");
const { schema } = require("../utility/constants");
const pool = getDBPool();

// manage add payment
router.post("/:tenant_id", async (req, res) => {
  const { payment_amount } = req.body;
  const { tenant_id } = req.params;
  let client;
  try {
    client = await pool.connect();

    // Start a transaction
    await client.query("BEGIN");

    // Step 1: Fetch all pending dues for the tenant, ordered by due_date in reverse (latest first)
    const duesResult = await client.query(
      `SELECT * FROM ${schema}.dues WHERE tenant_id = $1 AND (status = 'Pending' OR status = 'Partially Paid') ORDER BY due_date DESC`,
      [tenant_id]
    );

    let amountPaid = payment_amount;  // amount paid

    for (const due of duesResult.rows) {
      if (amountPaid <= 0) break; // Stop if there's no more payment to allocate

      const { due_id, due_amount, payment_remaining } = due;

      if (amountPaid < payment_remaining) {
        // Step 2: If payment_amount < due_amount, subtract from due_amount and update the due
        const remainingAmount = payment_remaining - amountPaid
        await client.query(
          `UPDATE ${schema}.dues SET payment_remaining = $1, status = 'Partially Paid' WHERE due_id = $2`,
          [remainingAmount, due_id]
        );
        amountPaid = 0; // All payment has been allocated
      } else {
        // Step 4: If payment_amount > due_amount, mark the due as paid and continue to the next one
        await client.query(`UPDATE ${schema}.dues SET payment_remaining = 0, status = 'Paid' WHERE due_id = $1`, [due_id]);
        amountPaid -= due_amount;
      }
    }

    // Step 5: If there's any remaining payment, add it to the tenant's available balance
    if (amountPaid > 0) {
      await client.query(
        `UPDATE ${schema}.tenants SET available_balance = available_balance + $1 WHERE tenant_id = $2`,
        [amountPaid, tenant_id]
      );
    }

    // Insert the payment record
    const paymentResult = await client.query(
      `INSERT INTO ${schema}.payments(payment_amount, tenant_id) VALUES ($1, $2) RETURNING *`,
      [payment_amount, tenant_id]
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
    const result = await pool.query(`SELECT * from ${schema}.dues where tenant_id = $1 ORDER BY due_date DESC`, [id]);
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

    const tenantsResult = await client.query(
      `SELECT tenant_id, last_due_created_month, available_balance FROM ${schema}.tenants`
    );
    const tenants = tenantsResult.rows;
    const today = moment().startOf("day");
    const rate_of_room = 3000;

    for (const tenant of tenants) {
      const { tenant_id, last_due_created_month, available_balance } = tenant;

      // Calculate the next due creation date by adding 20 days to the last_due_created_month
      const nextDueCreatedDate = moment(last_due_created_month).add(20, "days");

      // Check if the next due creation date is less than today
      if (nextDueCreatedDate.isBefore(today)) {
        const dueDate = moment(last_due_created_month).add(1, "month"); // Next month of last_due_created_month
        let dueAmount = rate_of_room; // Amount to be paid
        let dueStatus = "Pending";
        let paymentRemaining = dueAmount;

        // Apply the conditions based on available balance
        if (available_balance > dueAmount) {
          // Case 1: available_balance > due_amount
          await client.query(
            `UPDATE ${schema}.tenants SET available_balance = available_balance - $1 WHERE tenant_id = $2`,
            [dueAmount, tenant_id]
          );
          dueStatus = "Paid";
          paymentRemaining = 0;
        } else if (available_balance > 0 && available_balance < dueAmount) {
          // Case 3: available_balance < due_amount
          await client.query(
            `UPDATE ${schema}.tenants SET available_balance = 0 WHERE tenant_id = $1`,
            [tenant_id]
          );
          dueStatus = "Partially Paid";
          paymentRemaining = dueAmount - available_balance;
        }

        // Insert the due record in the dues table with the formatted date
        await client.query(
          `INSERT INTO ${schema}.dues (tenant_id, due_amount, due_date, status, payment_remaining) VALUES ($1, $2, $3, $4, $5)`,
          [tenant_id, dueAmount, dueDate.format("DD-MM-YYYY"), dueStatus, paymentRemaining]
        );

        // Update the tenant's last_due_created_month with the formatted date
        await client.query(
          `UPDATE ${schema}.tenants SET last_due_created_month = $1 WHERE tenant_id = $2`,
          [dueDate.format("DD-MM-YYYY"), tenant_id]
        );

        console.log(
          `Due created for tenant_id: ${tenant_id} for date: ${dueDate.format("DD-MM-YYYY")}`
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
