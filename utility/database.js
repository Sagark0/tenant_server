const { Pool } = require("pg");
require("dotenv").config();

let pool;

const getDBPool = () => {
  if (!pool) {
    pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    //   ssl: {
    //     rejectUnauthorized: false, // Use this if your database requires SSL, e.g., for Supabase
    //   },
    });
  }
  return pool;
};
// const getDBPool = () => {
//   if (!pool) {
//     pool = new Pool({ connectionString: process.env.CONNECTIONSTRING });
//   }
//   return pool
// };

module.exports = { getDBPool };
