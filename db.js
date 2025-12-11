const mysql = require("mysql");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "bankcp"
});

db.connect(err => {
  if (err) {
    console.error("❌ Gagal koneksi ke MySQL:", err);
  } else {
    console.log("✅ Koneksi ke MySQL berhasil");
  }
});

module.exports = db;