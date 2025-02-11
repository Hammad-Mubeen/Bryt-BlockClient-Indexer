/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    return knex.schema.createTable("unconfirmedAndBallotedBlock", function (t) {
      t.integer('id').primary().notNull();
      t.string("unconfirmed_blocknumber").nullable();
      t.string("unconfirmed_total_transactions").notNull();
      t.string("balloted_blocknumber").nullable();
      t.string("balloted_total_transactions").notNull();
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function (knex) {
    return knex.schema.dropTable("unconfirmedAndBallotedBlock");
  };
  