/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    return knex.schema.createTable("transactions", function (t) {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.string("hash").notNull();
      t.string("block").notNull();
      t.string("from").notNull();
      t.string("to").notNull();
      t.string("value").notNull();
      t.string("transaction_time").notNull();
      t.boolean("transaction_status");
      t.string("functionType").notNull();
      t.string("unix_timestamp").notNull();
      t.boolean("Status");
      t.boolean("State");
      t.string("nonce").notNull();
      t.string("type").notNull();
      t.string("node_id").notNull();
      t.string("gas").notNull();
      t.string("gas_price").notNull();
      t.string("input").notNull();
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
exports.down = function (knex) {
  return knex.schema.dropTable("transactions");
};
  