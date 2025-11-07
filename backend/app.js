// app.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const ejsMate = require('ejs-mate');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const wrapAsync = require('./utils/wrapAsync.js');
const ExpressError = require('./utils/expressError.js');
const nodemailer = require('nodemailer');
dotenv.config();

// ✅ Initialize app
const app = express();

// ✅ Session configuration
app.use(session({
  secret: 'yourSecretKeyHere',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true only if using HTTPS
}));

// ✅ App settings
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'watchlist',
  password: 'Tejaswi49!',
  multipleStatements: true 
});

connection.connect(err => {
  if (err) console.error('❌ Database connection failed:', err);
  else console.log('✅ Connected to MySQL database.');
});

// ---------------------------------------------------------
// MAKE LOGGED-IN USER AVAILABLE IN ALL EJS TEMPLATES
// ---------------------------------------------------------
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ---------------------------------------------------------
// ROUTES
// ---------------------------------------------------------

// Root
app.get('/', (req, res) => {
  res.send('Server running fine!');
});

// Login page
app.get('/watchlist/login', wrapAsync(async (req, res) => {
  const message = req.query.verified === 'success' ? '✅ Verification successful! Please log in.' : null;
  res.render('pages/login', { title: 'Login', message });
}));

// Register page
app.get('/watchlist/register', wrapAsync(async (req, res) => {
  res.render('pages/register', { title: 'Register' });
}));

// Register POST with OTP
app.post('/watchlist/register', wrapAsync(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send('All fields are required.');

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  const q = `
    INSERT INTO user (name, email, password, verified, otp, otp_expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      otp = VALUES(otp),
      otp_expires_at = VALUES(otp_expires_at),
      verified = 0,
      password = VALUES(password)
  `;

  connection.query(q, [name, email, hashedPassword, 0, otp, otpExpiry], async (err) => {
    if (err) return res.status(500).send("Registration failed.");

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASS }
      });

      await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: 'Your OTP for Email Verification',
        html: `<p>Hi ${name},</p><p>Your OTP is: <b>${otp}</b></p><p>This code will expire in 10 minutes.</p>`
      });

      console.log(`✅ OTP sent to ${email}`);
      res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
      res.status(500).send("Error sending OTP email.");
    }
  });
}));

// Login POST
app.post('/watchlist/login', wrapAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.render('pages/login', { title: 'Login', message: '⚠️ Please fill in all fields.' });

  const q = "SELECT * FROM user WHERE email = ?";
  connection.query(q, [email], async (err, results) => {
    if (err) return res.render('pages/login', { title: 'Login', message: '⚠️ Server error. Try again later.' });
    if (results.length === 0) return res.render('pages/login', { title: 'Login', message: '❌ No account found with this email.' });

    const user = results[0];
    if (!user.verified) return res.render('pages/login', { title: 'Login', message: '⚠️ Please verify your email before logging in.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.render('pages/login', { title: 'Login', message: '❌ Incorrect password.' });

    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.message = `🎉 Welcome back, ${user.name}!`;

    console.log(`✅ ${user.name} logged in successfully.`);
    res.redirect('/watchlist/home');
  });
}));

// OTP Verification GET
app.get('/verify-otp', (req, res) => {
  const { email } = req.query;
  res.render('pages/verify-otp', { title: "Verify OTP", email });
});

// OTP Verification POST
app.post('/verify-otp', wrapAsync(async (req, res) => {
  const { email, otp } = req.body;
  const q = "SELECT * FROM user WHERE email = ? AND otp = ?";
  connection.query(q, [email, otp], (err, results) => {
    if (err) return res.status(500).send("Server error");
    if (results.length === 0) return res.status(400).send("Invalid OTP");

    const user = results[0];
    if (new Date(user.otp_expires_at) < new Date()) return res.status(400).send("OTP expired. Please register again.");

    const updateQ = "UPDATE user SET verified = 1, otp = NULL, otp_expires_at = NULL WHERE email = ?";
    connection.query(updateQ, [email], (err2) => {
      if (err2) return res.status(500).send("Error updating user status");
      res.redirect('/watchlist/login?verified=success');
    });
  });
}));

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.redirect('/watchlist/home');
    res.clearCookie('connect.sid');
    res.redirect('/watchlist/login');
  });
});

