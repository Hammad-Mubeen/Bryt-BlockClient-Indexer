const {
  GraphQLString,
  GraphQLList
} = require("graphql");

// import types
const { blocksType } = require("./types/blocks");
const { transactionsType } = require("./types/transactions");
const { transactionsWithCountType } = require("./types/transactionsWithCount");

const DB = require("../db");
// import Models
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");

const blocks = {
  type: GraphQLList(blocksType),
  description: "Latest blocks and view all blocks",
  args: {
    lastId: { type: GraphQLString },
    limit: { type: GraphQLString },
  },
  async resolve(parent, args, context) {
    try {

      const limit = parseInt(args.limit) || 10;
      const lastId = args.lastId ? BigInt(args.lastId) : null;

      // Keyset pagination: fetch only needed rows
      let query = DB(BlockModel.table)
        .orderBy('id', 'desc')
        .limit(limit);

      if (lastId) {
        query = query.where('id', '<', lastId);
      }

      const blocks = await query;
      
      return blocks;

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
    lastId: { type: GraphQLString },
    limit: { type: GraphQLString },
  },
  async resolve(parent, args, context) {
    try {

      const limit = parseInt(args.limit) || 10;
      const lastId = args.lastId ? BigInt(args.lastId) : null;

      // Keyset pagination: fetch only needed rows
      let query = DB(TransactionModel.table)
        .orderBy('id', 'desc')
        .limit(limit);

      if (lastId) {
        query = query.where('id', '<', lastId);
      }

      const transactions = await query;
      
      return transactions;
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

// const transactionsByAddress = {
//   type: GraphQLList(transactionsType),
//   description: "All transactions of an address",
//   args: {
//     address: { type: GraphQLString },
//     searchInto: { type: GraphQLString }, // 'from', 'to', or 'both'
//     lastId: { type: GraphQLString },     // for keyset pagination
//     limit: { type: GraphQLString },
//   },
//   async resolve(parent, args, context) {
//     try {

//       const limit = parseInt(args.limit) || 10;
//       const lastId = args.lastId ? BigInt(args.lastId) : null;

//       let query = DB(TransactionModel.table).orderBy('id', 'desc').limit(limit);

//       // Apply address filter
//       if (args.searchInto === 'from') {
//         query = query.where('from', args.address);
//       } else if (args.searchInto === 'to') {
//         query = query.where('to', args.address);
//       } else {
//         // Default to both (from OR to)
//         query = query.where(function () {
//           this.where('from', args.address).orWhere('to', args.address);
//         });
//       }

//       // Keyset pagination using id
//       if (lastId) {
//         query = query.where('id', '<', lastId);
//       }

//       const transactions = await query;
      
//       return transactions;
//     } catch (error) {
//       throw new Error(error);
//     }
//   },
// };


const transactionsByAddress = {
  type: transactionsWithCountType,
  description: "All transactions of an address",
  args: {
    address: { type: GraphQLString },
    searchInto: { type: GraphQLString },
    offset: { type: GraphQLString },
    limit: { type: GraphQLString },
  },
  async resolve(parent, args, context) {
    try {

      // count total transactions where to and from both
      let arr = await DB(TransactionModel.table)
      .where({from : args.address})
      .orWhere({to: args.address})
      .count('* as total');

      let count = arr[0].total.toString();

      //Keyset pagination for blocks data
      let transactions = await DB(TransactionModel.table)
      .where({from : args.address})
      .orWhere({to: args.address})
      .orderBy('id','desc')
      .offset(BigInt(args.offset))
      .limit(parseFloat(args.limit));
      
      return {transactions: transactions, count: count};
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
  transactionsByAddress
};
