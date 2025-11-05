const mysql = require('mysql2');
const express = require('express');
const path = require('path');
const ejsMate = require('ejs-mate');
const wrapAsync = require('./utils/wrapAsync.js');
const ExpressError = require('./utils/expressError.js');
const { v4: uuidv4 } = require('uuid');
const { resourceLimits } = require('worker_threads');

const app = express();

// require('dotenv').config();
// const nodemailer = require('nodemailer');
// const crypto = require('crypto');


// Set up EJS-Mate and view engine
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs'); 
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'watchlist',
  password: 'Tejaswi49!'
});

// Routes
app.get('/', (req, res) => {
  res.send('Server running fine!');
});

app.get('/watchlist/login', wrapAsync(async (req, res) => {
  res.render("pages/login", { title: "Login" });
}));

app.get('/watchlist/register', wrapAsync(async (req, res) => {
    const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const crypto = require('crypto');}))

// REGISTER ROUTE WITH OTP
/*app.post('/watchlist/register', wrapAsync(async (req, res) => {
  const { name, email, password } = req.body;

  // Hash password for security
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set OTP expiry (e.g., 10 minutes)
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  // Insert or update user with OTP
  const q = `
    INSERT INTO user (name, email, password, verified, otp, otp_expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
    otp = VALUES(otp), otp_expires_at = VALUES(otp_expires_at), verified = 0
  `;

  connection.query(q, [name, email, hashedPassword, 0, otp, otpExpiry], async (err) => {
    if (err) {
      console.error("Error inserting user:", err);
      return res.status(500).send("Registration failed or user already exists.");
    }

    // Send OTP Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: 'Your OTP for Email Verification',
      html: `<p>Hi ${name},</p>
             <p>Your OTP is: <b>${otp}</b></p>
             <p>This code will expire in 10 minutes.</p>`
    });

    // Redirect to OTP entry page
    res.redirect(`/verify-otp?email=${email}`);
  });
}));

}));






// Show OTP input form
app.get('/verify-otp', (req, res) => {
  const { email } = req.query;
  res.render('pages/verify-otp', { title: "Verify OTP", email });
});

// Handle OTP submission
app.post('/verify-otp', wrapAsync(async (req, res) => {
  const { email, otp } = req.body;

  const q = "SELECT * FROM user WHERE email = ? AND otp = ?";
  connection.query(q, [email, otp], (err, results) => {
    if (err) return res.status(500).send("Server error");
    if (results.length === 0) return res.status(400).send("Invalid OTP");

    const user = results[0];
    const now = new Date();

    if (new Date(user.otp_expires_at) < now) {
      return res.status(400).send("OTP expired. Please register again.");
    }

    const updateQ = "UPDATE user SET verified = 1, otp = NULL, otp_expires_at = NULL WHERE email = ?";
    connection.query(updateQ, [email], (err2) => {
      if (err2) return res.status(500).send("Error updating user status");

      res.send("🎉 Email verified successfully! You can now log in.");
    });
  });
}));
*/


app.get('/watchlist/home', wrapAsync(async (req, res) => {
  const q = "select s.series_id, s.title, s.release_year, s.summary, s.platform, s.poster_url, s.series_rating,g.genre_id, g.genre_name from series s join series_genres sg on s.series_id = sg.series_id JOIN genres g on sg.genre_id = g.genre_id ORDER BY s.series_id,g.genre_name;";

  connection.query(q, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Internal Server Error");
    }

    res.render("pages/home.ejs", {results});
  });
}));

// Error handling
app.all('/', (req, res, next) => {
  next(new ExpressError('Page Not Found', 404));
});

app.use((err, req, res, next) => {
  const { statusCode = 500, message = 'Something went wrong' } = err;
  res.status(statusCode).send(message);
});

// Start server
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});


