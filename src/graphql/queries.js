const {
  GraphQLString,
  GraphQLList
} = require("graphql");

// import types
const { blocksType } = require("./types/blocks");
const { blocksWithCountType } = require("./types/blocksWithCount");
const { transactionsType } = require("./types/transactions");
const { transactionsWithCountType } = require("./types/transactionsWithCount");
const { unconfirmedAndBallotedBlockType } = require("./types/unconfirmedAndBallotedBlock");
const { transactionHistoryType } = require("./types/transactionHistory");

const DB = require("../db");
// import Models
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");
var unconfirmedAndBallotedBlockModel= require("../db/models/unconfirmedAndBallotedBlock.model");
var unconfirmedTransactionsQueueModel= require("../db/models/unconfirmedTransactionsQueue.model");
var ballotedTransactionsQueueModel= require("../db/models/ballotedTransactionsQueue.model");

const blocks = {
  type: blocksWithCountType,
  description: "Latest blocks and view all blocks",
  args: {
    lastId: { type: GraphQLString },
    limit: { type: GraphQLString },
  },
  async resolve(parent, args, context) {
    try {

      // count total blocks
      let arr = await DB(BlockModel.table).count('* as total');
      let count = arr[0].total.toString();

      let db_last_id = BigInt(count - args.lastId);

      //Keyset pagination for blocks data
      let blocks = await DB(BlockModel.table)
      .where('id' ,'<=', db_last_id)
      .orderBy('id','desc')
      .limit(parseFloat(args.limit));

      return {blocks: blocks, count: count};
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

const unconfirmedAndBallotedBlock = {
  type: new GraphQLList(unconfirmedAndBallotedBlockType),
  description: "View Unconfirmed and Balloted cuurent socket data",
  async resolve(parent, context) {
    try {
      let unconfirmedAndBallotedBlock = await DB(unconfirmedAndBallotedBlockModel.table);
      let block = [
        {type:"Unconfirmed",
          blockNumber : unconfirmedAndBallotedBlock[0].unconfirmed_blocknumber,
          totalTransactions: unconfirmedAndBallotedBlock[0].unconfirmed_total_transactions},
        {type:"Balloted",
          blockNumber : unconfirmedAndBallotedBlock[0].balloted_blocknumber,
          totalTransactions: unconfirmedAndBallotedBlock[0].balloted_total_transactions}
      ];
      return block;
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transactions = {
  type: transactionsWithCountType,
  description: "Latest transactions and view all transactions",
  args: {
    lastId: { type: GraphQLString },
    limit: { type: GraphQLString },
  },
  async resolve(parent, args, context) {
    try {

      // count total transactions
      let arr = await DB(TransactionModel.table).count('* as total');
      let count = arr[0].total.toString();

      let db_last_id = BigInt(count - args.lastId);

      //Keyset pagination for transactions data
      let transactions = await DB(TransactionModel.table)
      .where('id' ,'<=', db_last_id)
      .orderBy('id','desc')
      .limit(parseFloat(args.limit));
      
      return {transactions: transactions, count: count};
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transactionsByStatus = {
  type: new GraphQLList(transactionsType),
  description: "Unconfirmed Or Balloted Or Confirmed transactions according to status",
  args: {
    status: { type: GraphQLString }
  },
  async resolve(parent, args, context) {
    try {

      let transactions = await DB(TransactionModel.table)
      .where({transaction_Status : args.status})
      .orderBy('id','desc');

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

const allTransactions = {
  type: transactionsWithCountType,
  description: "View all transactions",
  async resolve(parent, args, context) {
    try {

      // count total transactions
      let arr = await DB(TransactionModel.table).count('* as total');
      let count = arr[0].total.toString();

      let transactions = await DB(TransactionModel.table).orderBy('id','desc');
      
      return {transactions: transactions, count: count};
    } catch (error) {
      throw new Error(error);
    }
  },
};

const transactionHistory = {
  type: transactionHistoryType,
  description: "View a transaction's history",
  args: {
    hash: { type: GraphQLString }
  },
  async resolve(parent, args, context) {
    try {
      let unconfirmedTransactionHistory = await DB(unconfirmedTransactionsQueueModel.table).where({hash: args.hash});

      let ballotedTransactionHistorys = await DB(ballotedTransactionsQueueModel.table)
      .orderBy('timestamp','asc');

      let ballotedTransactionHistory = null;
      for (var i=0; i<ballotedTransactionHistorys.length;i++)
      {
        let ballotedData = JSON.parse(ballotedTransactionHistorys[i].data);
        if(ballotedData.ballotHashes.includes(args.hash))
        {
          ballotedTransactionHistory=ballotedTransactionHistorys[i];
          break;
        }
      }

      let confirmedTransactionHistory = await DB(TransactionModel.table).where({hash: args.hash});

      return {unconfirmedTransactionHistory:unconfirmedTransactionHistory[0],
        ballotedTransactionHistory:ballotedTransactionHistory,
        confirmedTransactionHistory:confirmedTransactionHistory[0]
      };
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
  transactionsByStatus,
  unconfirmedAndBallotedBlock,
  allTransactions,
  transactionHistory
};
