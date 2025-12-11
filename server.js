const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const { loadCSV, createLeadsRouter } = require('./routes/leads');
const { spawn } = require('child_process');   // <--- tambahkan ini

const app = express();
const port = 5000;

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'bankcp'
});

db.connect(err => {
  if (err) {
    console.error('❌ Gagal koneksi ke MySQL:', err);
    process.exit(1);
  }
  console.log('✅ Koneksi ke MySQL berhasil');

  loadCSV(db)
    .then(() => console.log('✅ CSV loader selesai dijalankan'))
    .catch(err => console.error('❌ Error load CSV:', err));
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const sql = 'SELECT id, username, password, role FROM users WHERE username = ?';
  db.query(sql, [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Server error" });
    const user = results[0];
    if (user && user.password === password) return res.json({ success: true, user });
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  });
});

app.use('/leads', createLeadsRouter(db));

/**
 * Route prediksi ML
 * Memanggil script Python predict_leads.py
 */
app.post('/predict', (req, res) => {
  const py = spawn('python', ['./ml_models/predict_leads.py']);
  let dataString = '';

  py.stdout.on('data', data => {
    dataString += data.toString();
  });

  py.stderr.on('data', data => {
    console.error('Python error:', data.toString());
  });

  py.on('close', () => {
    try {
      const result = JSON.parse(dataString);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Gagal parse hasil prediksi' });
    }
  });

  // kirim body request ke stdin python
  py.stdin.write(JSON.stringify(req.body));
  py.stdin.end();
});

const reportsRouter = require('./routes/reports')(db); const createReportsRouter = require("./routes/reports");
app.use("/reports", createReportsRouter(db));

app.use((req, res) => {
  console.log(`⚠️ [DEBUG] Route tidak ditemukan: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Route not found" });
});

app.listen(port, () => {
  console.log(`🚀 Backend berjalan di http://localhost:${port}`);
});
