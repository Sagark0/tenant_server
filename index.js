const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send("OK");
})

// Import routes
const propertyRoutes = require('./routes/properties');
const roomRoutes = require('./routes/rooms');
const tenantRoutes = require('./routes/tenants');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const utilityRoutes = require('./routes/utility');
// Use routes
app.use('/properties', propertyRoutes);
app.use('/rooms', roomRoutes);
app.use('/tenants', tenantRoutes);
app.use('/payments', paymentRoutes);
app.use('/notifications', notificationRoutes);
app.use('/utility', utilityRoutes)
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
