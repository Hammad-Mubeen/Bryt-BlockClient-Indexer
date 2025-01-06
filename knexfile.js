// Update with your config settings.
require("dotenv").config();
const { DB_CLIENT, DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_DATABASE } = process.env;

module.exports = {
  client: DB_CLIENT,
  connection: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    charset: "utf8",
    debug: false,
  },
  migrations: {
    directory: process.env.MIGRATION_DIR,
  },
  seeds: {
    directory: process.env.SEED_DIR,
  },
};
