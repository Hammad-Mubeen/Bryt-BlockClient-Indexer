//for all env variables imports
require("dotenv").config();
var express = require('express');
var router = express.Router();
const DB = require("../db");
const BlockchainClient = require("bryt-sdk");
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");

console.log("=========== Connecting with RPC ===========\n");

const rpc = new BlockchainClient(process.env.JSON_RPC_NODE_URL,process.env.PRIVATE_KEY);

const sleep = (num) => {
  return new Promise((resolve) => setTimeout(resolve, num));
};

// to get the latest block height
async function getLatestBlockHeight(retry) {
  try {
    let flag = 0;
    let latestBlockInfoResult = null;
    rpc.getBlockHeight()
      .then(function (blockData) {
        if(blockData.result)
        {
          latestBlockInfoResult = blockData.result.height;
          flag = 1;
        }
        else if (blockData.error)
        {
          console.log("RPC failed: in fecthing latest block Height.");
          console.log("error is : ", blockData.error.message);
          retry.rpcFailed = true;
        }
      })
      .catch(function (error) {
        console.log("RPC failed: in fecthing latest block Height.");
        console.log("error is : ", error);
        retry.rpcFailed = true;
      });

    while (
      flag == 0 &&
      retry.rpcFailed == false
    ) {
      console.log("Checking for RPC response Type...");
      await sleep(500);
    }

    if (flag == 1) {
      return latestBlockInfoResult;
    } else if (retry.rpcFailed == true) {
      await sleep(process.env.WAIT_FOR_BLOCK_TO_MINE);
      return false;
    }
  } catch (error) {
    console.log("error is : ", error);
  }
}

