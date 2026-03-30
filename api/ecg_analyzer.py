from api_models import InputModel
from api_models import ResponseModel, AIModel
from configure_prediction import configure_prediction
from preprocess_input_data import preprocess_input_data
from control_data import control_data
from api_models import PredictionConfig

import sys
import os
import io
import xml.etree.ElementTree as ET

# Add parent directory to sys.path to import ecg_processing locally
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

import ecg_processing
def predict_with_ai_model(input: InputModel, model: AIModel) -> ResponseModel:
    
    if input.age is not None and input.age < 18:
        return ResponseModel(status="no_analysis", analysisResult="Patient age must be 18 or older.")
    
    try:
        control_data(input)
    except ValueError as e:
        return ResponseModel(status="error", analysisResult=str(e))
    
    try:
        preprocessed_data = preprocess_input_data(input)
        prediction_config = configure_prediction(input, preprocessed_data)

        output = model.predict(prediction_config)

        response = ResponseModel(status="success", analysisResult=output)

    except Exception as e:
        response = ResponseModel(
            status="error",
            analysisResult=str(e)
        )

    return response

def predict_from_xml(xml_content: bytes, model: AIModel) -> ResponseModel:
    try:
        # 1. Parse XML to get Age and Sex which are REQUIRED for PredictionConfig
        file_obj = io.BytesIO(xml_content)
        tree = ET.parse(file_obj)
        root = tree.getroot()
        
        # GeMuse typical paths:
        patient_demo = root.find("PatientDemographics")
        age = 50.0
        sex = "M"
        if patient_demo is not None:
            age_element = patient_demo.find("PatientAge")
            if age_element is not None and age_element.text:
                age = float(age_element.text)
            
            gender_element = patient_demo.find("Gender")
            if gender_element is not None and gender_element.text == "Female":
                sex = "F"
        
        # 2. Extract waveforms using ecg_processing.py
        # Need to re-create the BytesIO object because read_gemuse will call ET.parse again on the file stream
        file_obj.seek(0)
        ecg_data, sample_rate = ecg_processing.read_gemuse(file_obj)
        
        # 3. Normalize to 4096 length at 400Hz using ecg_processing.py
        # As dictated by config: 400Hz up/down resample
        normalized_ecg = ecg_processing.normalize(ecg_data, old_rate=sample_rate, new_rate=400, padded_length=4096)
        
        # 4. Predict natively via AIModel
        prediction_config = PredictionConfig(age=age, sex=sex, ecg_data=normalized_ecg)
        output = model.predict([prediction_config])
        
        return ResponseModel(status="success", analysisResult=output)
        
    except Exception as e:
        return ResponseModel(status="error", analysisResult=str(e))

if __name__ == "__main__":
    from api_models import wf_I, wf_II, wf_V1, wf_V2, wf_V3, wf_V4, wf_V5, wf_V6
    # Example usage

    ai_model = AIModel()
    ai_model.load_model()

    
    example_input = InputModel(
        examId="12345",
        sex="F",
        age=62,
        medication="",
        symptom="",
        language="EN",
        waveforms=[wf_I, wf_II, wf_V1, wf_V2, wf_V3, wf_V4, wf_V5, wf_V6])
    result = predict_with_ai_model(example_input, ai_model)
    print(result)
