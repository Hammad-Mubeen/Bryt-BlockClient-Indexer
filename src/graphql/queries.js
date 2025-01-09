const {
  GraphQLList,
  GraphQLInt,
  GraphQLString,
} = require("graphql");

// import types
const { blocksType } = require("./types/block");
const { transactionsType } = require("./types/transaction");

const DB = require("../db");
// import Models
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");

const blocks = {
  type: GraphQLList(blocksType),
  description: "Latest blocks and view all blocks",
  args: {
    start: { type: GraphQLInt },
    end: { type: GraphQLInt },
  },
  async resolve(parent, args, context) {
    try {
      let blocks = await DB(BlockModel.table);
      blocks.sort((a, b) => b.block_number - a.block_number);
      if(args.start == 0 && args.end == 0)
      {
        return blocks;
      }
      return blocks.splice(args.start, args.end);
    } catch (error) {
      throw new Error(error);
    }
  },
};

const block = {
  type: blocksType,
  description: "View a single block",
  args: {
    number: { type: GraphQLString }
  },
  async resolve(parent, args, context) {
    try {
      let block = await DB(BlockModel.table).where({block_number : args.number});
      return block[0];
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transactions = {
  type: GraphQLList(transactionsType),
  description: "Latest transactions and view all transactions",
  args: {
    start: { type: GraphQLInt },
    end: { type: GraphQLInt },
  },
  async resolve(parent, args, context) {
    try {
      let transactions = await DB(TransactionModel.table);
      return transactions.splice(args.start, args.end);
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transaction = {
  type: transactionsType,
  description: "View a single transaction",
  args: {
    hash: { type: GraphQLString }
  },
  async resolve(parent, args, context) {
    try {
      let transaction = await DB(TransactionModel.table).where({hash : args.hash});
      return transaction[0];
    } catch (error) {
      throw new Error(error);
    }
  },
};

module.exports = {
  blocks,
  block,
  transactions,
  transaction
};
