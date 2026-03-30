# import base64
from typing import List, Literal, Optional, Union
import numpy as np
from pydantic import BaseModel, Field, ConfigDict, model_validator
import torch
import os

import json
from pathlib import Path
from ai.ai_model.model import EnsembleECGModel
# read waveform samples from json file
# Get the directory of the current file
base_dir = os.path.dirname(os.path.abspath(__file__))
waveform_path = os.path.join(base_dir, 'waveform_examples.json')

with open(waveform_path, 'r') as f:
    waveform_dict = json.load(f)
L_I = waveform_dict['I']
L_II = waveform_dict['II']
L_V1 = waveform_dict['V1']
L_V2 = waveform_dict['V2']
L_V3 = waveform_dict['V3']
L_V4 = waveform_dict['V4']
L_V5 = waveform_dict['V5']
L_V6 = waveform_dict['V6']

Sex = Literal["M", "F"]
Language = Literal['EN', 'SE']
LeadId = Literal[
    'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
    'V1', 'V2', 'V3', 'V4', 'V5', 'V6'
]

class Waveform(BaseModel):
    leadId: str = Field(description="Lead identifier", default="I")
    LSB: float = Field(description="(uV)", default=5.0)
    sampleRate: int = Field(description="(Hz)", default=50)
    samples: str 


wf_I = Waveform(leadId="I", LSB=4.88, sampleRate=500, samples=L_I)
wf_II = Waveform(leadId="II", LSB=4.88, sampleRate=500, samples=L_II)
wf_V1 = Waveform(leadId="V1", LSB=4.88, sampleRate=500, samples=L_V1)
wf_V2 = Waveform(leadId="V2", LSB=4.88, sampleRate=500, samples=L_V2)
wf_V3 = Waveform(leadId="V3", LSB=4.88, sampleRate=500, samples=L_V3)
wf_V4 = Waveform(leadId="V4", LSB=4.88, sampleRate=500, samples=L_V4)
wf_V5 = Waveform(leadId="V5", LSB=4.88, sampleRate=500, samples=L_V5)
wf_V6 = Waveform(leadId="V6", LSB=4.88, sampleRate=500, samples=L_V6)

class InputModel(BaseModel):
    examId: str = Field(description="Unique exam identifier")
    sex: Sex = Field(description="Patient sex")
    age: Optional[int] = Field(description="Patient age")
    medication: str = Field(description="Currently not in use")
    symptom: str = Field(description="Currently not in use")
    language: Language = Field(description="Language for the report")
    waveforms: List[Waveform]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "examId": "12345",
                    "sex": "F",
                    "age": 62,
                    "medication": "None",
                    "symptom": "Headache",
                    "language": "EN",
                    "waveforms": [wf_I.model_dump(), wf_II.model_dump(), 
                                  wf_V1.model_dump(), wf_V2.model_dump(), wf_V3.model_dump(),
                                  wf_V4.model_dump(), wf_V5.model_dump(), wf_V6.model_dump()
                                 ]

                }
            ]
        }
    }


class PredictionConfig(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    age: float
    sex: Sex
    ecg_data: np.ndarray


class OutcomeProbs(BaseModel):
    control_nomyoperi: float
    control_myoperi: float
    mi_nstemi_nonomi: float
    mi_stemi_nonomi: float
    mi_nstemi_omi_lmca_lad: float
    mi_nstemi_omi_lcx: float
    mi_nstemi_omi_rca: float
    mi_stemi_omi_lmca_lad: float
    mi_stemi_omi_lcx: float
    mi_stemi_omi_rca: float
    lbbb: float

class ResponseModel(BaseModel):
    status: str
    analysisResult: Union[str, OutcomeProbs]


class ModelConfig(BaseModel):
    seed: int
    outcomes_cat: List[str]
    outcomes_bin: List[str]
    epochs: int
    batch_size: int
    lr: float
    patience: int
    min_lr: float
    lr_factor: float
    weight_decay: float
    seq_length: int
    n_residual_block: Optional[int]
    net_filter_size: List[int]
    net_seq_length: List[int]
    dropout_rate: float
    kernel_size: int
    activation_function: str
    optim_algo: str
    w_bin_cat_ratio: float
    n_ensembles: int
    n_leads: int
    agesex_dim: int
    age_mean: float
    age_sd: float
    device: str
    col_outcome: List[str]
    n_outcomes: int
    n_leads: int = 8
    seq_length: int = 4096



class AIModel:
    model: Optional[torch.nn.Module] = None
    model_dir: Optional[str] = None
    model_config: Optional[ModelConfig] = None

    def __init__(self, model_dir: Optional[str] = None):
        if model_dir is None:
            self.model_dir = Path(__file__).parent / 'ai' / 'ai_model' # type: ignore
        else:
            self.model_dir = Path(model_dir) # type: ignore

    def get_version(self) -> str:
        return "0.0.1"
    
    def load_model(self):
        # Read model_config.json from model_dir
        model_config_path = self.model_dir / 'model_config.json' # type: ignore
        if not model_config_path.exists(): # type: ignore
            raise FileNotFoundError(f"Model configuration file not found at {model_config_path}")
        with open(model_config_path, 'r') as f: # type: ignore
            config_dict = json.load(f)
            config = ModelConfig(**config_dict)
            config.device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
            self.model_config = config

        # Load the model
        model = EnsembleECGModel(config, self.model_dir)
        model.load_ensembles(config) # type: ignore
        model.eval()
        self.model = model

    def predict(self, prediction_confs: List[PredictionConfig]) -> OutcomeProbs:

        if len(prediction_confs) == 0:
            raise ValueError("No prediction configurations provided.")
        conf = prediction_confs[0]  # Currently only supports single prediction
        sex = 1 if conf.sex == 'M' else 0 # TODO Handle elsewhere? Handle missing?
        if len(prediction_confs) > 1:
            print("Warning: Multiple prediction configurations provided. Only the first one will be used.")
        input_ecg = torch.tensor(conf.ecg_data, dtype=torch.float32).unsqueeze(0)
        input_age_sex = torch.tensor((sex, conf.age), dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            if self.model is None:
                raise ValueError("Model is not loaded. Please load the model before prediction.")
            output = self.model((input_age_sex, input_ecg))

            cat_logits = output[:, :10]
            bin_logits = output[:, 10:]

            # Multi-class (categorical) probabilities
            cat_probs = torch.softmax(cat_logits, dim=1)
            # Multi-label (binary) probabilities
            bin_probs = torch.sigmoid(bin_logits)

            if self.model_config is None:
                raise ValueError("Model configuration is not loaded.")
            categorical_outcomes = self.model_config.outcomes_cat
            binary_outcomes = self.model_config.outcomes_bin

            # Build outcome dictionary
            outcome_dict = {name: cat_probs[0, i].item() for i, name in enumerate(categorical_outcomes)}
            outcome_dict.update({name: bin_probs[0, j].item() for j, name in enumerate(binary_outcomes)})
        return OutcomeProbs(**outcome_dict)




if __name__ == "__main__":
    ai_model = AIModel()
    ai_model.load_model()
    print("Model loaded successfully.")