// Home page
app.get('/watchlist/home', wrapAsync(async (req, res) => {
  if (!req.session.user) return res.redirect('/watchlist/login');

  const q = `
    SELECT s.series_id, s.title, s.release_year, s.summary, s.platform, 
           s.poster_url, s.series_rating, g.genre_id, g.genre_name
    FROM series s 
    JOIN series_genres sg ON s.series_id = sg.series_id 
    JOIN genres g ON sg.genre_id = g.genre_id 
    ORDER BY s.series_id, g.genre_name;
  `;

  connection.query(q, (err, results) => {
    if (err) return res.status(500).send("Internal Server Error");
    const message = req.session.message || null;
    req.session.message = null;
    res.render("pages/home.ejs", { results, user: req.session.user, message });
  });
}));

// Series detail page with seasons & episodes
app.get('/watchlist/series/:id', (req, res) => {
  const seriesId = req.params.id;

  const seriesQuery = `
    SELECT s.series_id, s.title, s.release_year, s.summary, s.platform, 
           s.poster_url, s.series_rating, s.trailer_url, g.genre_name
    FROM series s
    JOIN series_genres sg ON s.series_id = sg.series_id
    JOIN genres g ON sg.genre_id = g.genre_id
    WHERE s.series_id = ?
  `;

  const seasonsQuery = `
    SELECT se.season_id, se.number AS season_number, se.title AS season_title, se.overview AS season_overview, se.poster_url AS season_poster
    FROM seasons se
    WHERE se.series_id = ?
    ORDER BY se.number
  `;

  const episodesQuery = `
    SELECT e.episode_id, e.season_id, e.number AS episode_number, e.title AS episode_title, e.overview AS episode_overview, e.air_date
    FROM episodes e
    JOIN seasons s ON e.season_id = s.season_id
    WHERE s.series_id = ?
    ORDER BY e.season_id, e.number
  `;

  const recommendedQuery = `
    SELECT 
      s.series_id AS id,
      s.title,
      s.poster_url,
      s.series_rating,
      GROUP_CONCAT(g.genre_name SEPARATOR ', ') AS genre_name
    FROM series s
    JOIN series_genres sg ON s.series_id = sg.series_id
    JOIN genres g ON sg.genre_id = g.genre_id
    WHERE s.series_id != ?
    GROUP BY s.series_id
    ORDER BY RAND()
    LIMIT 6
  `;

  connection.query(seriesQuery, [seriesId], (err, seriesResult) => {
    if (err || seriesResult.length === 0) return res.status(404).send("Series not found");

    const series = seriesResult[0];

    connection.query(seasonsQuery, [seriesId], (err2, seasonsResult) => {
      if (err2) return res.status(500).send("Error fetching seasons");

      const seasons = seasonsResult.map(season => ({
        season_id: season.season_id,
        number: season.season_number,
        title: season.season_title,
        overview: season.season_overview,
        poster_url: season.season_poster,
        episodes: []
      }));

      connection.query(episodesQuery, [seriesId], (err3, episodesResult) => {
        if (err3) return res.status(500).send("Error fetching episodes");

        episodesResult.forEach(ep => {
          const season = seasons.find(s => s.season_id === ep.season_id);
          if (season) {
            season.episodes.push({
              episode_id: ep.episode_id,
              number: ep.episode_number,
              title: ep.episode_title,
              overview: ep.episode_overview,
              air_date: ep.air_date
            });
          }
        });

        connection.query(recommendedQuery, [seriesId], (err4, recommended) => {
          if (err4) return res.status(500).send("Error fetching recommendations");

          series.seasons = seasons;

          res.render("pages/series", {
            series,
            recommended,
            user: req.session.user || null
          });
        });
      });
    });
  });
});

// ---------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------
app.all('/', (req, res, next) => next(new ExpressError('Page Not Found', 404)));

app.use((err, req, res, next) => {
  const { statusCode = 500, message = 'Something went wrong' } = err;
  res.status(statusCode).send(message);
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------
app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
