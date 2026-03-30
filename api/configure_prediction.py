from typing import List
import numpy as np
from api_models import InputModel
from api_models import PredictionConfig

age_mean = 60.0  # Example mean age for normalization
age_sd = 16.0    # Example standard deviation for normalization


def configure_prediction(input: InputModel, ecg_data: np.ndarray) -> List[PredictionConfig]:
    '''
    Configures prediction parameters based on input data.
    Things to do now:

    '''
    if input.age is None:
        raise ValueError("Age is required for prediction configuration.")
    if input.sex not in ['M', 'F']:
        raise ValueError("Sex is required for prediction configuration and must be 'M' or 'F'.")
    config = PredictionConfig(
        age=(input.age-age_mean)/age_sd,  # Normalize age
        sex=input.sex,  # type: ignore TODO: Ensure this matches the expected type in PredictionConfig
        ecg_data=ecg_data
    )
    return [config]