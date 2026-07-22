import fs from "fs";
import path from "path";

const LOGO_PATH = path.join(process.cwd(), "lib/pdf/assets/logo.png");

export function getLogoDataUri(): string | null {
  try {
    if (!fs.existsSync(LOGO_PATH)) return null;
    return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    return null;
  }
}
