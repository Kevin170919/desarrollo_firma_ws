const mysql = require("mysql2/promise")

let pool = null

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:               process.env.MYSQL_HOST,
      port:               parseInt(process.env.MYSQL_PORT || "3306"),
      user:               process.env.MYSQL_USER,
      password:           process.env.MYSQL_PASS,
      database:           process.env.MYSQL_DB || "bimetria",
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      timezone:           "Z"
    })
  }
  return pool
}

async function query(sql, params = []) {
  const pool = getPool()
  const [rows] = await pool.execute(sql, params)
  return rows
}

async function testConnection() {
  try {
    await query("SELECT 1")
    console.log("MySQL conectado ✓")
  } catch (error) {
    console.error("Error conectando MySQL:", error.message)
    throw error
  }
}

module.exports = { query, testConnection, getPool }