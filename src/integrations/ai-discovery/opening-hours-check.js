// @ts-check
/**
 * @cw/core/integrations/ai-discovery/opening-hours-check
 *
 * Öffnungszeiten-Guard: meldet JSON-LD-Knoten mit LocalBusiness-Typ (oder Untertyp), die
 * weder `openingHours` noch `openingHoursSpecification` mit Inhalt tragen. Pure
 * String-Logik pro Seiten-HTML; Directory-Walk und Entdoppeln über die Seiten macht der
 * Aufrufer (index.ts), gleicher Split wie review-claims-check.js.
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): baeckereizink beschreibt sich als
 * LocalBusiness/Bakery, das Hauptobjekt hat aber keine Öffnungszeiten —
 * `site-data.ts seo.openingHours: [] as string[]`, und SchemaOrg.astro lässt die leere
 * Liste stillschweigend weg. Google-Unternehmensprofil, Maps und KI-Assistenten beantworten
 * „Hat … jetzt offen?“ dann aus fremden Quellen oder gar nicht.
 *
 * REGEL
 *   - Geprüft werden die obersten Knoten jedes JSON-LD-Blocks (inkl. `@graph` und
 *     Top-Level-Arrays) — das sind die Entitäten, die eine Seite BESCHREIBT.
 *   - Ein Knoten zählt, wenn einer seiner Typen LocalBusiness oder ein Untertyp ist
 *     (Liste unten + Endungen …Business/…Store/…Shop). Organization, Corporation,
 *     Product, WebSite, Service, Place usw. zählen nicht — auch nicht in Kombination,
 *     es sei denn, ein LocalBusiness-Typ steht zusätzlich im Array.
 *   - Leer ist: fehlend, null, "", [], nur leere Strings bzw. nur leere Objekte.
 *   - Reine Referenzen (`{"@type": …, "@id": …}` ohne weitere Angaben) werden übersprungen.
 *
 * GRENZEN
 *   - Verschachtelte LocalBusiness-Knoten (`department`, `subOrganization`,
 *     `containedInPlace`, `worksFor`) prüft er nicht: dort stehen fast immer Verweise
 *     („im Netto“, „arbeitet für …“), keine vollständigen Beschreibungen.
 *   - Reine Service-Area-Betriebe ohne Ladengeschäft haben oft keine festen Zeiten. Der
 *     Guard meldet sie trotzdem — Google empfiehlt Zeiten auch dort (Erreichbarkeit). Wer
 *     bewusst keine angibt: `checkOpeningHours: false`.
 *   - Exotische schema.org-Untertypen, die weder in der Liste stehen noch auf
 *     …Business/…Store/…Shop enden, fallen durch.
 *
 * @typedef {'missing_opening_hours'} OpeningHoursIssueType
 * @typedef {{ type: OpeningHoursIssueType, id: string, details: string }} OpeningHoursIssue
 */

/**
 * LocalBusiness und seine schema.org-Untertypen (kleingeschrieben), dazu die im Fleet und
 * in cw-core `schema/local-business.ts` benutzten Namen (WineStore, WineryOrVinyard).
 * Bewusst NICHT die Liste aus review-claims-check.js: die enthält Organization, weil dort
 * auch Organisationen kein Eigen-Rating haben dürfen — Öffnungszeiten braucht eine
 * Organization nicht.
 */
const LOCAL_BUSINESS_TYPEN = new Set(
  [
    'LocalBusiness',
    // Oberkategorien
    'AnimalShelter', 'ArchiveOrganization', 'AutomotiveBusiness', 'ChildCare', 'Dentist',
    'DryCleaningOrLaundry', 'EmergencyService', 'EmploymentAgency', 'EntertainmentBusiness',
    'FinancialService', 'FoodEstablishment', 'GovernmentOffice', 'HealthAndBeautyBusiness',
    'HomeAndConstructionBusiness', 'InternetCafe', 'LegalService', 'Library', 'LodgingBusiness',
    'MedicalBusiness', 'ProfessionalService', 'RadioStation', 'RealEstateAgent', 'RecyclingCenter',
    'SelfStorage', 'ShoppingCenter', 'SportsActivityLocation', 'Store', 'TelevisionStation',
    'TouristInformationCenter', 'TravelAgency',
    // Automotive
    'AutoBodyShop', 'AutoDealer', 'AutoPartsStore', 'AutoRental', 'AutoRepair', 'AutoWash',
    'GasStation', 'MotorcycleDealer', 'MotorcycleRepair',
    // Emergency / Government
    'FireStation', 'Hospital', 'PoliceStation', 'PostOffice',
    // Entertainment
    'AdultEntertainment', 'AmusementPark', 'ArtGallery', 'Casino', 'ComedyClub', 'MovieTheater', 'NightClub',
    // Financial
    'AccountingService', 'AutomatedTeller', 'BankOrCreditUnion', 'InsuranceAgency',
    // Food
    'Bakery', 'BarOrPub', 'Brewery', 'CafeOrCoffeeShop', 'Distillery', 'FastFoodRestaurant',
    'IceCreamShop', 'Restaurant', 'Winery', 'WineryOrVinyard',
    // Health & Beauty
    'BeautySalon', 'DaySpa', 'HairSalon', 'HealthClub', 'NailSalon', 'TattooParlor',
    // Home & Construction
    'Electrician', 'GeneralContractor', 'HVACBusiness', 'HousePainter', 'Locksmith',
    'MovingCompany', 'Plumber', 'RoofingContractor',
    // Legal
    'Attorney', 'Notary',
    // Lodging
    'BedAndBreakfast', 'Campground', 'Hostel', 'Hotel', 'Motel', 'Resort', 'VacationRental',
    // Medical
    'CommunityHealth', 'Dermatology', 'DietNutrition', 'Emergency', 'Geriatric', 'Gynecologic',
    'MedicalClinic', 'Midwifery', 'Nursing', 'Obstetric', 'Oncologic', 'Optician', 'Optometric',
    'Otolaryngologic', 'Pediatric', 'Pharmacy', 'Physician', 'Physiotherapy', 'PlasticSurgery',
    'Podiatric', 'PrimaryCare', 'Psychiatric', 'PublicHealth', 'VeterinaryCare',
    // Sports
    'BowlingAlley', 'ExerciseGym', 'GolfCourse', 'PublicSwimmingPool', 'SkiResort', 'SportsClub',
    'StadiumOrArena', 'TennisComplex',
    // Store
    'BikeStore', 'BookStore', 'ClothingStore', 'ComputerStore', 'ConvenienceStore', 'DepartmentStore',
    'ElectronicsStore', 'Florist', 'FurnitureStore', 'GardenStore', 'GroceryStore', 'HardwareStore',
    'HobbyShop', 'HomeGoodsStore', 'JewelryStore', 'LiquorStore', 'MensClothingStore',
    'MobilePhoneStore', 'MovieRentalStore', 'MusicStore', 'OfficeEquipmentStore', 'OutletStore',
    'PawnShop', 'PetStore', 'ShoeStore', 'SportingGoodsStore', 'TireShop', 'ToyStore',
    'WholesaleStore', 'WineStore',
  ].map((t) => t.toLowerCase()),
);

