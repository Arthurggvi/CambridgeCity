import { hardDossierEntries } from "./hard_entries.js";
import { linDossierEntries } from "./lin_entries.js";
import { margDossierEntries } from "./marg_entries.js";
import { rienDossierEntries } from "./rien_entries.js";
import { easonDossierEntries } from "./eason_entries.js";

export const socialDossierEntries = Object.freeze([
  ...linDossierEntries,
  ...margDossierEntries,
  ...hardDossierEntries,
  ...rienDossierEntries,
  ...easonDossierEntries
]);