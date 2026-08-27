export interface CuratedFont {
  name: string;
  cssFamily: string;
  weights: string[];
}

export const SYSTEM_FONT: CuratedFont = {
  name: "system",
  cssFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  weights: ["400", "500", "600", "700"]
};

export const CURATED_FONTS: CuratedFont[] = [
  { name: "Inter",             cssFamily: "Inter",             weights: ["400","500","600","700"] },
  { name: "Roboto",            cssFamily: "Roboto",            weights: ["400","500","700"] },
  { name: "Open Sans",         cssFamily: "Open Sans",         weights: ["400","500","600","700"] },
  { name: "Lato",              cssFamily: "Lato",              weights: ["400","700"] },
  { name: "Poppins",           cssFamily: "Poppins",           weights: ["400","500","600","700"] },
  { name: "Montserrat",        cssFamily: "Montserrat",        weights: ["400","500","600","700"] },
  { name: "Nunito",            cssFamily: "Nunito",            weights: ["400","500","600","700"] },
  { name: "Nunito Sans",       cssFamily: "Nunito Sans",       weights: ["400","500","600","700"] },
  { name: "Source Sans 3",     cssFamily: "Source Sans 3",     weights: ["400","500","600","700"] },
  { name: "IBM Plex Sans",     cssFamily: "IBM Plex Sans",     weights: ["400","500","600","700"] },
  { name: "Manrope",           cssFamily: "Manrope",           weights: ["400","500","600","700"] },
  { name: "DM Sans",           cssFamily: "DM Sans",           weights: ["400","500","700"] },
  { name: "Plus Jakarta Sans", cssFamily: "Plus Jakarta Sans", weights: ["400","500","600","700"] },
  { name: "Work Sans",         cssFamily: "Work Sans",         weights: ["400","500","600","700"] },
  { name: "Rubik",             cssFamily: "Rubik",             weights: ["400","500","600","700"] },
  { name: "Karla",             cssFamily: "Karla",             weights: ["400","500","600","700"] },
  { name: "Mulish",            cssFamily: "Mulish",            weights: ["400","500","600","700"] },
  { name: "Outfit",            cssFamily: "Outfit",            weights: ["400","500","600","700"] },
  { name: "Figtree",           cssFamily: "Figtree",           weights: ["400","500","600","700"] },
  { name: "Geist",             cssFamily: "Geist",             weights: ["400","500","600","700"] },
  { name: "Sora",              cssFamily: "Sora",              weights: ["400","500","600","700"] },
  { name: "Urbanist",          cssFamily: "Urbanist",          weights: ["400","500","600","700"] },
  { name: "Public Sans",       cssFamily: "Public Sans",       weights: ["400","500","600","700"] },
  { name: "Onest",             cssFamily: "Onest",             weights: ["400","500","600","700"] }
];

export function findFont(name: string): CuratedFont | null {
  if (name === "system") return SYSTEM_FONT;
  return CURATED_FONTS.find(f => f.name === name) || null;
}

export const DEFAULT_FONT_NAME = "Inter";
export const DEFAULT_WEIGHTS = ["400", "500", "600", "700"];
