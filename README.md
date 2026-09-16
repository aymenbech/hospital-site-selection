# 🏥 MC-DSS: Hospital Site Selection

Multi-Criteria Decision Support System for Hospital Site Selection using AHP-SAW-WAM

## 🎯 Features

- ✅ Multi-expert support with different expertise weights
- ✅ AHP pairwise comparisons with consistency check (CR)
- ✅ WAM aggregation using Weighted Arithmetic Mean
- ✅ SAW ranking with normalized scores
- ✅ CSV upload and data processing
- ✅ Export results to CSV

## 🛠 Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- PostgreSQL (Supabase)
- Pandas

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