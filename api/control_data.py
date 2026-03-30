import numpy as np
from api_models import InputModel
import base64

def control_data(input: InputModel):
    '''
    Validates the input data for required fields and correct formats.
    Returns nothing, but raises ValueError if validation fails.
    Things to check:
    - Correct number of leads (at least 8 leads)
    - The right lead IDs are present
    - Base64 strings are decodable
    - Length of each lead is sufficient (e.g., at least 8.192 seconds)
    - Age is a non-negative integer (if provided) and within a reasonable range (0-130?)
    - Sex is 'M', 'F', or '-' (already checked by Pydantic)
    '''
    # Correct leads
    required_leads = {'I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'}
    lead_ids = {wf.leadId for wf in input.waveforms}
    if not required_leads.issubset(lead_ids):
        missing = required_leads - lead_ids
        raise ValueError(f"Missing required leads: {', '.join(missing)}")
    
    # Age check
    if input.age is not None:
        if not (0 <= input.age <= 130):
            raise ValueError("Age must be between 0 and 130.")
    
    # Validate each ECG waveform
    for wf in input.waveforms:
        try:
            lead_bytes = base64.b64decode(wf.samples)
            lead_array = np.frombuffer(lead_bytes, dtype = np.int8)
        except Exception:
            raise ValueError(f"Lead {wf.leadId} has invalid base64-encoded samples.")
        if wf.sampleRate <= 0:
            raise ValueError(f"Lead {wf.leadId} has non-positive sample rate.")
        if len(lead_array)/wf.sampleRate < 10:
            raise ValueError(f"Lead {wf.leadId} has insufficient samples; must at least be 10 seconds.")
    
    print("Input data validation passed.")
        