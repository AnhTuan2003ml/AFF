import type { AppConfig } from "../../config.js";
import type { Database } from "../../db.js";
import type { EmailService } from "../../services/email.js";

export interface ApiDeps {
  db: Database;
  config: AppConfig;
  emailService: EmailService;
}
