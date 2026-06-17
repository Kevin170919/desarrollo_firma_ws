const express = require("express")
const router  = express.Router()
const bcrypt  = require("bcrypt")
const jwt     = require("jsonwebtoken")
const { query } = require("../services/db.service")

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "username y password requeridos" })
    }

    const rows = await query(
      "SELECT * FROM tenants WHERE username = ? AND active = 1",
      [username]
    )

    if (!rows.length) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" })
    }

    const tenant = rows[0]
    const valid  = await bcrypt.compare(password, tenant.password_hash)

    if (!valid) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" })
    }

    const token = jwt.sign(
      { tenantId: tenant.id, username: tenant.username },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    )

    return res.json({
      success: true,
      token,
      expiresIn: "30m",
      tenant: {
        id:   tenant.id,
        name: tenant.name
      }
    })
  } catch (error) {
    console.error("Error en login:", error.message)
    return res.status(500).json({ success: false, message: error.message })
  }
})

module.exports = router