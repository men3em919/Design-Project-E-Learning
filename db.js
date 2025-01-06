const { Pool } = require('pg');

// Configure the connection pool
const pool = new Pool({
    user: 'postgres', // Replace with your PostgreSQL username
    host: 'localhost',
    database: 'postgres', // Replace with your database name
    password: 'postgres', // Replace with your password
    port: 5432, // Default PostgreSQL port
});
const db = {
    query: (text, params) => pool.query(text, params),
  };
module.exports = pool;
