require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')

const authRoutes = require('./routes/auth')
const packRoutes = require('./routes/packs')
const shiftRoutes = require('./routes/shifts')
const userRoutes = require('./routes/users')
const settingsRoutes = require('./routes/settings')

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/packs', packRoutes)
app.use('/api/shifts', shiftRoutes)
app.use('/api/users', userRoutes)
app.use('/api/settings', settingsRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
