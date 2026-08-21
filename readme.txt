backend launch:

cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

frontend launch:
cd eduapp-web/frontend
npm run dev