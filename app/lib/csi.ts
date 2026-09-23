// CSI MasterFormat divisions: the standard numbering that specifications, scopes and
// takeoffs are organized by. Marcel asked for the full list (07 is more than "thermal").

export const CSI_DIVISIONS: Record<string, string> = {
  "00": "Procurement and Contracting Requirements",
  "01": "General Requirements",
  "02": "Existing Conditions",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood, Plastics, and Composites",
  "07": "Thermal and Moisture Protection",
  "08": "Openings",
  "09": "Finishes",
  "10": "Specialties",
  "11": "Equipment",
  "12": "Furnishings",
  "13": "Special Construction",
  "14": "Conveying Equipment",
  "21": "Fire Suppression",
  "22": "Plumbing",
  "23": "Heating, Ventilating, and Air Conditioning (HVAC)",
  "25": "Integrated Automation",
  "26": "Electrical",
  "27": "Communications",
  "28": "Electronic Safety and Security",
  "31": "Earthwork",
  "32": "Exterior Improvements",
  "33": "Utilities",
  "34": "Transportation",
  "35": "Waterway and Marine Construction",
  "40": "Process Interconnections",
  "41": "Material Processing and Handling Equipment",
  "42": "Process Heating, Cooling, and Drying Equipment",
  "43": "Process Gas and Liquid Handling, Purification, and Storage Equipment",
  "44": "Pollution and Waste Control Equipment",
  "45": "Industry-Specific Manufacturing Equipment",
  "46": "Water and Wastewater Equipment",
  "48": "Electrical Power Generation",
};

/** "09 65 19" → "09". Undefined when the text is not a MasterFormat section number. */
export const csiDivision = (section: string): string | undefined => {
  const division = /^(\d{2})\s?\d{2}\s?\d{2}(\.\d+)?$/.exec(section.trim())?.[1];
  return division && division in CSI_DIVISIONS ? division : undefined;
};
