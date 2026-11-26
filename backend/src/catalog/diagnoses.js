'use strict';
/** Common outpatient ICD-10 (WHO) codes. Qatar MOPH uses ICD-10-CM for claims: load the full national code set before go-live. */
module.exports = `
# Infectious
A09|Infectious gastroenteritis and colitis, unspecified
A01.0|Typhoid fever
A15.9|Respiratory tuberculosis, unspecified
A49.9|Bacterial infection, unspecified
A54.9|Gonococcal infection, unspecified
A56.0|Chlamydial infection of lower genitourinary tract
A60.0|Genital herpes
A63.0|Anogenital (venereal) warts
B00.9|Herpes simplex infection, unspecified
B01.9|Varicella (chickenpox) without complication
B02.9|Herpes zoster without complication
B05.9|Measles without complication
B07|Viral warts
B08.4|Hand, foot and mouth disease
B15.9|Hepatitis A without hepatic coma
B16.9|Acute hepatitis B without delta-agent
B18.1|Chronic viral hepatitis B
B18.2|Chronic viral hepatitis C
B19.9|Unspecified viral hepatitis
B20|HIV disease
B24|Unspecified HIV disease
B34.9|Viral infection, unspecified
B35.3|Tinea pedis
B35.4|Tinea corporis
B35.9|Dermatophytosis, unspecified
B36.0|Pityriasis versicolor
B37.0|Candidal stomatitis
B37.3|Candidiasis of vulva and vagina
B50.9|Plasmodium falciparum malaria, unspecified
B54|Unspecified malaria
B76.9|Hookworm disease, unspecified
B77.9|Ascariasis, unspecified
B80|Enterobiasis
B86|Scabies
B85.0|Pediculosis due to Pediculus humanus capitis
U07.1|COVID-19, virus identified
U07.2|COVID-19, virus not identified
# Neoplasm / blood
D17.9|Benign lipomatous neoplasm, unspecified
D22.9|Melanocytic naevi, unspecified
D25.9|Leiomyoma of uterus, unspecified
D50.0|Iron deficiency anaemia secondary to blood loss
D50.9|Iron deficiency anaemia, unspecified
D51.9|Vitamin B12 deficiency anaemia, unspecified
D56.1|Beta thalassaemia
D57.1|Sickle-cell disease without crisis
D64.9|Anaemia, unspecified
D69.6|Thrombocytopenia, unspecified
D72.8|Other specified disorders of white blood cells
# Endocrine / metabolic
E03.9|Hypothyroidism, unspecified
E04.9|Nontoxic goitre, unspecified
E05.9|Thyrotoxicosis, unspecified
E06.3|Autoimmune thyroiditis
E10.9|Type 1 diabetes mellitus without complications
E11.2|Type 2 diabetes mellitus with renal complications
E11.3|Type 2 diabetes mellitus with ophthalmic complications
E11.4|Type 2 diabetes mellitus with neurological complications
E11.65|Type 2 diabetes mellitus with hyperglycaemia
E11.9|Type 2 diabetes mellitus without complications
E13.9|Other specified diabetes mellitus without complications
E16.2|Hypoglycaemia, unspecified
E28.2|Polycystic ovarian syndrome
E29.1|Testicular hypofunction
E55.9|Vitamin D deficiency, unspecified
E53.8|Deficiency of other specified B group vitamins
E61.1|Iron deficiency
E66.9|Obesity, unspecified
E66.0|Obesity due to excess calories
E78.0|Pure hypercholesterolaemia
E78.2|Mixed hyperlipidaemia
E78.5|Hyperlipidaemia, unspecified
E79.0|Hyperuricaemia without signs of inflammatory arthritis
E83.5|Disorders of calcium metabolism
E86|Volume depletion (dehydration)
E87.1|Hypo-osmolality and hyponatraemia
E87.6|Hypokalaemia
# Mental / neuro
F10.2|Alcohol dependence syndrome
F17.2|Nicotine dependence
F32.9|Depressive episode, unspecified
F33.9|Recurrent depressive disorder, unspecified
F41.0|Panic disorder
F41.1|Generalised anxiety disorder
F41.9|Anxiety disorder, unspecified
F43.2|Adjustment disorders
F43.1|Post-traumatic stress disorder
F45.9|Somatoform disorder, unspecified
F51.0|Insomnia not due to a substance or known physiological condition
F90.9|Attention-deficit hyperactivity disorder, unspecified
F84.0|Childhood autism
G20|Parkinson disease
G35|Multiple sclerosis
G40.9|Epilepsy, unspecified
G43.0|Migraine without aura
G43.9|Migraine, unspecified
G44.2|Tension-type headache
G47.0|Insomnia
G47.3|Sleep apnoea
G50.0|Trigeminal neuralgia
G51.0|Bell palsy
G54.2|Cervical root disorders
G56.0|Carpal tunnel syndrome
G57.0|Sciatic nerve lesion
G62.9|Polyneuropathy, unspecified
G81.9|Hemiplegia, unspecified
# Eye / ear
H00.0|Hordeolum (stye)
H04.1|Dry eye syndrome
H10.1|Acute atopic conjunctivitis
H10.9|Conjunctivitis, unspecified
H11.0|Pterygium
H25.9|Senile cataract, unspecified
H26.9|Cataract, unspecified
H40.9|Glaucoma, unspecified
H52.1|Myopia
H52.0|Hypermetropia
H52.2|Astigmatism
H52.4|Presbyopia
H61.2|Impacted cerumen
H65.9|Nonsuppurative otitis media, unspecified
H66.9|Otitis media, unspecified
H60.9|Otitis externa, unspecified
H81.1|Benign paroxysmal vertigo
H81.9|Disorder of vestibular function, unspecified
H90.5|Sensorineural hearing loss, unspecified
H91.9|Hearing loss, unspecified
H92.0|Otalgia
H93.1|Tinnitus
# Circulatory
I10|Essential (primary) hypertension
I11.9|Hypertensive heart disease without heart failure
I12.9|Hypertensive chronic kidney disease
I20.0|Unstable angina
I20.9|Angina pectoris, unspecified
I21.9|Acute myocardial infarction, unspecified
I25.1|Atherosclerotic heart disease
I25.9|Chronic ischaemic heart disease, unspecified
I26.9|Pulmonary embolism without acute cor pulmonale
I34.0|Mitral valve insufficiency
I42.9|Cardiomyopathy, unspecified
I48.9|Atrial fibrillation and flutter, unspecified
I49.9|Cardiac arrhythmia, unspecified
I50.9|Heart failure, unspecified
I63.9|Cerebral infarction, unspecified
I67.9|Cerebrovascular disease, unspecified
I73.9|Peripheral vascular disease, unspecified
I80.2|Phlebitis and thrombophlebitis of deep vessels of lower extremities
I83.9|Varicose veins of lower extremities
I84.9|Haemorrhoids, unspecified
I95.9|Hypotension, unspecified
# Respiratory
J00|Acute nasopharyngitis (common cold)
J01.9|Acute sinusitis, unspecified
J02.9|Acute pharyngitis, unspecified
J03.9|Acute tonsillitis, unspecified
J04.0|Acute laryngitis
J06.9|Acute upper respiratory infection, unspecified
J09|Influenza due to identified zoonotic or pandemic influenza virus
J10.1|Influenza with other respiratory manifestations, virus identified
J11.1|Influenza with other respiratory manifestations, virus not identified
J12.9|Viral pneumonia, unspecified
J15.9|Bacterial pneumonia, unspecified
J18.9|Pneumonia, unspecified
J20.9|Acute bronchitis, unspecified
J21.9|Acute bronchiolitis, unspecified
J30.1|Allergic rhinitis due to pollen
J30.4|Allergic rhinitis, unspecified
J31.0|Chronic rhinitis
J32.9|Chronic sinusitis, unspecified
J34.2|Deviated nasal septum
J35.0|Chronic tonsillitis
J40|Bronchitis, not specified as acute or chronic
J42|Unspecified chronic bronchitis
J44.9|Chronic obstructive pulmonary disease, unspecified
J45.9|Asthma, unspecified
J45.0|Predominantly allergic asthma
J96.0|Acute respiratory failure
R05|Cough
# Digestive
K02.9|Dental caries, unspecified
K04.0|Pulpitis
K04.7|Periapical abscess without sinus
K05.0|Acute gingivitis
K05.1|Chronic gingivitis
K05.3|Chronic periodontitis
K08.1|Loss of teeth due to accident, extraction or local periodontal disease
K08.8|Other specified disorders of teeth and supporting structures
K01.1|Impacted teeth
K03.1|Abrasion of teeth
K12.0|Recurrent oral aphthae
K21.9|Gastro-oesophageal reflux disease without oesophagitis
K21.0|Gastro-oesophageal reflux disease with oesophagitis
K25.9|Gastric ulcer, unspecified
K26.9|Duodenal ulcer, unspecified
K29.0|Acute gastritis
K29.7|Gastritis, unspecified
K30|Functional dyspepsia
K35.8|Acute appendicitis, other and unspecified
K40.9|Unilateral inguinal hernia without obstruction
K42.9|Umbilical hernia without obstruction or gangrene
K44.9|Diaphragmatic hernia without obstruction or gangrene
K52.9|Noninfective gastroenteritis and colitis, unspecified
K57.3|Diverticular disease of large intestine
K58.9|Irritable bowel syndrome without diarrhoea
K59.0|Constipation
K60.2|Anal fissure, unspecified
K64.9|Haemorrhoids, unspecified
K70.3|Alcoholic cirrhosis of liver
K74.6|Other and unspecified cirrhosis of liver
K76.0|Fatty (change of) liver, not elsewhere classified
K80.2|Calculus of gallbladder without cholecystitis
K81.9|Cholecystitis, unspecified
K85.9|Acute pancreatitis, unspecified
K92.1|Melaena
K92.2|Gastrointestinal haemorrhage, unspecified
# Skin
L01.0|Impetigo
L02.9|Cutaneous abscess, furuncle and carbuncle, unspecified
L03.9|Cellulitis, unspecified
L05.9|Pilonidal cyst without abscess
L08.9|Local infection of skin and subcutaneous tissue, unspecified
L20.9|Atopic dermatitis, unspecified
L21.9|Seborrhoeic dermatitis, unspecified
L23.9|Allergic contact dermatitis, unspecified
L24.9|Irritant contact dermatitis, unspecified
L25.9|Unspecified contact dermatitis
L29.9|Pruritus, unspecified
L30.9|Dermatitis, unspecified
L40.0|Psoriasis vulgaris
L50.9|Urticaria, unspecified
L60.0|Ingrowing nail
L65.9|Nonscarring hair loss, unspecified
L70.0|Acne vulgaris
L72.1|Trichilemmal cyst
L73.2|Hidradenitis suppurativa
L80|Vitiligo
L81.4|Other melanin hyperpigmentation
L82|Seborrhoeic keratosis
L90.5|Scar conditions and fibrosis of skin
L98.9|Disorder of skin and subcutaneous tissue, unspecified
# Musculoskeletal
M06.9|Rheumatoid arthritis, unspecified
M10.9|Gout, unspecified
M15.9|Polyarthrosis, unspecified
M17.9|Gonarthrosis (knee osteoarthritis), unspecified
M19.9|Arthrosis, unspecified
M25.5|Pain in joint
M25.56|Pain in knee
M25.51|Pain in shoulder
M32.9|Systemic lupus erythematosus, unspecified
M43.6|Torticollis
M47.8|Other spondylosis
M48.0|Spinal stenosis
M50.9|Cervical disc disorder, unspecified
M51.2|Other intervertebral disc displacement (lumbar)
M51.9|Intervertebral disc disorder, unspecified
M53.1|Cervicobrachial syndrome
M54.2|Cervicalgia (neck pain)
M54.5|Low back pain
M54.4|Lumbago with sciatica
M54.3|Sciatica
M54.9|Dorsalgia, unspecified
M62.8|Other specified disorders of muscle
M65.9|Synovitis and tenosynovitis, unspecified
M67.4|Ganglion
M70.9|Soft tissue disorder related to use, overuse and pressure
M71.9|Bursopathy, unspecified
M72.2|Plantar fascial fibromatosis
M75.1|Rotator cuff syndrome
M75.5|Bursitis of shoulder
M76.6|Achilles tendinitis
M77.1|Lateral epicondylitis (tennis elbow)
M79.1|Myalgia
M79.7|Fibromyalgia
M79.6|Pain in limb
M81.9|Osteoporosis, unspecified
M85.8|Other specified disorders of bone density and structure
# Genitourinary
N10|Acute pyelonephritis
N13.2|Hydronephrosis with renal and ureteral calculous obstruction
N18.9|Chronic kidney disease, unspecified
N20.0|Calculus of kidney
N20.1|Calculus of ureter
N23|Renal colic, unspecified
N30.0|Acute cystitis
N30.9|Cystitis, unspecified
N34.1|Nonspecific urethritis
N39.0|Urinary tract infection, site not specified
N40|Benign prostatic hyperplasia
N41.0|Acute prostatitis
N45.9|Orchitis, epididymitis and epididymo-orchitis without abscess
N47|Phimosis
N48.1|Balanitis
N52.9|Male erectile dysfunction, unspecified
N60.1|Diffuse cystic mastopathy
N61|Inflammatory disorders of breast
N63|Unspecified lump in breast
N76.0|Acute vaginitis
N77.1|Vaginitis, vulvitis in diseases classified elsewhere
N80.9|Endometriosis, unspecified
N83.2|Other and unspecified ovarian cysts
N84.0|Polyp of corpus uteri
N91.2|Amenorrhoea, unspecified
N92.0|Excessive and frequent menstruation with regular cycle
N92.6|Irregular menstruation, unspecified
N94.6|Dysmenorrhoea, unspecified
N95.1|Menopausal and female climacteric states
N97.9|Female infertility, unspecified
# Pregnancy
O03.9|Spontaneous abortion, complete or unspecified, without complication
O20.0|Threatened abortion
O21.0|Mild hyperemesis gravidarum
O24.4|Diabetes mellitus arising in pregnancy (gestational diabetes)
O26.9|Pregnancy-related condition, unspecified
O80|Single spontaneous delivery
Z34.9|Supervision of normal pregnancy, unspecified
Z32.1|Pregnancy confirmed
# Symptoms
R00.0|Tachycardia, unspecified
R03.0|Elevated blood-pressure reading, without diagnosis of hypertension
R04.0|Epistaxis
R06.0|Dyspnoea
R07.4|Chest pain, unspecified
R07.0|Pain in throat
R10.1|Pain localised to upper abdomen
R10.4|Other and unspecified abdominal pain
R10.3|Pain localised to other parts of lower abdomen
R11|Nausea and vomiting
R12|Heartburn
R19.7|Diarrhoea, unspecified
R20.2|Paraesthesia of skin
R21|Rash and other nonspecific skin eruption
R22.9|Localised swelling, mass and lump, unspecified
R25.2|Cramp and spasm
R42|Dizziness and giddiness
R50.9|Fever, unspecified
R51|Headache
R52.9|Pain, unspecified
R53|Malaise and fatigue
R55|Syncope and collapse
R56.0|Febrile convulsions
R60.9|Oedema, unspecified
R63.0|Anorexia
R63.4|Abnormal weight loss
R73.0|Abnormal glucose tolerance test
R73.9|Hyperglycaemia, unspecified
R74.0|Elevation of transaminase and LDH levels
R79.8|Other specified abnormal findings of blood chemistry
R80|Isolated proteinuria
R82.9|Other and unspecified abnormal findings in urine
# Injury / poisoning / external
S00.9|Superficial injury of head, unspecified
S01.9|Open wound of head, unspecified
S09.9|Unspecified injury of head
S13.4|Sprain of ligaments of cervical spine
S20.2|Contusion of thorax
S39.0|Injury of muscle and tendon of abdomen, lower back and pelvis
S42.0|Fracture of clavicle
S52.5|Fracture of lower end of radius
S60.9|Superficial injury of wrist and hand, unspecified
S61.9|Open wound of wrist and hand, unspecified
S62.6|Fracture of other finger
S72.0|Fracture of neck of femur
S82.6|Fracture of lateral malleolus
S83.5|Sprain of cruciate ligament of knee
S90.9|Superficial injury of ankle and foot, unspecified
S93.4|Sprain of ankle
S91.3|Open wound of other parts of foot
T14.9|Injury, unspecified
T15.9|Foreign body on external eye, part unspecified
T16|Foreign body in ear
T17.9|Foreign body in respiratory tract, part unspecified
T20.1|Burn of first degree of head and neck
T23.1|Burn of first degree of wrist and hand
T30.0|Burn of unspecified body region, unspecified degree
T63.4|Toxic effect of venom of other arthropods (insect bite)
T78.4|Allergy, unspecified
T78.2|Anaphylactic shock, unspecified
T88.7|Unspecified adverse effect of drug or medicament
W19|Unspecified fall
# Congenital / perinatal / paediatric
P59.9|Neonatal jaundice, unspecified
Q21.1|Atrial septal defect
Q65.9|Congenital deformity of hip, unspecified
Q66.0|Talipes equinovarus
Q53.9|Undescended testicle, unspecified
R62.8|Other lack of expected normal physiological development
# Factors / encounters
Z00.0|General medical examination
Z00.1|Routine child health examination
Z01.0|Examination of eyes and vision
Z01.2|Dental examination
Z01.4|Gynaecological examination
Z02.7|Issue of medical certificate
Z02.0|Examination for admission to educational institution
Z02.1|Pre-employment examination
Z02.3|Examination for recruitment to armed forces
Z02.9|Administrative examination, unspecified
Z03.8|Observation for other suspected diseases and conditions
Z11.3|Screening for infections with a predominantly sexual mode of transmission
Z12.3|Screening for malignant neoplasm of breast
Z13.1|Screening for diabetes mellitus
Z23|Encounter for immunisation
Z24.6|Need for immunisation against viral hepatitis
Z30.0|General counselling on contraception
Z30.4|Surveillance of contraceptive drugs
Z30.9|Contraceptive management, unspecified
Z31.6|General counselling on procreation
Z41.2|Routine and ritual circumcision
Z46.9|Fitting and adjustment of unspecified device
Z48.0|Attention to surgical dressings and sutures
Z48.8|Other specified surgical follow-up care
Z51.8|Other specified medical care
Z71.3|Dietary counselling and surveillance
Z71.9|Counselling, unspecified
Z76.0|Issue of repeat prescription
Z86.7|Personal history of diseases of the circulatory system
Z95.0|Presence of cardiac pacemaker
Z98.8|Other specified postprocedural states
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));