// This function is to retry latest block height upon RPC Failures
async function fetchLatestBlockHeightHelper() {
  try {
    let retry = {
      rpcFailed: false,
    };
    let blockResult = await getLatestBlockHeight(retry);

    if (blockResult == false) {
      if (retry.rpcFailed == true) {
        while (blockResult == false) {
          retry.rpcFailed = false;
          console.log("Retrying the RPC Call for latest block height...");
          blockResult = await getLatestBlockHeight(retry);
        }
        console.log(
          "Retrying Attempts to fetch latest block height is Successfull..."
        );
        return blockResult;
      }
    } else {
      return blockResult;
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

// to get block data against block height
async function getBlockData(height, retry) {
  try {
      console.log("Fetching block : \n", height);
      
      let flag = 0;
      let blockResponse = null;
      rpc.getBlockByBLockNumber(height)
        .then(function (blockData) {
          if(blockData.result)
          {
            blockResponse = blockData;
            flag = 1;
          }
          else if (blockData.error)
          {
            console.log("RPC failed: in fecthing blockData " + height);
            console.log("error is : ", blockData.error.message);
            retry.rpcFailed = true;
          }
        })
        .catch(function (error) {
          console.log("RPC failed: in fecthing blockData " + height);
          console.log("error is : ", error);
          retry.rpcFailed = true;
        });
        
      while (
        flag == 0 &&
        retry.rpcFailed == false
      ) {
        console.log("Checking for RPC response Type...");
        await sleep(500);
      }

      if (flag == 1) {
        return blockResponse;
      } else if (retry.rpcFailed == true) {
        await sleep(process.env.WAIT_FOR_BLOCK_TO_MINE);
        return false;
      }
  } catch (error) {
    console.log("error : ", error);
  }
}

// This function is to retry blockData upon RPC Failures
async function fetchBlockDataHelper(blockNumber) {
  try {
    let retry = {
      rpcFailed: false,
    };
    let blockResult = await getBlockData(blockNumber, retry);
    
    if (blockResult == false) {
      if (retry.rpcFailed == true) {
        while (blockResult == false) {
          retry.rpcFailed = false;
          console.log("Retrying the RPC Call for block: ", blockNumber);
          blockResult = await getBlockData(blockNumber, retry);
        }
        console.log(
          "Retrying Attempts to fetch blockData is Successfull : ",
          blockNumber
        );
        return blockResult;
      }
    } else {
      return blockResult;
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

// to get transaction data against hash
async function getTransactionData(hash, retry) {
  try {
      console.log("Fetching transaction: \n", hash);
      
      let flag = 0;
      let transactionResponse = null;
      rpc.getTransactionByHash(hash)
        .then(function (transactionData) {
          if(transactionData.result)
          {
            transactionResponse = transactionData;
            flag = 1;
          }
          else if (transactionData.error)
          {
            console.log("RPC failed: in fecthing transactionData " + hash);
            console.log("error is : ", transactionData.error.message);
            retry.rpcFailed = true;
          }
        })
        .catch(function (error) {
          console.log("RPC failed: in fecthing transactionData " + hash);
          console.log("error is : ", error);
          retry.rpcFailed = true;
        });
        
      while (
        flag == 0 &&
        retry.rpcFailed == false
      ) {
        console.log("Checking for RPC response Type...");
        await sleep(500);
      }

      if (flag == 1) {
        return transactionResponse;
      } else if (retry.rpcFailed == true) {
        await sleep(process.env.WAIT_FOR_BLOCK_TO_MINE);
        return false;
      }
  } catch (error) {
    console.log("error : ", error);
  }
}

// This function is to retry transactionData upon RPC Failures
async function fetchTransactionDataByHashHelper(hash) {
  try {
    let retry = {
      rpcFailed: false,
    };
    let transactionResult = await getTransactionData(hash, retry);
    
    if (transactionResult == false) {
      if (retry.rpcFailed == true) {
        while (transactionResult == false) {
          retry.rpcFailed = false;
          console.log("Retrying the RPC Call for transaction: ", hash);
          transactionResult = await getTransactionData(hash, retry);
        }
        console.log(
          "Retrying Attempts to fetch transactionData is Successfull : ",
          hash
        );
        return transactionResult;
      }
    } else {
      return transactionResult;
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}


//Indexer main function
//This function looks for every block and its transactions and save it in the db
async function Indexer()
{
  try{
    console.log("Indexer initiated...");

    // getting latest block height
    const blockHeight = await fetchLatestBlockHeightHelper();
    let blockNumber = blockHeight;
    console.log("block height: ", blockNumber);
    blockNumber = 76;

    while (true)
    {
      let blocks = await DB(BlockModel.table).where({ block_number : blockNumber.toString() });
      console.log("blocks: ",blocks[0]);
     
      if(blocks.length == 0)
      {
        const blockData = await fetchBlockDataHelper(blockNumber.toString());
        console.log("blockData: ",blockData);

        await DB(BlockModel.table)
        .insert({
          version: blockData.result.version.toString(),
          merkle_root: blockData.result.version,
          block_number: blockNumber.toString(),
          previous_hash: blockData.result.previous_hash,
          state_root: blockData.result.state_root,
          transaction_root : blockData.result.transaction_root,
          reciept_root: blockData.result.reciept_root,
          timestamp: blockData.result.timestamp.toString(),
          logs_bloom: blockData.result.logs_bloom,
          transactions: blockData.result.transactions,
          block_reward: blockData.result.block_reward,
          value: blockData.result.value,
          data: blockData.result.data,
          to: blockData.result.to,
          block_hash: blockData.result.block_hash
        })
        .returning("*");

        if(blockData.result.transactions != null)
        {
          for (var i =0; i < blockData.result.transactions.length; i++ )
          {
            const transactionData = await fetchTransactionDataByHashHelper(blockData.result.transactions[i]);
            console.log("transactionData: ",transactionData);
            await DB(TransactionModel.table)
            .insert({
              hash: transactionData.result.transaction.TransferObj.hash,
              block : blockNumber.toString(),
              from: transactionData.result.transaction.TransferObj.from,
              to: transactionData.result.transaction.TransferObj.to,
              value: transactionData.result.transaction.TransferObj.value.toString(),
              transaction_time: transactionData.result.transaction.transaction_time,
              transaction_status: transactionData.result.transaction.transaction_status,
              functionType: transactionData.result.transaction.type,
              unix_timestamp: transactionData.result.transaction.unix_timestamp.toString(),
              Status: transactionData.result.transaction.Status,
              State: transactionData.result.transaction.State,
              nonce: transactionData.result.transaction.TransferObj.nonce.toString(),
              type: transactionData.result.transaction.TransferObj.type.toString(),
              node_id: transactionData.result.transaction.TransferObj.node_id,
              gas: transactionData.result.transaction.TransferObj.gas.toString(),
              gas_price: transactionData.result.transaction.TransferObj.gas_price.toString(),
              input: transactionData.result.transaction.TransferObj.input
            })
            .returning("*");
          }
        }
        await sleep(process.env.WAIT_FOR_BLOCK_TO_MINE);
      }
      else{
        console.log("Duplicate block, skipping it...");
      }
      blockNumber = blockNumber + 1;
    }
  }catch(error){
    console.log("error : ", error);
  }
}

//Indexer();

module.exports = router;
