from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from api_models import ResponseModel
from api_models import InputModel
from api_models import AIModel
from ecg_analyzer import predict_with_ai_model, predict_from_xml

API_Description = "Inofficial API version of https://github.com/stefan-gustafsson-work/omi/tree/main"

# Create FastAPI instance
app = FastAPI(title="AnalyzeECGService", description=API_Description)

# Add CORS to allow local frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path

# Load model at startup (Explicitly point to your model folder)
model_path = str((Path(__file__).parent.parent / "model").resolve())
model = AIModel(model_dir=model_path)
model.load_model()

# Analyze POST endpoint
@app.post("/AnalyzeECG", response_model=ResponseModel)
def analyze(input: InputModel) -> ResponseModel:
    response = predict_with_ai_model(input, model)
    return response

# Direct XML File POST endpoint
@app.post("/AnalyzeXMLFile", response_model=ResponseModel)
async def analyze_xml(file: UploadFile = File(...)) -> ResponseModel:
    content = await file.read()
    response = predict_from_xml(content, model)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)