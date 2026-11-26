'use strict';
/**
 * Default drug master for a Qatar pharmacy. Generic | Brand (common in Qatar) | Form | Strength | Price QAR per unit | Rx(1=prescription only) | Schedule (blank=Normal, C=Controlled, N=Narcotic)
 * Prices are indicative retail defaults: review against your supplier price list / MOPH price list before go-live.
 */
module.exports = `
# Pain, fever, inflammation
Paracetamol|Panadol|Tablet|500 mg|0.4|0
Paracetamol|Panadol Extra|Tablet|500 mg + 65 mg caffeine|0.6|0
Paracetamol|Adol|Syrup|120 mg/5 ml 100 ml|9|0
Paracetamol|Panadol Baby|Syrup|120 mg/5 ml 100 ml|11|0
Paracetamol|Cetal|Other|125 mg suppository|1.5|0
Paracetamol|Perfalgan|Injection|1 g/100 ml|14|1
Ibuprofen|Brufen|Tablet|400 mg|0.8|0
Ibuprofen|Brufen|Syrup|100 mg/5 ml 100 ml|14|0
Ibuprofen|Nurofen|Tablet|200 mg|0.7|0
Diclofenac|Voltaren|Tablet|50 mg|1.2|1
Diclofenac|Voltaren SR|Tablet|100 mg|2.2|1
Diclofenac|Voltaren|Injection|75 mg/3 ml|3.5|1
Diclofenac|Voltaren Emulgel|Cream|1% 50 g|24|0
Diclofenac|Cataflam|Other|12.5 mg suppository|1.8|1
Naproxen|Naprosyn|Tablet|500 mg|2|1
Etoricoxib|Arcoxia|Tablet|90 mg|4.5|1
Celecoxib|Celebrex|Capsule|200 mg|4|1
Mefenamic acid|Ponstan|Capsule|250 mg|1|1
Ketorolac|Toradol|Injection|30 mg/ml|4|1
Piroxicam|Feldene|Capsule|20 mg|1.8|1
Aspirin|Aspirin Protect|Tablet|100 mg|0.4|0
Aspirin|Disprin|Tablet|300 mg|0.3|0
Tramadol|Tramal|Capsule|50 mg|2.5|1|C
Tramadol|Tramal|Injection|100 mg/2 ml|5|1|C
Codeine + Paracetamol|Solpadeine|Tablet|8 mg + 500 mg|1.5|1|N
Morphine|Morphine|Injection|10 mg/ml|6|1|N
Pethidine|Pethidine|Injection|50 mg/ml|6|1|N
Fentanyl|Durogesic|Other|25 mcg/h patch|35|1|N
Pregabalin|Lyrica|Capsule|75 mg|4|1|C
Pregabalin|Lyrica|Capsule|150 mg|6|1|C
Gabapentin|Neurontin|Capsule|300 mg|3|1
Methocarbamol|Robaxin|Tablet|500 mg|1.5|1
Orphenadrine + Paracetamol|Norgesic|Tablet|35 mg + 450 mg|1.2|1
Thiocolchicoside|Muscoril|Capsule|4 mg|3|1
Eperisone|Myonal|Tablet|50 mg|2|1
Capsaicin|Zostrix|Cream|0.025% 45 g|28|0
Methyl salicylate|Deep Heat|Cream|35 g|16|0
# Antibiotics
Amoxicillin|Amoxil|Capsule|500 mg|1.2|1
Amoxicillin|Amoxil|Syrup|250 mg/5 ml 100 ml|13|1
Amoxicillin + Clavulanic acid|Augmentin|Tablet|625 mg|5|1
Amoxicillin + Clavulanic acid|Augmentin|Tablet|1 g|7.5|1
Amoxicillin + Clavulanic acid|Augmentin|Syrup|228 mg/5 ml 70 ml|26|1
Amoxicillin + Clavulanic acid|Augmentin|Injection|1.2 g|14|1
Ampicillin|Ampicillin|Capsule|500 mg|1|1
Cloxacillin|Cloxacillin|Capsule|500 mg|1.2|1
Penicillin V|Penicillin V|Tablet|250 mg|0.8|1
Benzathine penicillin|Retarpen|Injection|1.2 MU|22|1
Cefalexin|Keflex|Capsule|500 mg|1.5|1
Cefuroxime|Zinnat|Tablet|500 mg|6|1
Cefuroxime|Zinnat|Syrup|125 mg/5 ml 50 ml|28|1
Cefixime|Suprax|Capsule|400 mg|9|1
Cefixime|Suprax|Syrup|100 mg/5 ml 50 ml|30|1
Cefpodoxime|Orelox|Tablet|200 mg|8|1
Cefdinir|Omnicef|Capsule|300 mg|8|1
Cefaclor|Ceclor|Capsule|500 mg|4|1
Ceftriaxone|Rocephin|Injection|1 g|12|1
Ceftriaxone|Rocephin|Injection|500 mg|8|1
Cefazolin|Cefazolin|Injection|1 g|9|1
Azithromycin|Zithromax|Tablet|500 mg|7|1
Azithromycin|Zithromax|Syrup|200 mg/5 ml 15 ml|26|1
Clarithromycin|Klacid|Tablet|500 mg|6|1
Erythromycin|Erythrocin|Tablet|500 mg|2|1
Doxycycline|Vibramycin|Capsule|100 mg|1.2|1
Ciprofloxacin|Ciprobay|Tablet|500 mg|3|1
Levofloxacin|Tavanic|Tablet|500 mg|6|1
Moxifloxacin|Avelox|Tablet|400 mg|10|1
Ofloxacin|Tarivid|Tablet|200 mg|3|1
Metronidazole|Flagyl|Tablet|500 mg|0.8|1
Metronidazole|Flagyl|Syrup|200 mg/5 ml 120 ml|12|1
Tinidazole|Fasigyn|Tablet|500 mg|2|1
Co-trimoxazole|Septrin|Tablet|480 mg|0.7|1
Co-trimoxazole|Septrin|Syrup|240 mg/5 ml 100 ml|11|1
Nitrofurantoin|Macrobid|Capsule|100 mg|2.5|1
Fosfomycin|Monurol|Other|3 g sachet|24|1
Clindamycin|Dalacin C|Capsule|300 mg|4|1
Clindamycin|Dalacin T|Other|1% topical solution 30 ml|28|1
Gentamicin|Garamycin|Injection|80 mg/2 ml|2|1
Amikacin|Amikin|Injection|500 mg/2 ml|8|1
Vancomycin|Vancocin|Injection|500 mg|18|1
Linezolid|Zyvox|Tablet|600 mg|35|1
Fusidic acid|Fucidin|Cream|2% 15 g|22|1
Mupirocin|Bactroban|Cream|2% 15 g|26|1
Silver sulfadiazine|Flamazine|Cream|1% 50 g|24|1
Chloramphenicol|Chloromycetin|Drops|0.5% eye drops 10 ml|8|1
Tobramycin|Tobrex|Drops|0.3% eye drops 5 ml|16|1
Ciprofloxacin|Ciloxan|Drops|0.3% eye drops 5 ml|17|1
Rifampicin|Rifadin|Capsule|300 mg|2.5|1
Isoniazid|Isoniazid|Tablet|300 mg|0.5|1
# Antifungal / antiviral / antiparasitic
Fluconazole|Diflucan|Capsule|150 mg|10|1
Fluconazole|Diflucan|Capsule|50 mg|4|1
Itraconazole|Sporanox|Capsule|100 mg|6|1
Terbinafine|Lamisil|Tablet|250 mg|8|1
Terbinafine|Lamisil|Cream|1% 15 g|22|0
Clotrimazole|Canesten|Cream|1% 20 g|14|0
Clotrimazole|Canesten|Other|500 mg vaginal pessary|12|0
Miconazole|Daktarin|Cream|2% 30 g|16|0
Ketoconazole|Nizoral|Other|2% shampoo 100 ml|34|0
Nystatin|Mycostatin|Drops|100,000 IU/ml oral 30 ml|14|1
Acyclovir|Zovirax|Tablet|400 mg|2.5|1
Acyclovir|Zovirax|Cream|5% 10 g|20|0
Valacyclovir|Valtrex|Tablet|500 mg|9|1
Oseltamivir|Tamiflu|Capsule|75 mg|12|1
Albendazole|Zentel|Tablet|400 mg|6|1
Mebendazole|Vermox|Tablet|100 mg|3|1
Ivermectin|Stromectol|Tablet|3 mg|5|1
Permethrin|Lyclear|Cream|5% 30 g|26|0
Hydroxychloroquine|Plaquenil|Tablet|200 mg|3|1
# Gastro
Omeprazole|Losec|Capsule|20 mg|1.2|1
Esomeprazole|Nexium|Tablet|40 mg|3.5|1
Pantoprazole|Controloc|Tablet|40 mg|2.8|1
Pantoprazole|Controloc|Injection|40 mg|12|1
Lansoprazole|Lanzor|Capsule|30 mg|3|1
Famotidine|Pepcid|Tablet|40 mg|1.5|1
Ranitidine|Zantac|Tablet|150 mg|1|1
Sodium alginate + Antacid|Gaviscon|Syrup|150 ml|22|0
Aluminium + Magnesium hydroxide|Maalox|Syrup|170 ml|14|0
Domperidone|Motilium|Tablet|10 mg|1|1
Metoclopramide|Primperan|Tablet|10 mg|0.5|1
Metoclopramide|Primperan|Injection|10 mg/2 ml|1.5|1
Ondansetron|Zofran|Tablet|4 mg|3|1
Ondansetron|Zofran|Injection|4 mg/2 ml|5|1
Hyoscine butylbromide|Buscopan|Tablet|10 mg|1.2|0
Hyoscine butylbromide|Buscopan|Injection|20 mg/ml|3|1
Mebeverine|Duspatalin|Tablet|135 mg|1.5|1
Loperamide|Imodium|Capsule|2 mg|1.2|0
Oral rehydration salts|ORS|Other|sachet|1.5|0
Racecadotril|Hidrasec|Other|100 mg capsule|4|1
Lactulose|Duphalac|Syrup|3.35 g/5 ml 200 ml|18|0
Bisacodyl|Dulcolax|Tablet|5 mg|0.6|0
Bisacodyl|Dulcolax|Other|10 mg suppository|1.5|0
Glycerin|Glycerin|Other|suppository|1|0
Sodium phosphate|Fleet|Other|enema 133 ml|12|0
Simethicone|Infacol|Drops|40 mg/ml 50 ml|16|0
Ursodeoxycholic acid|Ursofalk|Capsule|250 mg|4|1
Mesalazine|Pentasa|Tablet|500 mg|4|1
Probiotic|Enterogermina|Other|vial 5 ml|4|0
Zinc sulfate|Zinc|Syrup|20 mg/5 ml 100 ml|12|0
# Respiratory / allergy / ENT
Salbutamol|Ventolin|Inhaler|100 mcg 200 doses|17|1
Salbutamol|Ventolin|Syrup|2 mg/5 ml 100 ml|9|1
Salbutamol|Ventolin|Other|nebules 2.5 mg|2|1
Ipratropium|Atrovent|Other|nebules 500 mcg|3|1
Budesonide|Pulmicort|Other|nebules 0.5 mg|4|1
Budesonide + Formoterol|Symbicort|Inhaler|160/4.5 mcg|115|1
Fluticasone + Salmeterol|Seretide|Inhaler|250/25 mcg|125|1
Beclometasone|Clenil|Inhaler|200 mcg|55|1
Montelukast|Singulair|Tablet|10 mg|6|1
Montelukast|Singulair|Tablet|4 mg chewable|5|1
Theophylline|Theodur|Tablet|200 mg|1.5|1
Cetirizine|Zyrtec|Tablet|10 mg|1|0
Cetirizine|Zyrtec|Syrup|5 mg/5 ml 75 ml|16|0
Loratadine|Clarityn|Tablet|10 mg|1.2|0
Desloratadine|Aerius|Tablet|5 mg|3|1
Fexofenadine|Telfast|Tablet|120 mg|3.5|1
Levocetirizine|Xyzal|Tablet|5 mg|3|1
Chlorpheniramine|Piriton|Tablet|4 mg|0.3|0
Hydroxyzine|Atarax|Tablet|25 mg|1.5|1
Diphenhydramine|Benadryl|Syrup|100 ml|15|0
Pseudoephedrine + Triprolidine|Actifed|Syrup|100 ml|13|0
Bromhexine|Bisolvon|Syrup|4 mg/5 ml 100 ml|10|0
Ambroxol|Mucosolvan|Syrup|15 mg/5 ml 100 ml|12|0
Acetylcysteine|ACC|Other|200 mg sachet|2|0
Carbocisteine|Mucodyne|Syrup|250 mg/5 ml 125 ml|14|0
Dextromethorphan|Benylin DM|Syrup|100 ml|15|0
Guaifenesin|Robitussin|Syrup|100 ml|15|0
Xylometazoline|Otrivin|Drops|0.1% nasal 10 ml|9|0
Oxymetazoline|Iliadin|Drops|0.05% nasal 10 ml|9|0
Sodium chloride|Sterimar|Other|nasal spray 100 ml|28|0
Mometasone|Nasonex|Other|nasal spray 140 doses|42|1
Fluticasone|Flixonase|Other|nasal spray 120 doses|38|1
Ciprofloxacin + Dexamethasone|Ciprodex|Drops|ear drops 5 ml|28|1
Benzocaine + Phenazone|Otosporin|Drops|ear drops 10 ml|14|1
Benzydamine|Tantum Verde|Other|gargle 120 ml|18|0
Amylmetacresol|Strepsils|Other|lozenge|0.6|0
Prednisolone|Prednisolone|Tablet|5 mg|0.4|1
Prednisolone|Predsol|Syrup|5 mg/5 ml 100 ml|18|1
Methylprednisolone|Medrol|Tablet|16 mg|3|1
Methylprednisolone|Solu-Medrol|Injection|40 mg|11|1
Dexamethasone|Dexamethasone|Tablet|0.5 mg|0.3|1
Dexamethasone|Dexamethasone|Injection|4 mg/ml|2|1
Hydrocortisone|Solu-Cortef|Injection|100 mg|9|1
Hydrocortisone|Hydrocortisone|Cream|1% 15 g|9|0
Triamcinolone|Kenacort|Injection|40 mg/ml|9|1
Betamethasone|Diprosone|Injection|1 ml|9|1
Adrenaline|Adrenaline|Injection|1 mg/ml|3|1
# Cardiovascular / diabetes / lipids
Amlodipine|Norvasc|Tablet|5 mg|1.2|1
Amlodipine|Norvasc|Tablet|10 mg|1.8|1
Atenolol|Tenormin|Tablet|50 mg|0.8|1
Bisoprolol|Concor|Tablet|5 mg|1.5|1
Metoprolol|Betaloc|Tablet|50 mg|0.9|1
Carvedilol|Dilatrend|Tablet|12.5 mg|1.5|1
Propranolol|Inderal|Tablet|40 mg|0.5|1
Nebivolol|Nebilet|Tablet|5 mg|2.5|1
Enalapril|Renitec|Tablet|10 mg|1|1
Lisinopril|Zestril|Tablet|10 mg|1.2|1
Perindopril|Coversyl|Tablet|5 mg|2.5|1
Ramipril|Tritace|Tablet|5 mg|1.8|1
Losartan|Cozaar|Tablet|50 mg|2.5|1
Valsartan|Diovan|Tablet|80 mg|3.5|1
Valsartan + Hydrochlorothiazide|Co-Diovan|Tablet|160/12.5 mg|4.5|1
Irbesartan|Aprovel|Tablet|150 mg|3|1
Telmisartan|Micardis|Tablet|40 mg|3.5|1
Olmesartan|Olmetec|Tablet|20 mg|3.5|1
Candesartan|Atacand|Tablet|16 mg|3.5|1
Hydrochlorothiazide|Esidrex|Tablet|25 mg|0.5|1
Indapamide|Natrilix SR|Tablet|1.5 mg|1.5|1
Furosemide|Lasix|Tablet|40 mg|0.4|1
Furosemide|Lasix|Injection|20 mg/2 ml|1.5|1
Spironolactone|Aldactone|Tablet|25 mg|1.5|1
Nifedipine|Adalat Retard|Tablet|20 mg|1|1
Diltiazem|Tildiem|Tablet|60 mg|1|1
Verapamil|Isoptin|Tablet|80 mg|0.8|1
Methyldopa|Aldomet|Tablet|250 mg|0.8|1
Hydralazine|Apresoline|Tablet|25 mg|1|1
Isosorbide mononitrate|Imdur|Tablet|60 mg|1.8|1
Glyceryl trinitrate|Nitrolingual|Other|spray 200 doses|38|1
Amiodarone|Cordarone|Tablet|200 mg|2|1
Digoxin|Lanoxin|Tablet|0.25 mg|0.5|1
Clopidogrel|Plavix|Tablet|75 mg|3.5|1
Warfarin|Marevan|Tablet|5 mg|1.5|1
Rivaroxaban|Xarelto|Tablet|20 mg|12|1
Apixaban|Eliquis|Tablet|5 mg|10|1
Enoxaparin|Clexane|Injection|40 mg/0.4 ml|24|1
Atorvastatin|Lipitor|Tablet|20 mg|3.5|1
Atorvastatin|Lipitor|Tablet|40 mg|5|1
Rosuvastatin|Crestor|Tablet|10 mg|4.5|1
Rosuvastatin|Crestor|Tablet|20 mg|6|1
Simvastatin|Zocor|Tablet|20 mg|2|1
Fenofibrate|Lipanthyl|Capsule|200 mg|3.5|1
Ezetimibe|Ezetrol|Tablet|10 mg|5|1
Metformin|Glucophage|Tablet|500 mg|0.6|1
Metformin|Glucophage|Tablet|850 mg|0.9|1
Metformin|Glucophage XR|Tablet|1000 mg|1.8|1
Gliclazide|Diamicron MR|Tablet|60 mg|2|1
Glimepiride|Amaryl|Tablet|2 mg|1.8|1
Glibenclamide|Daonil|Tablet|5 mg|0.5|1
Sitagliptin|Januvia|Tablet|100 mg|9|1
Sitagliptin + Metformin|Janumet|Tablet|50/1000 mg|9|1
Vildagliptin|Galvus|Tablet|50 mg|5|1
Linagliptin|Trajenta|Tablet|5 mg|9|1
Empagliflozin|Jardiance|Tablet|10 mg|11|1
Dapagliflozin|Forxiga|Tablet|10 mg|10|1
Pioglitazone|Actos|Tablet|30 mg|3|1
Insulin human (regular)|Actrapid|Injection|100 IU/ml 10 ml|32|1
Insulin human (NPH)|Insulatard|Injection|100 IU/ml 10 ml|32|1
Insulin glargine|Lantus|Injection|100 IU/ml pen|75|1
Insulin aspart|NovoRapid|Injection|100 IU/ml pen|70|1
Insulin mixed 30/70|Mixtard 30|Injection|100 IU/ml pen|65|1
Glucose test strips|Accu-Chek Active|Other|box of 50|85|0
Glucose|Dextrose|Injection|50% 50 ml|5|1
# Neuro / psych
Sumatriptan|Imigran|Tablet|50 mg|9|1
Rizatriptan|Maxalt|Tablet|10 mg|9|1
Flunarizine|Sibelium|Tablet|5 mg|2|1
Betahistine|Serc|Tablet|16 mg|2.5|1
Cinnarizine|Stugeron|Tablet|25 mg|0.7|0
Carbamazepine|Tegretol|Tablet|200 mg|1|1
Sodium valproate|Depakine|Tablet|500 mg|2|1
Levetiracetam|Keppra|Tablet|500 mg|4|1
Phenytoin|Epanutin|Capsule|100 mg|1|1
Lamotrigine|Lamictal|Tablet|100 mg|3.5|1
Diazepam|Valium|Tablet|5 mg|0.8|1|C
Diazepam|Valium|Injection|10 mg/2 ml|3|1|C
Clonazepam|Rivotril|Tablet|2 mg|1.5|1|C
Alprazolam|Xanax|Tablet|0.5 mg|1.2|1|C
Lorazepam|Ativan|Tablet|1 mg|1|1|C
Zolpidem|Stilnox|Tablet|10 mg|3|1|C
Escitalopram|Cipralex|Tablet|10 mg|4|1
Sertraline|Zoloft|Tablet|50 mg|3.5|1
Fluoxetine|Prozac|Capsule|20 mg|2.5|1
Paroxetine|Seroxat|Tablet|20 mg|3|1
Amitriptyline|Tryptizol|Tablet|25 mg|0.6|1
Mirtazapine|Remeron|Tablet|30 mg|3.5|1
Duloxetine|Cymbalta|Capsule|60 mg|7|1
Quetiapine|Seroquel|Tablet|100 mg|4|1
Risperidone|Risperdal|Tablet|2 mg|2.5|1
Olanzapine|Zyprexa|Tablet|10 mg|4|1
Haloperidol|Serenace|Tablet|5 mg|0.8|1
# Hormones, vitamins, women's health, urology, others
Levothyroxine|Euthyrox|Tablet|50 mcg|0.8|1
Levothyroxine|Euthyrox|Tablet|100 mcg|1|1
Carbimazole|Neomercazole|Tablet|5 mg|1|1
Ethinylestradiol + Levonorgestrel|Microgynon|Tablet|21 tablets|14|1
Drospirenone + Ethinylestradiol|Yasmin|Tablet|21 tablets|45|1
Levonorgestrel|Postinor|Tablet|1.5 mg|22|1
Medroxyprogesterone|Provera|Tablet|10 mg|3|1
Norethisterone|Primolut N|Tablet|5 mg|1.5|1
Dydrogesterone|Duphaston|Tablet|10 mg|3.5|1
Progesterone|Utrogestan|Capsule|200 mg|5|1
Tranexamic acid|Cyklokapron|Capsule|500 mg|2|1
Mefenamic acid|Ponstan Forte|Tablet|500 mg|1.5|1
Folic acid|Folic acid|Tablet|5 mg|0.2|0
Ferrous sulfate + Folic acid|Ferrograd Folic|Tablet|325 mg + 0.35 mg|1|0
Iron polymaltose|Maltofer|Syrup|50 mg/5 ml 150 ml|28|0
Vitamin D3|Vigantol|Drops|20,000 IU/ml 10 ml|22|0
Cholecalciferol|D-Cure|Other|50,000 IU ampoule|8|0
Calcium + Vitamin D|Calcium Sandoz|Tablet|500 mg + 400 IU effervescent|1.5|0
Vitamin B complex|Neurobion|Tablet|B1 B6 B12|1.5|0
Vitamin B12|Cobalamin|Injection|1000 mcg/ml|3|1
Vitamin C|Redoxon|Tablet|1000 mg effervescent|1.8|0
Multivitamin|Centrum|Tablet|adults|2|0
Multivitamin drops|Pedia Vit|Drops|30 ml|25|0
Omega-3|Omacor|Capsule|1 g|3|0
Magnesium|Magnesium|Tablet|300 mg|1|0
Potassium chloride|Slow-K|Tablet|600 mg|0.6|1
Allopurinol|Zyloric|Tablet|100 mg|0.5|1
Colchicine|Colchicine|Tablet|0.5 mg|0.8|1
Alendronate|Fosamax|Tablet|70 mg|8|1
Tamsulosin|Omnic|Capsule|0.4 mg|3.5|1
Finasteride|Proscar|Tablet|5 mg|3|1
Sildenafil|Viagra|Tablet|50 mg|18|1
Tadalafil|Cialis|Tablet|5 mg|14|1
Oxybutynin|Ditropan|Tablet|5 mg|1.5|1
Solifenacin|Vesicare|Tablet|5 mg|7|1
Potassium citrate|Urocit-K|Other|sachet|3|1
Isotretinoin|Roaccutane|Capsule|20 mg|8|1
Adapalene|Differin|Cream|0.1% 30 g|44|1
Benzoyl peroxide|Panoxyl|Cream|5% 40 g|28|0
Calamine|Calamine|Cream|lotion 100 ml|9|0
Urea|Eucerin Urea|Cream|10% 100 ml|42|0
Petroleum jelly|Vaseline|Cream|100 g|7|0
Zinc oxide|Sudocrem|Cream|60 g|22|0
Povidone iodine|Betadine|Other|solution 10% 120 ml|12|0
Chlorhexidine|Hibiscrub|Other|4% 250 ml|18|0
Hydrogen peroxide|Hydrogen peroxide|Other|3% 120 ml|5|0
Sodium chloride|Normal saline|Injection|0.9% 500 ml|4|1
Ringer lactate|Hartmann|Injection|500 ml|5|1
Dextrose saline|Dextrose saline|Injection|500 ml|5|1
Water for injection|Sterile water|Injection|10 ml|1|0
Lidocaine|Xylocaine|Injection|2% 20 ml|6|1
Lidocaine|Xylocaine|Other|2% gel 30 g|14|0
Bupivacaine|Marcaine|Injection|0.5% 20 ml|9|1
Atropine|Atropine|Injection|1 mg/ml|2|1
Chlorhexidine|Corsodyl|Other|0.2% mouthwash 300 ml|24|0
Tetanus toxoid|TT|Injection|0.5 ml|8|1
Artificial tears|Hylo-Comod|Drops|10 ml|32|0
Olopatadine|Patanol|Drops|0.1% eye drops 5 ml|28|1
Timolol|Timoptic|Drops|0.5% eye drops 5 ml|14|1
Fluorometholone|FML|Drops|0.1% eye drops 5 ml|20|1
Diclofenac|Voltaren Ophtha|Drops|0.1% eye drops 5 ml|20|1
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));
