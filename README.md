# 🏥 MC-DSS: Hospital Site Selection

Multi-Criteria Decision Support System for Hospital Site Selection using:

**Eligibility Filtering → AHP (per expert) → WAM (per expert) → Arithmetic Average → Final Ranking**

## 🎯 Final methodology

- Exactly **7 active criteria** are used by the AHP model.
- Each expert performs **21 unique pairwise comparisons** (7×6/2).
- AHP automatically generates reciprocal matrix values and computes criterion weights.
- Consistency is checked with **λmax, CI, RI = 1.32 and CR = CI/RI**.
- Only expert assessments with **CR ≤ 0.10** are accepted for WAM.
- Eligibility filtering is executed before WAM; excluded zones are not scored.
- WAM is computed independently for each expert using that expert's persisted AHP weights.
- Expert results are combined using a **simple arithmetic mean**. No expertise weights are used.
- Final ranking is ordered by descending final WAM score.
- Results can be exported to CSV.

## 🛠 Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- PostgreSQL (Supabase)
- Pandas / NumPy

### Frontend
- React 18
- TypeScript
- Vite
- TailwindCSS

## 📦 Installation

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

## 🚀 Usage

### Run Backend
```bash
cd backend
uvicorn app.main:app --reload
```

### Run Frontend
```bash
cd frontend
npm run dev
```

## 📄 License

MIT License
