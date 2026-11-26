'use strict';
/** Default tests, imaging and procedures with indicative cash prices in QAR. Review before go-live. */

/* Lab: code | name | sample | unit | ref low | ref high | critical low | critical high | TAT hours | price (QAR). "-" = none */
const LAB = `
# Haematology
CBC|Complete blood count (CBC)|Blood|-|-|-|-|-|2|45
HB|Haemoglobin|Blood|g/dL|12|17|7|20|2|20
WBC|White cell count|Blood|x10^9/L|4|11|2|30|2|20
PLT|Platelet count|Blood|x10^9/L|150|400|20|1000|2|20
HCT|Haematocrit|Blood|%|36|50|20|60|2|20
ESR|ESR|Blood|mm/hr|0|20|-|-|2|20
RETIC|Reticulocyte count|Blood|%|0.5|2.5|-|-|4|30
BGRH|Blood group and Rh|Blood|-|-|-|-|-|2|25
PT-INR|PT / INR|Plasma|INR|0.8|1.2|-|5|2|45
APTT|APTT|Plasma|sec|25|35|-|100|2|45
DDIMER|D-Dimer|Plasma|mg/L FEU|0|0.5|-|-|2|90
FERR|Ferritin|Serum|ng/mL|20|300|-|-|6|60
IRON|Serum iron|Serum|ug/dL|60|170|-|-|6|35
TIBC|TIBC|Serum|ug/dL|250|450|-|-|6|35
B12|Vitamin B12|Serum|pg/mL|200|900|-|-|6|80
FOLATE|Folate|Serum|ng/mL|3|17|-|-|6|70
HBELEC|Haemoglobin electrophoresis|Blood|-|-|-|-|-|24|120
MALARIA|Malaria parasite (film)|Blood|-|-|-|-|-|2|40
# Diabetes
GLU-F|Glucose (fasting)|Serum|mg/dL|70|100|40|450|1|15
GLU-R|Glucose (random)|Serum|mg/dL|70|140|40|450|1|15
GLU-PP|Glucose (2 hr post prandial)|Serum|mg/dL|70|140|40|450|1|15
HBA1C|HbA1c|Blood|%|4|5.6|-|12|4|70
OGTT|Oral glucose tolerance test (75 g)|Serum|-|-|-|-|-|4|60
INSF|Insulin (fasting)|Serum|uIU/mL|2|25|-|-|6|80
UMALB|Urine microalbumin|Urine|mg/L|0|30|-|-|4|50
# Renal / electrolytes
UREA|Urea|Serum|mg/dL|15|45|-|200|2|20
BUN|Blood urea nitrogen|Serum|mg/dL|7|20|-|100|2|20
CREA|Creatinine|Serum|mg/dL|0.6|1.3|-|5|2|25
EGFR|eGFR|Serum|mL/min|90|130|-|-|2|25
URIC|Uric acid|Serum|mg/dL|3.5|7.2|-|-|2|25
NA|Sodium|Serum|mmol/L|135|145|120|160|1|20
K|Potassium|Serum|mmol/L|3.5|5.1|2.5|6.5|1|20
CL|Chloride|Serum|mmol/L|98|107|-|-|1|20
CA|Calcium|Serum|mg/dL|8.5|10.5|6.5|13|2|20
MG|Magnesium|Serum|mg/dL|1.7|2.4|1|4|2|25
PHOS|Phosphorus|Serum|mg/dL|2.5|4.5|-|-|2|25
BICARB|Bicarbonate|Serum|mmol/L|22|29|-|-|2|20
# Liver / pancreas
ALT|ALT (SGPT)|Serum|U/L|0|41|-|-|2|20
AST|AST (SGOT)|Serum|U/L|0|40|-|-|2|20
ALP|Alkaline phosphatase|Serum|U/L|40|130|-|-|2|20
GGT|GGT|Serum|U/L|8|61|-|-|2|25
BILT|Bilirubin total|Serum|mg/dL|0.1|1.2|-|15|2|20
BILD|Bilirubin direct|Serum|mg/dL|0|0.3|-|-|2|20
TP|Total protein|Serum|g/dL|6.4|8.3|-|-|2|20
ALB|Albumin|Serum|g/dL|3.5|5.2|-|-|2|20
AMY|Amylase|Serum|U/L|28|100|-|-|2|35
LIP|Lipase|Serum|U/L|13|60|-|-|2|40
LDH|LDH|Serum|U/L|135|225|-|-|2|30
CK|CK (total)|Serum|U/L|20|200|-|-|2|35
CKMB|CK-MB|Serum|U/L|0|25|-|-|2|45
TROP|Troponin I (high sensitivity)|Serum|ng/L|0|14|-|-|1|90
BNP|NT-proBNP|Serum|pg/mL|0|125|-|-|2|150
# Lipids
CHOL|Cholesterol total|Serum|mg/dL|0|200|-|-|4|20
TG|Triglycerides|Serum|mg/dL|0|150|-|1000|4|20
HDL|HDL cholesterol|Serum|mg/dL|40|90|-|-|4|25
LDL|LDL cholesterol|Serum|mg/dL|0|130|-|-|4|35
# Thyroid / hormones
TSH|TSH|Serum|mIU/L|0.4|4|0.01|50|6|60
FT4|Free T4|Serum|ng/dL|0.8|1.8|-|-|6|60
FT3|Free T3|Serum|pg/mL|2.3|4.2|-|-|6|60
PTH|Parathyroid hormone (PTH)|Serum|pg/mL|15|65|-|-|6|120
VITD|Vitamin D (25-OH)|Serum|ng/mL|30|100|-|-|6|120
CORT|Cortisol (morning)|Serum|ug/dL|6|23|-|-|6|80
PRL|Prolactin|Serum|ng/mL|3|25|-|-|6|70
FSH|FSH|Serum|mIU/mL|1.5|12.4|-|-|6|70
LH|LH|Serum|mIU/mL|1.7|8.6|-|-|6|70
E2|Oestradiol|Serum|pg/mL|-|-|-|-|6|80
PROG|Progesterone|Serum|ng/mL|-|-|-|-|6|80
TESTO|Testosterone total|Serum|ng/dL|240|830|-|-|6|90
BHCG|Beta hCG (quantitative)|Serum|mIU/mL|0|5|-|-|4|70
PREG-U|Pregnancy test (urine)|Urine|-|-|-|-|-|1|20
# Infection / immunology
CRP|CRP|Serum|mg/L|0|5|-|-|2|40
HSCRP|hs-CRP|Serum|mg/L|0|3|-|-|4|60
PCT|Procalcitonin|Serum|ng/mL|0|0.5|-|-|2|150
ASOT|ASO titre|Serum|IU/mL|0|200|-|-|4|40
RF|Rheumatoid factor|Serum|IU/mL|0|14|-|-|4|40
ANA|ANA|Serum|-|-|-|-|-|24|90
ANTICCP|Anti-CCP|Serum|U/mL|0|17|-|-|24|120
HBSAG|Hepatitis B surface antigen|Serum|-|-|-|-|-|4|40
HBSAB|Hepatitis B surface antibody|Serum|mIU/mL|-|-|-|-|4|45
ANTIHCV|Hepatitis C antibody|Serum|-|-|-|-|-|4|50
HAVIGM|Hepatitis A IgM|Serum|-|-|-|-|-|6|60
HIV|HIV 1 and 2 (Ag/Ab)|Serum|-|-|-|-|-|4|50
VDRL|Syphilis (VDRL/TPHA)|Serum|-|-|-|-|-|4|40
WIDAL|Widal test|Serum|-|-|-|-|-|4|40
BRUC|Brucella antibodies|Serum|-|-|-|-|-|6|50
DENGUE|Dengue NS1 / IgM|Serum|-|-|-|-|-|4|90
TOXO|Toxoplasma IgG/IgM|Serum|-|-|-|-|-|6|90
RUBELLA|Rubella IgG|Serum|-|-|-|-|-|6|60
CMV|CMV IgG/IgM|Serum|-|-|-|-|-|6|90
HPYAG|H. pylori stool antigen|Stool|-|-|-|-|-|4|70
HPYAB|H. pylori antibody|Serum|-|-|-|-|-|4|60
COVID|COVID-19 antigen (rapid)|Swab|-|-|-|-|-|1|60
COVIDPCR|COVID-19 PCR|Swab|-|-|-|-|-|12|150
FLU|Influenza A/B (rapid)|Swab|-|-|-|-|-|1|80
STREPA|Rapid strep A (throat)|Swab|-|-|-|-|-|1|50
TB-IGRA|TB QuantiFERON|Blood|-|-|-|-|-|48|220
# Tumour markers
PSA|PSA total|Serum|ng/mL|0|4|-|-|6|80
CEA|CEA|Serum|ng/mL|0|5|-|-|6|90
AFP|AFP|Serum|ng/mL|0|10|-|-|6|90
CA125|CA 125|Serum|U/mL|0|35|-|-|6|110
CA153|CA 15-3|Serum|U/mL|0|30|-|-|6|110
CA199|CA 19-9|Serum|U/mL|0|37|-|-|6|110
# Urine / stool / micro
URINE|Urine routine and microscopy|Urine|-|-|-|-|-|1|25
UCS|Urine culture and sensitivity|Urine|-|-|-|-|-|48|70
STOOLR|Stool routine and microscopy|Stool|-|-|-|-|-|2|25
STOOLOB|Stool occult blood|Stool|-|-|-|-|-|2|30
STOOLCS|Stool culture and sensitivity|Stool|-|-|-|-|-|48|80
THROATCS|Throat swab culture|Swab|-|-|-|-|-|48|70
WOUNDCS|Wound swab culture|Swab|-|-|-|-|-|48|70
BLOODCS|Blood culture|Blood|-|-|-|-|-|72|120
VAGCS|High vaginal swab culture|Swab|-|-|-|-|-|48|70
SEMEN|Semen analysis|Other|-|-|-|-|-|4|90
# Profiles (billing packages of the above)
PROF-LFT|Liver function profile|Serum|-|-|-|-|-|4|70
PROF-RFT|Renal function profile|Serum|-|-|-|-|-|4|60
PROF-LIPID|Lipid profile|Serum|-|-|-|-|-|4|75
PROF-THY|Thyroid profile (TSH, FT3, FT4)|Serum|-|-|-|-|-|6|150
PROF-ELEC|Electrolytes (Na, K, Cl)|Serum|-|-|-|-|-|2|50
PROF-CARD|Cardiac profile (CK, CKMB, Troponin)|Serum|-|-|-|-|-|2|140
PROF-ANTE|Antenatal profile|Blood|-|-|-|-|-|24|280
PROF-PREM|Premarital screening profile|Blood|-|-|-|-|-|24|250
PROF-HEALTH|General health check profile|Blood|-|-|-|-|-|24|350
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));

/* Radiology: code | name | modality code (XR, US, CT, MRI, MG, DX) | price | needs pre-authorisation (1/0) */
const RAD = `
# X-ray
RAD-CXR|Chest X-ray (PA)|XR|90|0
RAD-CXR-2|Chest X-ray (PA and lateral)|XR|120|0
RAD-ABD-X|Abdomen X-ray|XR|90|0
RAD-SKULL|Skull X-ray|XR|100|0
RAD-SINUS|Sinuses X-ray|XR|100|0
RAD-C-SPINE|Cervical spine X-ray|XR|110|0
RAD-T-SPINE|Thoracic spine X-ray|XR|110|0
RAD-L-SPINE|Lumbosacral spine X-ray|XR|110|0
RAD-PELVIS|Pelvis X-ray|XR|100|0
RAD-HIP|Hip X-ray|XR|100|0
RAD-SHLD|Shoulder X-ray|XR|90|0
RAD-ELBOW|Elbow X-ray|XR|90|0
RAD-WRIST|Wrist X-ray|XR|90|0
RAD-HAND|Hand X-ray|XR|90|0
RAD-KNEE|Knee X-ray|XR|90|0
RAD-KNEE-W|Knee X-ray (weight bearing, both)|XR|130|0
RAD-ANKLE|Ankle X-ray|XR|90|0
RAD-FOOT|Foot X-ray|XR|90|0
RAD-FEMUR|Femur / leg X-ray|XR|100|0
RAD-CLAV|Clavicle X-ray|XR|90|0
RAD-RIBS|Ribs X-ray|XR|100|0
RAD-BONEAGE|Bone age (hand) X-ray|XR|100|0
RAD-DENT-OPG|Dental panoramic (OPG)|XR|120|0
RAD-DENT-CEPH|Cephalometric X-ray|XR|120|0
# Ultrasound
RAD-USG-ABD|Ultrasound abdomen|US|200|0
RAD-USG-PELV|Ultrasound pelvis|US|200|0
RAD-USG-KUB|Ultrasound kidneys, ureters and bladder|US|200|0
RAD-USG-THY|Ultrasound thyroid / neck|US|200|0
RAD-USG-BRE|Ultrasound breast|US|220|0
RAD-USG-SCR|Ultrasound scrotum|US|200|0
RAD-USG-PROS|Ultrasound prostate (trans-abdominal)|US|200|0
RAD-USG-OB1|Obstetric ultrasound (first trimester)|US|200|0
RAD-USG-OB2|Obstetric ultrasound (anomaly / growth)|US|250|0
RAD-USG-TVS|Transvaginal ultrasound|US|220|0
RAD-USG-DOP|Doppler (arterial or venous, limb)|US|350|0
RAD-USG-SOFT|Ultrasound soft tissue / lump|US|180|0
RAD-USG-MSK|Ultrasound musculoskeletal (joint)|US|220|0
RAD-ECHO|Echocardiogram|US|450|0
# CT / MRI / others
RAD-CT-BRAIN|CT brain (plain)|CT|700|1
RAD-CT-SINUS|CT sinuses|CT|650|1
RAD-CT-CHEST|CT chest|CT|900|1
RAD-CT-ABD|CT abdomen and pelvis (contrast)|CT|1300|1
RAD-CT-KUB|CT KUB (stone protocol)|CT|700|1
RAD-CT-SPINE|CT spine (per region)|CT|900|1
RAD-CT-ANGIO|CT angiography|CT|1600|1
RAD-MRI-BRAIN|MRI brain|MRI|1500|1
RAD-MRI-LSPINE|MRI lumbar spine|MRI|1400|1
RAD-MRI-CSPINE|MRI cervical spine|MRI|1400|1
RAD-MRI-KNEE|MRI knee|MRI|1300|1
RAD-MRI-SHLD|MRI shoulder|MRI|1300|1
RAD-MRI-ABD|MRI abdomen / pelvis|MRI|1700|1
RAD-MG|Mammogram (bilateral)|MG|350|0
RAD-DEXA|Bone densitometry (DEXA)|DX|350|0
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));

