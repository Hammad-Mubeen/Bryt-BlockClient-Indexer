/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  return knex.schema.createTable("blocks", function (t) {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string("version").notNull();
    t.string("merkle_root").notNull();
    t.string("block_number").notNull();
    t.string("previous_hash").notNull();
    t.string("state_root").notNull();
    t.string("transaction_root").notNull();
    t.string("reciept_root").notNull();
    t.string("timestamp").nullable();
    t.string("logs_bloom").notNull();
    t.specificType('transactions', 'text ARRAY');
    t.string("block_reward").notNull();
    t.string("value").notNull();
    t.string("data").notNull();
    t.string("to").notNull();
    t.string("block_hash").notNull();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("blocks");
};
