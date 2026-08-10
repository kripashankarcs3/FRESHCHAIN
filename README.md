# Fresh vs Rotten Classification API

A Flask + PyTorch backend API for classifying fruit/produce images as `fresh` or `rotten`.

## Setup

1. Install Python 3.11.
2. Create and activate a virtual environment:

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
```

3. Install dependencies:

```powershell
pip install -r requirements.txt
```

## Run

```powershell
python app.py
```

Server runs on `http://127.0.0.1:5000` by default.

## API

### POST /predict

- Content type: `multipart/form-data`
- Field:
  - `file`: image file

Example response:

```json
{
  "prediction": "fresh"
}
```

### GET /health

Returns service health status.

Example response:

```json
{
  "status": "ok"
}
```
