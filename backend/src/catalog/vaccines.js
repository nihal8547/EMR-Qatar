'use strict';
/**
 * Childhood vaccines and the Qatar routine schedule, following the MoPH National Immunization Schedule as published
 * (Birth: BCG, HepB; 2 and 4 months: Hexa, Rota, PCV; 6 months: OPV, Penta, PCV; 12 months: MMR, Varicella;
 *  18 months: OPV, MMR, Tetra; 4-6 years: OPV, Varicella, DTaP booster; 13-18 years: Tdap).
 * The schedule is editable (Clinical > Vaccine Master > Schedule). Verify against the current MoPH schedule before go-live.
 * code | name | protects against | route | usual site | doses "dose:ageMonths:graceMonths:routine(1/0):label" separated by ;
 */
module.exports = `
BCG|BCG|Tuberculosis|ID|Left upper arm|1:0:2:1:At birth
HEPB|Hepatitis B|Hepatitis B|IM|Right thigh|1:0:1:1:At birth
HEXA|Hexavalent (DTaP-IPV-Hib-HepB)|Diphtheria, tetanus, pertussis, polio, Hib, hepatitis B|IM|Thigh|1:2:1:1:;2:4:1:1:
ROTA|Rotavirus|Rotavirus gastroenteritis|Oral|Oral|1:2:1:1:;2:4:1:1:
PCV|Pneumococcal conjugate (PCV)|Pneumococcal disease|IM|Thigh|1:2:1:1:;2:4:1:1:;3:6:1:1:
OPV|Oral polio (OPV)|Poliomyelitis|Oral|Oral|1:6:1:1:;2:18:2:1:;3:48:24:1:
PENTA|Pentavalent (DTP-HepB-Hib)|Diphtheria, tetanus, pertussis, hepatitis B, Hib|IM|Thigh|1:6:1:1:
MMR|MMR|Measles, mumps, rubella|SC|Upper arm|1:12:1:1:;2:18:2:1:
VAR|Varicella|Chickenpox|SC|Upper arm|1:12:1:1:;2:48:24:1:
TETRA|Tetravalent (Tetra)|Diphtheria, tetanus, pertussis, Hib|IM|Thigh|1:18:2:1:
DTAPB|DTaP booster|Diphtheria, tetanus, pertussis|IM|Upper arm|1:48:24:1:School entry booster
TDAP|Tdap|Tetanus, diphtheria, pertussis|IM|Upper arm|1:156:60:1:Adolescent booster
FLU|Influenza (annual)|Seasonal influenza|IM|Thigh / upper arm|1:6:12:0:Annual from 6 months
MENACWY|Meningococcal ACWY|Meningococcal disease (Hajj / Umrah, travel)|IM|Upper arm|1:24:12:0:Recommended for Hajj/Umrah and endemic travel
HEPA|Hepatitis A|Hepatitis A (travel to high-risk countries)|IM|Upper arm|1:12:6:0:;2:18:12:0:
HPV|HPV|Human papillomavirus|IM|Upper arm|1:156:60:0:;2:162:60:0:
TYPHOID|Typhoid|Typhoid fever|IM|Upper arm|
`.trim().split('\n').filter((l) => l && !l.startsWith('#'));
