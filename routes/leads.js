const express = require("express");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const axios = require("axios");

// ===================== LOAD CSV =====================
const loadCSV = async (db) => {
  let rowsProcessed = 0;
  let rowsSkipped = 0;
  let rowsFailed = 0;

  try {
    const filePath = path.join(__dirname, "../ml/nasabah/X_test_rf.csv");
    if (!fs.existsSync(filePath)) {
      console.log("CSV tidak ditemukan:", filePath);
      return;
    }

    const csvFile = fs.readFileSync(filePath, "utf8");
    const parsed = Papa.parse(csvFile, { header: true, skipEmptyLines: true });

    for (const row of parsed.data) {
      if (!row.name) {
        rowsSkipped++;
        continue;
      }

      try {
        let leadScore = 0;
        try {
          const flaskResponse = await axios.post(`${process.env.ML_URL}/predict`, row);
          leadScore = Math.round((flaskResponse.data.probability ?? 0) * 100);
        } catch (err) {
          console.error("❌ Error prediksi model:", err.message);
        }

        const values = [
          row.name, row.phone_number, Number(row.age) || 0, row.job, row.marital, row.education,
          row.default || "no", row.housing || "no", row.loan || "no", row.contact, row.month,
          row.day_of_week || "", Number(row.duration) || 0, Number(row.campaign) || 0,
          Number(row.pdays) || 0, Number(row.previous) || 0, row.poutcome || "",
          Number(row["emp.var.rate"]) || 0, Number(row["cons.price.idx"]) || 0,
          Number(row["cons.conf.idx"]) || 0, Number(row.euribor3m) || 0, Number(row["nr.employed"]) || 0,
          leadScore, "no call", JSON.stringify([]), "", "not subscribed"
        ];

        const sql = `
          INSERT INTO leads (
            name, phone_number, age, job, marital, education, default_status,
            housing, loan, contact, month, day, duration, campaign, pdays, previous,
            poutcome, emp_var_rate, cons_price_idx, cons_conf_idx, euribor3m, nr_employed,
            lead_score, status_kampanye, aktivitas, alasan_status, subscription_status
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE 
            name=VALUES(name), age=VALUES(age), job=VALUES(job), lead_score=VALUES(lead_score)
        `;

        await new Promise((resolve, reject) => {
          db.query(sql, values, (err, result) => {
            if (err) return reject(err);
            rowsProcessed++;
            resolve(result);
          });
        });
      } catch {
        rowsFailed++;
      }
    }

    console.log(`✅ CSV selesai. Berhasil: ${rowsProcessed}, Dilewati: ${rowsSkipped}, Gagal: ${rowsFailed}`);
  } catch (err) {
    console.error("Gagal load CSV:", err);
  }
};

// ===================== ROUTER LEADS =====================
const createLeadsRouter = (db) => {
  const router = express.Router();

  // POST /leads → prediksi dan insert
  router.post("/", async (req, res) => {
    const data = req.body;
    let leadScore = 0;

    try {
      const flaskResponse = await axios.post(`${process.env.ML_URL}/predict`, data);
      leadScore = Math.round((flaskResponse.data.probability ?? 0) * 100);
    } catch (err) {
      console.error("❌ Error prediksi model:", err.message);
    }

    const sql = `
      INSERT INTO leads (
        name, phone_number, age, job, marital, education, default_status, housing, loan,
        contact, month, day, duration, campaign, pdays, previous, poutcome,
        emp_var_rate, cons_price_idx, cons_conf_idx, euribor3m, nr_employed,
        lead_score, status_kampanye, aktivitas, alasan_status, subscription_status,
        gender
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), age=VALUES(age), job=VALUES(job), lead_score=VALUES(lead_score)
    `;

    const values = [
      data.name, data.phone_number, Number(data.age) || 0, data.job, data.marital, data.education,
      data.default_status || "no", data.housing || "no", data.loan || "no", data.contact,
      data.month, data.day, Number(data.duration) || 0, Number(data.campaign) || 0,
      Number(data.pdays) || 0, Number(data.previous) || 0, data.poutcome || "unknown",
      Number(data.emp_var_rate) || 0, Number(data.cons_price_idx) || 0, Number(data.cons_conf_idx) || 0,
      Number(data.euribor3m) || 0, Number(data.nr_employed) || 0, leadScore,
      data.status_kampanye || "no call", JSON.stringify(data.aktivitas || []),
      data.alasan_status || "", data.subscription_status || "not subscribed", data.gender || ""
    ];

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.status(201).json({ success: true, id: result.insertId, lead_score: leadScore });
    });
  });

  // GET /leads → semua nasabah
  router.get("/", (req, res) => {
    db.query("SELECT * FROM leads ORDER BY lead_score DESC", (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  // GET /leads/:id → detail nasabah
  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

    db.query("SELECT * FROM leads WHERE id = ?", [id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!results.length) return res.status(404).json({ message: "Lead not found" });
      res.json(results[0]);
    });
  });

  // PATCH /leads/:id → update status & aktivitas
  router.patch("/:id", async (req, res) => {
    const leadId = req.params.id;
    const newData = req.body;

    try {
      const [oldData] = await new Promise((resolve, reject) => {
        db.query("SELECT * FROM leads WHERE id = ?", [leadId], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!oldData) return res.status(404).json({ success: false, message: "Nasabah tidak ditemukan." });

      let oldAktivitas = [];
      try { oldAktivitas = JSON.parse(oldData.aktivitas || "[]"); } catch { oldAktivitas = []; }

      if (newData.status_kampanye) {
        const now = new Date();
        const nextCampaign = Number(newData.campaign) || (oldAktivitas.length + 1);
        const durationSec = Number(newData.duration) || Number(oldData.duration) || 480;

        const newActivity = {
          id: Date.now(),
          month: now.toLocaleString('id-ID', { month: 'long' }),
          day: now.getDate(),
          duration: durationSec,
          campaign: nextCampaign,
          poutcome: newData.status_kampanye.toLowerCase() === 'interest' ? 'success' : 'failure',
          alasan: newData.alasan_status || '',
          subscription_status: newData.subscription_status || oldData.subscription_status || 'not subscribed',
          timestamp: now.toISOString()
        };

        oldAktivitas.push(newActivity);
      }

      const fields = [];
      const values = [];

      if (newData.status_kampanye) {
        fields.push("status_kampanye=?");
        values.push(newData.status_kampanye);
      }
      if (newData.alasan_status) {
        fields.push("alasan_status=?");
        values.push(newData.alasan_status);
      }
      if (newData.subscription_status) {
        fields.push("subscription_status=?");
        values.push(newData.subscription_status);
      }
      if (oldAktivitas) {
        fields.push("aktivitas=?");
        values.push(JSON.stringify(oldAktivitas));
      }

      values.push(leadId);

      const sql = `UPDATE leads SET ${fields.join(", ")} WHERE id=?`;

      db.query(sql, values, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: "Data nasabah berhasil diperbarui." });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
  }
});
  return router;
};

module.exports = { loadCSV, createLeadsRouter };
