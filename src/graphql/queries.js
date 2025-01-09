const {
  GraphQLList,
  GraphQLInt,
  GraphQLString,
} = require("graphql");

// import types
const { blocksType } = require("./types/block");
const { transactionsType } = require("./types/transaction");
const { blocksORtransactionsType } = require("./types/blockORtransaction");

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
      transactions.sort((a, b) => b.order - a.order);
      if(args.start == 0 && args.end == 0)
      {
        return transactions;
      }
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

const transactionsByAddress = {
  type: GraphQLList(transactionsType),
  description: "All transactions of an address",
  args: {
    address: { type: GraphQLString },
    searchInto: { type: GraphQLString },
    start: { type: GraphQLInt },
    end: { type: GraphQLInt },
  },
  async resolve(parent, args, context) {
    try {
      let transactions = [];
      if(args.searchInto == "from")
      {
        transactions = await DB(TransactionModel.table).where({from : args.address});
      }
      else if (args.searchInto == "to"){
        transactions = await DB(TransactionModel.table).where({to : args.address});
      }
      else if(args.searchInto == "both")
      {
        transactions = await DB(TransactionModel.table)
        .where({from : args.address })
        .orWhere({to: args.address});
      }
      
      transactions.sort((a, b) => b.order - a.order);
      if(args.start == 0 && args.end == 0)
      {
        return transactions;
      }
      return transactions.splice(args.start, args.end);
    } catch (error) {
      throw new Error(error);
    }
  },
};

const search = {
  type: blocksORtransactionsType,
  description: "search by block number, transaction hash or an address",
  args: {
    value: { type: GraphQLString }
  },
  async resolve(parent, args, context) {
    try {
      
      let block = await DB(BlockModel.table).where({block_number : args.value});
      if(block.length == 0)
      {
        let transaction = await DB(TransactionModel.table).where({hash : args.value});
        if(transaction.length == 0)
        {
          let transactions = await DB(TransactionModel.table)
          .where({from : args.value })
          .orWhere({to: args.value});

          transactions.sort((a, b) => b.order - a.order);
          return {block: null, transaction: null, transactions : transactions};
        }
        else{
          return {block: null, transaction : transaction[0], transactions: []};
        }
      }
      else{
        return {block: block[0], transaction: null, transactions: []};
      }
    } catch (error) {
      throw new Error(error);
    }
  },
};
module.exports = {
  blocks,
  block,
  transactions,
  transaction,
  transactionsByAddress,
  search
};
