# Prediction model for occlusion myocardial infarction (OMI)
Implementation of the paper "A deep learning ECG model for localization of occlusion myocardial infarction" (Journal Year)

## Overview

The paper describes a ResNet-CNN prediction model using age, sex, and 10 second 12-lead ECG data as input to predict occlusion myocardial infarction and the localization of the occlusion. The predicted outcomes of the model are summarized in this figure:
  
![Predicted outcomes of the OMI model](img/outcome_classes.png)
  
This repository provides the implementation of the paper including the code used to:

- Prepare the SwED and PTB-XL input data
- Train and validate the model
- Prepare tables and figures

## Data

The input data, with the exception of [PTB-XL](https://doi.org/10.13026/zx4k-te85), is not publicly available.

### Swedish Emergency Department database (SwED)

Primary data source used for training, validation and test. The ED core dataset includes around eight million ED visits between 2003-2017, from multiple ED hospitals in Sweden. It is linked to several national and regional databases using the [Swedish personal identifier number](https://pmc.ncbi.nlm.nih.gov/articles/PMC2773709/) of the patients. This study is restricted to a subset of ED hospitals with available ECG data from the Karolinska ECG database.

| Data Source | Usage |
|:---|:---|
| SwED ED core | ED visit information with timestamp of arrival, presented complaint, priority and more |
| Karolinska ECG database | GE MUSE v9 database with __12-lead hospital ECGs__ from primarily Karolinska Hospital but also additional hospitals in the surrounding geographical area |
| SWEDEHEART Riks-HIA | National quality registry data on cardiac intensive care patients, including __STEMI/NSTEMI labels__ |
| SWEDEHEART SCAAR | National quality registry data on coronary angiography, including __occlusion type and localization__ |
| Patient registry | National registry on all specialized outpatient care and inpatient care visits including diagnoses (ICD-10) and procedures (KVÅ). Used for __diagnoses (MI, cardiomyopathy, LBBB) and PCI dates__ |
| Cause of death registry | National registry on __cause of death__ (ICD-10) |
| Prescribed drug registry | National registry on all dispensed prescription drugs (ATC) used for descriptive statistics of __prevalent medication__ |

*The following external evaluation sets were used for the model trained in SwED.*  
  

### InCor

The InCor dataset comes 
from a single-center cohort and includes 401 ten-second 12-lead ECGs acquired from patients 
presenting to the emergency department of the Heart Institute of the University 
of São Paulo (InCor), Brazil between 2017 and 2024.
Each exam is labeled for the presence of occlusion myocardial infarction by manual 
review of emergency clinical notes and coronary angiography reports by a 
trained cardiologist. We evaluated the classes OMI (with/without STE) and controls free from MI.  
  
### CODE-II

The [CODE-II](https://doi.org/10.48550/arXiv.2511.15632) dataset is an 
updated version of the first [CODE](https://doi.org/10.1038/s41467-020-15432-4) 
dataset with no overlap of records. 
CODE-II is a multi-center cohort and includes 2,093,807 ten-second 12-lead patients from
the Telehealth Network of Minas Gerais, Brazil between 2019 and 2022 
(one ECG per patient used).
Among the 66 diagnostic classes, we evaluated STEMI, LBBB, and controls free from STE.  
  
### PTB-XL

The [PTB-XL](https://doi.org/10.13026/zx4k-te85) dataset is a publicly 
available database of 21,837 ten-second 12-lead ECGs annotated with 71 different 
ECG statements.
From PTB-XL, we includes ECGs that had been evaluated by at least one cardiologist 
in the public data and with no electrode problems reported. From this subset, 
we extracted and evaluated the classes STEMI, LBBB, and controls free from STE
(a small random subset that underwent an additional manual review for the presence of STE).
  
## Code

Execute the provided code in the order of the numerical prefixes in the script filenames to replicate the results. The code in this repository is licensed under [xxx]().

## Model

The trained model is not included in this repository but can be shared upon reasonable request.

## Computational resources

The model was trained and tested on the Bianca cluster (Uppsala, Sweden) using a GPU node (256GB RAM, AMD EPYC 16-core (Rome) CPU, 2x NVIDIA A100-40GB GPUs with CUDA 12.4), for each separate run of the training. Large ECG datasets were copied to node-local storage (HDD with ext4) for faster data loading during training. All other input and output was stored on a networked filesystem (lustre). All code was executed using Singularity [containers](./containers). R 4.4.2 or Python 3.10.12 was used for all processing. 

In this environment:  
Training (415k records) and validation (49k records) took 51 hours.  
Test with 50k records took <1 minute.  

## Usage

### Training

#### Input:  
[02.01-define-study-pop.R](02.01-define-study-pop.R) describes the preparation of the tabular data with age, sex, split sets, and outcomes. [02.02-build-omi-hdf5.sh](02.02-build-omi-hdf5.sh) describes the preparation of the HDF5 data with ECGs.

#### Run with:  
```bash
singularity run --nv ./container/24.02-torch-py3.sif python \
    ./main.py \
        --txt ./data/outcomes_agesex_and_splits.tab \
        --hdf5 ./data/normalized_ecgs.hdf5 \
        --age_mean 61.9 \
        --age_sd 19.5 \
        --agesex_dim 64 \
        --traces_dset 'ecg_normalized' \
        --examid_dset 'id_record' \
        --split_col 'column_with_data_splits' \
        --batch_size 1024 \
        --dropout_rate 0.5 \
        --weight_decay 0.001 \
        --lr 0.0005 \
        --patience 10 \
        --min_lr 1e-9 \
        --epochs 150 \
        --n_ensembles 5 \
        --seed 1234567 \
        --outcomes_json ./data/outcomes.json \
        --w_bin_cat_ratio 0.3 \
        --out_dir ./output;
```

#### Output:  
A timestamped subfolder contains all output, including settings in JSON-format and model files (model_[nr].pth for each ensemble member)

### Evaluation

#### Input:  
Same input format as for training, but with the addition of the path where the trained model (model_[nr].pth) and model settings (JSON) are stored.

#### Run with:  
```bash
singularity run --nv ./container/24.02-torch-py3.sif python \
    ./main.py \
        --txt ./data/outcomes_and_splits.tab \
        --hdf5 ./data/normalized_ecgs.hdf5 \
        --model_path ./output/run_xxxxxxxx_xxxxxx \
        --outcomes_json ./data/outcomes.json \
        --test \
        --test_name 'testset_x' \
        --split_col 'column_with_data_splits' \
        --out_dir ./output/run_xxxxxxxx_xxxxxx;
```

#### Output:
The selected `--out_dir` contains observed outcomes (observed_data_[testset_x].csv) and predicted probabilities of outcomes (predicted_data_[testset_x].csv).

## Citation

Authors:
[Stefan Gustafsson](https://orcid.org/0000-0001-5894-0351), 
[Antônio H. Ribeiro](https://orcid.org/0000-0003-3632-8529),
[Daniel Gedon](https://orcid.org/0000-0003-4397-9952),
[Petrus E. O. G. B. Abreu](https://orcid.org/0000-0001-8182-0091),
[Gabriela M. M. Paixão](https://orcid.org/0000-0003-1349-1745),
[Marco Antonio Gutierrez](https://orcid.org/0000-0003-0964-6222),
[José Eduardo Krieger](https://orcid.org/0000-0001-5464-1792),
[Felipe Meneguitti Dias](https://orcid.org/0000-0001-7778-4606),
[Antonio Luiz P. Ribeiro](https://orcid.org/0000-0002-2740-0042),
[Daniel Lindholm](https://orcid.org/0000-0003-3526-0614),
[Thomas B. Schön](https://orcid.org/0000-0001-5183-234X),
[Johan Sundström](https://orcid.org/0000-0003-2247-8454)  
Published in XXX  
Link to paper  

```bibtex
@article{gustafsson202x,  
  title={A deep learning ECG model for localization of occlusion myocardial infarction},  
  author={xxx},  
  journal={xxx},  
  year={202x}  
}
```

  
An earlier version of this manuscript is available as a preprint on [medRxiv](https://doi.org/10.1101/2025.09.11.25335407).




