import type { InteractiveElement } from "../../shared/types";
import type { AutofillProfile, AutofillMatch } from "../../shared/autofill-types";

type CandidateValue = { value: string; confidence: number; matchedBy: AutofillMatch["matchedBy"]; profileKey: string };

const AUTOCOMPLETE_MAP: Record<string, keyof AutofillProfile> = {
  "given-name": "firstName",
  "family-name": "lastName",
  "surname": "lastName",
  "email": "email",
  "tel": "phone",
  "tel-national": "phone",
  "phone": "phone",
  "organization": "organization",
  "company": "organization",
  "street-address": "addressLine1",
  "address-line1": "addressLine1",
  "address-line2": "addressLine2",
  "address-level1": "state",
  "address-level2": "city",
  "state": "state",
  "province": "state",
  "city": "city",
  "postal-code": "postalCode",
  "zip": "postalCode",
  "zip-code": "postalCode",
  "country": "country",
  "country-name": "country",
  "country-code": "country",
};

const INPUT_TYPE_MAP: Record<string, keyof AutofillProfile> = {
  email: "email",
  tel: "phone",
};

const NAME_MAP: Record<string, keyof AutofillProfile> = {
  firstname: "firstName",
  first_name: "firstName",
  "first-name": "firstName",
  fname: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  "last-name": "lastName",
  lname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  email: "email",
  e_mail: "email",
  "e-mail": "email",
  emailaddress: "email",
  mail: "email",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  mobile: "phone",
  cell: "phone",
  company: "organization",
  organization: "organization",
  organisation: "organization",
  companyname: "organization",
  address: "addressLine1",
  street: "addressLine1",
  "street-address": "addressLine1",
  address1: "addressLine1",
  "address-line1": "addressLine1",
  "addr-line1": "addressLine1",
  address2: "addressLine2",
  "address-line2": "addressLine2",
  "addr-line2": "addressLine2",
  city: "city",
  town: "city",
  locality: "city",
  state: "state",
  province: "state",
  region: "state",
  zip: "postalCode",
  zipcode: "postalCode",
  "zip-code": "postalCode",
  "postal-code": "postalCode",
  postalcode: "postalCode",
  postcode: "postalCode",
  country: "country",
};

const LABEL_MAP: Record<string, keyof AutofillProfile> = {
  "first name": "firstName",
  "given name": "firstName",
  "last name": "lastName",
  "surname": "lastName",
  "family name": "lastName",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  phone: "phone",
  telephone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  company: "organization",
  organization: "organization",
  organisation: "organization",
  "company name": "organization",
  address: "addressLine1",
  "street address": "addressLine1",
  "address line 1": "addressLine1",
  "address line 2": "addressLine2",
  city: "city",
  town: "city",
  state: "state",
  province: "state",
  region: "state",
  zip: "postalCode",
  "zip code": "postalCode",
  "postal code": "postalCode",
  "post code": "postalCode",
  country: "country",
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_-]+/g, " ");
}

function getFullName(profile: AutofillProfile): string {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
}

function mk(val: string, confidence: number, matchedBy: CandidateValue["matchedBy"], profileKey: string): CandidateValue {
  return { value: val, confidence, matchedBy, profileKey };
}

function matchField(
  el: InteractiveElement,
  profile: AutofillProfile,
): CandidateValue | null {
  if (el.type !== "input" && el.type !== "select" && el.type !== "textarea") return null;
  if (el.disabled) return null;
  const inputType = (el.inputType || "text").toLowerCase();
  if (inputType === "hidden" || inputType === "submit" || inputType === "button" || inputType === "file" || inputType === "image") return null;
  if (inputType === "password" || inputType === "checkbox" || inputType === "radio") return null;

  if (el.autocomplete) {
    const key = el.autocomplete.replace(/section-\w+\s+/, "").replace(/^shipping\s+|^billing\s+/, "");
    if (key === "name" || key === "additional-name") {
      const fullName = getFullName(profile);
      if (fullName) return mk(fullName, 100, "autocomplete", "fullName");
    }
    const pk = AUTOCOMPLETE_MAP[key];
    if (pk && profile[pk]) return mk(profile[pk], 100, "autocomplete", pk);
  }

  if (INPUT_TYPE_MAP[inputType]) {
    const pk = INPUT_TYPE_MAP[inputType];
    if (profile[pk]) return mk(profile[pk], 90, "inputType", pk);
  }

  if (el.name) {
    const norm = normalize(el.name);
    const pk = NAME_MAP[norm];
    if (pk && profile[pk]) return mk(profile[pk], 80, "name", pk);
    for (const [pattern, pk2] of Object.entries(NAME_MAP)) {
      if (norm.includes(pattern) && profile[pk2]) return mk(profile[pk2], 70, "name", pk2);
    }
  }

  if (el.label) {
    const norm = normalize(el.label);
    if (norm === "full name" || norm.includes("full name")) {
      const fullName = getFullName(profile);
      if (fullName) return mk(fullName, 75, "label", "fullName");
    }
    const pk = LABEL_MAP[norm];
    if (pk && profile[pk]) return mk(profile[pk], 75, "label", pk);
    for (const [pattern, pk2] of Object.entries(LABEL_MAP)) {
      if (norm.includes(pattern) && profile[pk2]) return mk(profile[pk2], 65, "label", pk2);
    }
  }

  if (el.placeholder) {
    const norm = normalize(el.placeholder);
    if (norm === "full name" || norm.includes("full name")) {
      const fullName = getFullName(profile);
      if (fullName) return mk(fullName, 50, "placeholder", "fullName");
    }
    for (const [pattern, pk] of Object.entries(LABEL_MAP)) {
      if (norm.includes(pattern) && profile[pk]) return mk(profile[pk], 50, "placeholder", pk);
    }
  }

  return null;
}

export function matchFields(
  elements: InteractiveElement[],
  profile: AutofillProfile,
): AutofillMatch[] {
  const assigned = new Map<string, AutofillMatch>();

  for (const el of elements) {
    const candidate = matchField(el, profile);
    if (!candidate) continue;

    const existing = assigned.get(candidate.profileKey);
    if (existing && existing.confidence >= candidate.confidence) continue;

    if (el.index == null || !el.selector) continue;

    assigned.set(candidate.profileKey, {
      fieldIndex: el.index,
      selector: el.selector,
      value: candidate.value,
      confidence: candidate.confidence,
      matchedBy: candidate.matchedBy,
    });
  }

  const seen = new Set<number>();
  const results: AutofillMatch[] = [];
  for (const match of assigned.values()) {
    if (seen.has(match.fieldIndex)) continue;
    seen.add(match.fieldIndex);
    results.push(match);
  }

  return results;
}
