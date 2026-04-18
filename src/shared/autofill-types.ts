export interface AutofillProfile {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutofillMatch {
  fieldIndex: number;
  selector: string;
  value: string;
  confidence: number;
  matchedBy: "autocomplete" | "inputType" | "name" | "label" | "placeholder";
}

export interface AutofillResult {
  filled: number;
  skipped: number;
  details: Array<{
    label: string;
    value: string;
    matchedBy: string;
    result: string;
  }>;
}