/* Consultations / procedures / dental / other. code | name | category | department code | price | covered(1/0) | preauth(1/0) */
const OTHER = `
CONS-GP|Consultation - General Practitioner|Consultation|GM|100|1|0
CONS-PED|Consultation - Paediatrics|Consultation|PED|120|1|0
CONS-FU|Follow-up consultation|Consultation|GM|50|1|0
CONS-DENT|Consultation - Dentist|Consultation|DEN|120|1|0
CONS-OBG|Consultation - Obstetrics & Gynaecology|Consultation|OBG|150|1|0
CONS-SPEC|Consultation - Specialist|Consultation|GM|200|1|0
CONS-DERM|Consultation - Dermatology|Consultation|GM|200|1|0
CONS-ENT|Consultation - ENT|Consultation|GM|200|1|0
CONS-ORTHO|Consultation - Orthopaedics|Consultation|GM|200|1|0
CONS-CARD|Consultation - Cardiology|Consultation|GM|250|1|0
CONS-EYE|Consultation - Ophthalmology|Consultation|GM|200|1|0
CONS-PSY|Consultation - Psychiatry|Consultation|GM|250|1|0
CONS-HOME|Home visit consultation|Consultation|GM|300|0|0
CONS-TELE|Tele-consultation|Consultation|GM|80|1|0
PROC-DRESS|Wound dressing (small)|Procedure|GM|60|1|0
PROC-DRESS-L|Wound dressing (large / complex)|Procedure|GM|120|1|0
PROC-SUTURE|Suturing (simple laceration)|Procedure|GM|200|1|0
PROC-SUTURE-C|Suturing (complex laceration)|Procedure|GM|400|1|0
PROC-SUT-REM|Suture removal|Procedure|GM|50|1|0
PROC-INJ|Injection administration (IM / SC)|Procedure|GM|20|1|0
PROC-IV|IV cannulation and drip set up|Procedure|GM|60|1|0
PROC-IVF|IV fluids administration|Procedure|GM|100|1|0
PROC-IV-INJ|IV injection / infusion of medication|Procedure|GM|60|1|0
PROC-NEB|Nebulisation|Procedure|GM|50|1|0
PROC-ECG|ECG (12 lead)|Procedure|GM|80|1|0
PROC-GLU|Blood glucose (point of care)|Procedure|GM|15|1|0
PROC-BP|Blood pressure check|Procedure|GM|10|0|0
PROC-OXY|Oxygen therapy (per hour)|Procedure|GM|40|1|0
PROC-I-D|Incision and drainage (abscess)|Procedure|GM|350|1|0
PROC-ING-TOE|Ingrown toenail removal|Procedure|GM|400|1|0
PROC-CAST|Plaster cast / splint application|Procedure|GM|250|1|0
PROC-FB-EAR|Foreign body removal (ear / nose)|Procedure|GM|200|1|0
PROC-EAR-W|Ear wax removal / syringing|Procedure|GM|100|1|0
PROC-CAUT|Cautery / wart removal (per session)|Procedure|GM|250|1|0
PROC-CIRC|Circumcision|Procedure|GM|800|0|0
PROC-CATH|Urinary catheterisation|Procedure|GM|150|1|0
PROC-ENEMA|Enema administration|Procedure|GM|80|1|0
PROC-PAP|Pap smear|Procedure|OBG|200|1|0
PROC-IUCD|IUCD insertion|Procedure|OBG|350|0|0
PROC-IMPLANT|Contraceptive implant insertion|Procedure|OBG|400|0|0
PROC-SPIRO|Spirometry|Procedure|GM|120|1|0
PROC-VISION|Vision and eye screening|Procedure|GM|60|1|0
PROC-AUDIO|Audiometry|Procedure|GM|150|1|0
PROC-BIOPSY|Skin biopsy (minor)|Procedure|GM|400|1|0
PROC-VACC-ADM|Vaccine administration fee|Procedure|GM|20|0|0
VACC-TT|Tetanus toxoid vaccine|Procedure|GM|40|0|0
VACC-FLU|Influenza vaccine|Procedure|GM|80|0|0
VACC-HEPB|Hepatitis B vaccine|Procedure|GM|70|0|0
VACC-MMR|MMR vaccine|Procedure|PED|90|0|0
VACC-HPV|HPV vaccine (per dose)|Procedure|OBG|300|0|0
VACC-PNEUMO|Pneumococcal vaccine|Procedure|GM|250|0|0
VACC-TYPHOID|Typhoid vaccine|Procedure|GM|90|0|0
DENT-XRAY|Dental X-ray (periapical)|Dental|DEN|40|1|0
DENT-SCALE|Scaling and polishing|Dental|DEN|200|1|0
DENT-FILL|Tooth filling (composite)|Dental|DEN|250|1|0
DENT-FILL-GIC|Tooth filling (glass ionomer)|Dental|DEN|150|1|0
DENT-RCT|Root canal treatment (single canal)|Dental|DEN|900|1|1
DENT-RCT-M|Root canal treatment (molar)|Dental|DEN|1300|1|1
DENT-EXT|Tooth extraction (simple)|Dental|DEN|200|1|0
DENT-SURG-EXT|Surgical extraction|Dental|DEN|600|1|0
DENT-WISDOM|Wisdom tooth extraction (impacted)|Dental|DEN|900|1|0
DENT-CROWN|Crown (porcelain fused to metal)|Dental|DEN|1200|0|0
DENT-CROWN-Z|Crown (zirconia)|Dental|DEN|1800|0|0
DENT-VENEER|Veneer (per tooth)|Dental|DEN|1500|0|0
DENT-BRIDGE|Bridge (per unit)|Dental|DEN|1200|0|0
DENT-DENTURE|Complete denture (per arch)|Dental|DEN|2000|0|0
DENT-PART-DEN|Partial denture|Dental|DEN|1200|0|0
DENT-IMPLANT|Dental implant (fixture only)|Dental|DEN|4500|0|0
DENT-WHITEN|Teeth whitening|Dental|DEN|800|0|0
DENT-PULP|Pulpotomy (child)|Dental|DEN|300|1|0
DENT-FLUOR|Fluoride application (child)|Dental|DEN|100|1|0
DENT-SEAL|Fissure sealant (per tooth)|Dental|DEN|100|1|0
DENT-SPACE|Space maintainer|Dental|DEN|400|0|0
DENT-ORTHO|Braces consultation and records|Dental|DEN|400|0|0
DENT-NIGHT|Night guard|Dental|DEN|600|0|0
PHARM|Pharmacy - dispensed medicines|Pharmacy|PHM|0|1|0
OTHER-CERT|Medical certificate|Other|GM|50|0|0
OTHER-SICK|Sick leave certificate|Other|GM|50|0|0
OTHER-FIT|Fitness certificate|Other|GM|100|0|0
OTHER-REPORT|Medical report|Other|GM|150|0|0
OTHER-COPY|Medical records copy|Other|FO|30|0|0
OTHER-PREMAR|Premarital health check (consultation)|Other|GM|100|0|0
OTHER-PKG-ADULT|Adult health check package (consultation + CBC, glucose, lipids, LFT, RFT, urine, ECG)|Package|GM|550|0|0
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));

module.exports = { LAB, RAD, OTHER };