/**
 * Endungen, die im schema.org-Baum nur unter LocalBusiness vorkommen. NICHT
 * …Organization (SportsOrganization, NGO …) und NICHT …Service (schema.org/Service ist
 * ein Angebot, kein Ort).
 */
const LB_ENDUNG_RE = /(?:business|store|shop)$/i;

/**
 * @param {string[]} typen Typnamen ohne schema.org-Präfix, beliebige Schreibweise.
 * @returns {boolean}
 */
export function istLocalBusiness(typen) {
  return typen.some((t) => {
    const k = t.toLowerCase();
    return LOCAL_BUSINESS_TYPEN.has(k) || LB_ENDUNG_RE.test(k);
  });
}

/** @param {unknown} t @returns {string[]} */
function typNamen(t) {
  const arr = Array.isArray(t) ? t : [t];
  return arr
    .filter((x) => typeof x === 'string')
    .map((x) => /** @type {string} */ (x).replace(/^https?:\/\/schema\.org\//i, ''));
}

/** @param {unknown} v Inhalt vorhanden? */
function gefuellt(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.some(gefuellt);
  if (typeof v === 'object') return Object.keys(/** @type {object} */ (v)).length > 0;
  return true;
}

/** Nur @type/@id/@context → Verweis auf eine anderswo beschriebene Entität. @param {Record<string, unknown>} n */
const istReferenz = (n) => Object.keys(n).every((k) => k === '@type' || k === '@id' || k === '@context');

/** @param {string} html @returns {unknown[]} */
function jsonLdBloecke(html) {
  /** @type {unknown[]} */
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* ungültiges JSON meldet der Schema-Linter */
    }
  }
  return out;
}

/** @param {unknown[]} bloecke @returns {Record<string, unknown>[]} */
function obersteKnoten(bloecke) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const b of bloecke) {
    for (const k of Array.isArray(b) ? b : [b]) {
      if (!k || typeof k !== 'object') continue;
      const obj = /** @type {Record<string, unknown>} */ (k);
      if (Array.isArray(obj['@graph'])) {
        for (const g of obj['@graph']) if (g && typeof g === 'object') out.push(/** @type {Record<string, unknown>} */ (g));
      } else {
        out.push(obj);
      }
    }
  }
  return out;
}

/**
 * Prüft eine gebaute Seite.
 *
 * @param {string} html
 * @param {string} [pagePath] Nur für die Meldung.
 * @returns {OpeningHoursIssue[]}
 */
export function checkOpeningHours(html, pagePath = '') {
  /** @type {OpeningHoursIssue[]} */
  const issues = [];
  if (!html) return issues;
  for (const n of obersteKnoten(jsonLdBloecke(html))) {
    const typen = typNamen(n['@type']);
    if (!istLocalBusiness(typen) || istReferenz(n)) continue;
    if (gefuellt(n.openingHours) || gefuellt(n.openingHoursSpecification)) continue;
    const id = typeof n['@id'] === 'string' ? n['@id'] : `${typen.join('/')}:${typeof n.name === 'string' ? n.name : '?'}`;
    const name = typeof n.name === 'string' ? ` „${n.name}“` : '';
    issues.push({
      type: 'missing_opening_hours',
      id,
      details:
        `${pagePath || 'Seite'}: ${typen.join('/')}${name} (${id}) ohne openingHours/openingHoursSpecification. ` +
        'Öffnungs- oder Erreichbarkeitszeiten in siteData.seo.openingHours eintragen ' +
        '(z. B. „Mo-Fr 08:00-17:00“) — leere Listen lässt SchemaOrg.astro weg.',
    });
  }
  return issues;
}
