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
  description: "Retrieves list of blocks",
  args: {
    start: { type: GraphQLInt },
    end: { type: GraphQLInt },
  },
  async resolve(parent, args, context) {
    try {
      let blocks = await DB(BlockModel.table);
      return blocks.splice(args.start, args.end);
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transactions = {
  type: GraphQLList(transactionsType),
  description: "Retrieves list of transactions",
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

module.exports = {
  blocks,
  transactions
};
