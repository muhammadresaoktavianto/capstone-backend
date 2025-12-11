// OLD LEADS buat jaga" aja wkwk

const loadCSV = async (db) => {
    try {
        const filePath = path.join(__dirname, "../ml/nasabah/X_test_rf.csv");
        console.log("Mencoba load CSV dari:", filePath);

        if (!fs.existsSync(filePath)) {
            console.log("CSV tidak ditemukan:", filePath);
            return;
        }

        const csvFile = fs.readFileSync(filePath, "utf8");
        const parsed = Papa.parse(csvFile, { header: true, skipEmptyLines: true });
        console.log(`Ditemukan ${parsed.data.length} baris di CSV.`);

        for (const row of parsed.data) {
            if (!row.id || !row.name) continue; 

            const values = [
                Number(row.id),
                row.name,
                row.phone_number,
                Number(row.age) || 0,
                row.job,
                row.marital,
                row.education,
                row.default || "no",
                row.housing || "no",
                row.loan || "no",
                row.contact,
                row.month,
                row.day || "",
                Number(row.duration) || 0,
                Number(row.campaign) || 0,
                Number(row.pdays) || 0,
                Number(row.previous) || 0,
                row.poutcome || "",
                Number(row["emp.var.rate"]) || 0,
                Number(row["cons.price.idx"]) || 0,
                Number(row["cons.conf.idx"]) || 0,
                Number(row.euribor3m) || 0,
                Number(row["nr.employed"]) || 0,
                Number(row.lead_score) || 0,
                "no call",                   
                JSON.stringify([]),          
                "",                          
                "not subscribed"             
            ];

            const sql = `
                INSERT INTO leads (
                    id, name, phone_number, age, job, marital, education, default_status,
                    housing, loan, contact, month, day, duration, campaign, pdays, previous,
                    poutcome, emp_var_rate, cons_price_idx, cons_conf_idx, euribor3m, nr_employed,
                    lead_score, status_kampanye, aktivitas, alasan_status, subscription_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    name=VALUES(name), age=VALUES(age), job=VALUES(job), lead_score=VALUES(lead_score)
            `;

            await new Promise((resolve, reject) => {
                db.query(sql, values, (err, result) => {
                    if (err) {
                        console.error("❌ Error insert CSV:", err);
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
        }

        console.log("✅ CSV selesai dimasukkan ke database");

        const pythonScript = path.join(__dirname, "ml_models/predict_leads.py");
        if (fs.existsSync(pythonScript)) {
            console.log("Menjalankan script Python untuk prediksi...");
            spawnSync("python", [pythonScript], { stdio: "inherit" });
        }

    } catch (err) {
        console.error("Gagal load CSV:", err);
    }
};