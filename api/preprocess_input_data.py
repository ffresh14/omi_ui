from typing import List
from api_models import InputModel
import numpy as np
import base64
import scipy.signal as sgn # type: ignore

LEAD_ORDER = ['I', 'II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

def preprocess_input_data(input: InputModel) -> np.ndarray:
    '''
    Preprocesses the input data for model prediction.
    - Extracting and decoding the right base64-encoded ECG waveform leads
    - remove baseline filter
    - resample to 500 Hz (if needed)
    - cut to 4096 samples
    '''

    ecg_data: List[np.ndarray] = []

    for lead in LEAD_ORDER:
        wf = next((wf for wf in input.waveforms if wf.leadId == lead), None)
        if wf is None:
            raise ValueError(f"Lead {lead} is missing from the input data.")
        lead_bytes = base64.b64decode(wf.samples)
        lead_array = np.frombuffer(lead_bytes, dtype = 'i2') * wf.LSB / 1000  # Convert to mV

        lead_array_baseline_filtered = remove_baseline(lead_array, wf.sampleRate)
        lead_array_resampled = resample_to_400Hz(lead_array_baseline_filtered, wf.sampleRate)
        lead_array_truncated = truncate_to_10_seconds(lead_array_resampled)
        lead_array_zero_padded = zero_pad_to_4096(lead_array_truncated)

        ecg_data.append(lead_array_zero_padded)

    ecg = np.stack(ecg_data, axis=0)
    
    return ecg

def get_baseline_filter(sample_rate: int):  # -> scipy filter  # type: ignore 
    """Returns a highpass filter for baseline removal."""
    fc = 0.8  # Hz
    fst = 0.2  # Hz
    rp = 0.5  # dB
    rs = 40   # dB
    wn = fc / (sample_rate / 2)
    wst = fst / (sample_rate / 2)
    filterorder, aux = sgn.ellipord(wn, wst, rp, rs)  # type: ignore 
    sos = sgn.iirfilter(filterorder, wn, rp, rs, btype='high', ftype='ellip', output='sos')  # type: ignore 
    return sos  # type: ignore 

def remove_baseline(ecg: np.ndarray, old_rate: int) -> np.ndarray:
    """Remove baseline."""
    sos = get_baseline_filter(old_rate) # type: ignore
    ecg_nobaseline = sgn.sosfiltfilt(sos, ecg, padtype='constant') # type: ignore
    return ecg_nobaseline # type: ignore

def resample_to_400Hz(ecg_nobaseline: np.ndarray, old_rate: int) -> np.ndarray:
    """Resample to 400 Hz."""
    ecg_resampled = sgn.resample_poly(ecg_nobaseline, up=400, down=old_rate) # type: ignore
    return ecg_resampled # type: ignore

def truncate_to_10_seconds(ecg_resampled: np.ndarray) -> np.ndarray:
    """truncate to 4000 samples."""
    return ecg_resampled[:4000]

def zero_pad_to_4096(ecg_truncated: np.ndarray) -> np.ndarray:
    """Zero pad symmetrically to 4096 samples."""
    n_missing = 4096 - len(ecg_truncated)
    if n_missing <= 0:
        return ecg_truncated
    n_pre = n_missing // 2
    n_post = n_missing - n_pre
    ecg_padded = np.pad(ecg_truncated, (n_pre, n_post), mode='constant')
    return ecg_padded