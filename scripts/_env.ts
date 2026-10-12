// Loads .env.local then .env for CLI scripts. Import this first.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
