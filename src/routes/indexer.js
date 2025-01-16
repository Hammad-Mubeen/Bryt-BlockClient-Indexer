//for all env variables imports
require("dotenv").config();
var express = require('express');
var router = express.Router();
const DB = require("../db");
const BlockchainClient = require("bryt-sdk");
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");
var AlertModel= require("../db/models/alert.model");

console.log("=========== Connecting with RPCs ===========\n");

let rpcs = [], current_rpc = null, wait_to_be_mined = null, total_no_of_retries = null;

let JSON_RPC_NODE_URLs = [
'http://3.16.190.75:8010/rpc',
'http://3.16.190.75:8020/rpc',
'http://3.16.190.75:8030/rpc',
'http://3.16.190.75:8040/rpc'
];

async function makeRPCSClients()
{
  for (var i=0; i < JSON_RPC_NODE_URLs.length; i++)
  {
    rpcs[i] = new BlockchainClient(JSON_RPC_NODE_URLs[i],process.env.PRIVATE_KEY);
  }
  current_rpc = rpcs[0];
}

async function findMaxDuplicateElement(arr) {
  const frequency = {};

  // Count the frequency of each element
  arr.forEach(element => {
      frequency[element] = (frequency[element] || 0) + 1;
  });

  // Find the element with the maximum frequency
  let maxCount = 0;
  let maxElement = null;
  let array = [];
  for (const [element, count] of Object.entries(frequency)) {
      if (count > maxCount) {
          maxCount = count;
          maxElement = element;
      }
      let obj = {"element" : element, "count" : count};
      array.push(obj);
  }

  return { array: array, element: maxElement, count: maxCount };
}

async function setWaitToBeMinedAndRetries(blockNumber)
{
  let height = await fetchLatestBlockHeightHelper();
  let start = height - 5;
  if (blockNumber >= start && blockNumber <= height)
  {
    console.log("BlockClient is between 5 blocks less than latest block range...");
    wait_to_be_mined = process.env.WAIT_TO_BE_MINED,
    total_no_of_retries = process.env.TOTAL_NO_OF_RETRIES;
  }
  else{
    console.log("BlockClient is 5 blocks behind the latest block...");
    wait_to_be_mined=0; 
    total_no_of_retries=0;
  }
}

const sleep = (num) => {
  return new Promise((resolve) => setTimeout(resolve, num));
};

// to get the latest block height
async function getLatestBlockHeight(retry) {
  try {
    let flag = 0;
    let latestBlockInfoResult = null;
    current_rpc.getBlockHeight()
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
      await sleep(wait_to_be_mined);
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
      current_rpc.getBlockByBLockNumber(height)
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
        await sleep(wait_to_be_mined);
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
        let totalRetries = total_no_of_retries;
        while (blockResult == false) {
          console.log("totalRetries: ",totalRetries);
          if(totalRetries == 0)
          {
            return false;
          }
          retry.rpcFailed = false;
          console.log("Retrying the RPC Call for block: ", blockNumber);
          blockResult = await getBlockData(blockNumber, retry);
          totalRetries = totalRetries - 1;
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
      current_rpc.getTransactionByHash(hash)
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
        await sleep(wait_to_be_mined);
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

// This function is to get correct block
async function getCorrectBlock(blockNumber) {
  try {
    let results=[], results_without_false=[], results_with_all_data=[];
    for (var i = 0; i < rpcs.length; i++)
    {
      current_rpc = rpcs[i];
      console.log("RPC: ",JSON_RPC_NODE_URLs[i]);
      let result = await fetchBlockDataHelper(blockNumber.toString());
      if(result == false)
      {
        results[i]= result;
        results_with_all_data[i] = result;
      }
      else{
        results[i]=result.result.block_hash;
        results_with_all_data[i]= result;
      }
      console.log("block data: ",result);
    }

    // check if block data is not found on any RPC
    let result = !results.some(e => e);
    if (result == true)
    {
      console.log("block data is not found on any RPC: ",blockNumber);
      console.log("Saving in db.");
      // saves in db and return false
      await DB(AlertModel.table)
      .insert({
        block_number: blockNumber.toString()
      })
      .returning("*");
      return false;
    }
    else
    {
      results_without_false= results.filter(element => element !== false);

      // if only one block data is found, set that rpc and return data
      if(results_without_false.length == 1)
      {
        console.log("One block data is found, setting that rpc and returning data.");
        console.log("block data is correct for blocknumber: ",blockNumber);
        let index = results.indexOf(results_without_false[0]);
        current_rpc = rpcs[index];
        return results_with_all_data[index];
      }
      
      //find most found block, set that rpc and return data, if every block occurence is 1 saves in db and return false
      const maxDuplicateElement = await findMaxDuplicateElement(results_without_false);
      let count=0;
      for (var i = 0; i < maxDuplicateElement.array.length; i++)
      {
        if(maxDuplicateElement.count == maxDuplicateElement.array[i].count)
        {
          count++;
        }
      }
      if(maxDuplicateElement.count == 1 || count > 1)
      {
        console.log("block data is not correct, either all different block hashes on ports OR no highest occurance of one block hash: ",blockNumber);
        console.log("Saving in db.");
        // saves in db and return false
        await DB(AlertModel.table)
        .insert({
          block_number: blockNumber.toString()
        })
        .returning("*");

        // doing for demo 
        for (var i = 0; i < results.length; i++)
        {
          if (results[i]!=false)
          {
            if(results_with_all_data[i].result.transactions != null)
            {
              current_rpc = rpcs[i];
              return results_with_all_data[i];
            }
          }
        }
        let index = results.indexOf(results_without_false[0]);
        current_rpc = rpcs[index];
        return results_with_all_data[index];
        //return false;
      }
      else{
          console.log("block data is correct, either all block hashes are same on ports OR a highest occurance of one block hash: ",blockNumber);
          // doing for demo 
          for (var i = 0; i < results.length; i++)
          {
            if (results[i]!=false)
            {
              if(results_with_all_data[i].result.transactions != null)
              {
                current_rpc = rpcs[i];
                return results_with_all_data[i];
              }
            }
          }
          let index = results.indexOf(maxDuplicateElement.element);
          current_rpc = rpcs[index];
          return results_with_all_data[index];
      }
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
    await makeRPCSClients();

    // getting latest block height
    const blockHeight = await fetchLatestBlockHeightHelper();
    let blockNumber = blockHeight;
    console.log("Latest Block Height is: ", blockNumber);

    while (true)
    {
      let blocks = await DB(BlockModel.table).where({ block_number : blockNumber.toString() });
      console.log(" block number " + blockNumber + " db record: " + blocks[0]);
     
      if(blocks.length == 0)
      {
        await setWaitToBeMinedAndRetries(blockNumber);
        let blockData = await getCorrectBlock(blockNumber);
        if (blockData == false)
        {
          console.log("RPCs have block's data issue ...");
        }
        else
        {
          await DB(BlockModel.table)
          .insert({
            version: blockData.result.version.toString(),
            merkle_root: blockData.result.version,
            block_number: blockNumber.toString(),
            previous_hash: blockData.result.previous_hash,
            state_root: blockData.result.state_root,
            transaction_root : blockData.result.transaction_root,
            reciept_root: blockData.result.reciept_root,
            //timestamp: blockData.result.timestamp.toString(),
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
              let transaction = await DB(TransactionModel.table).where({ hash :  blockData.result.transactions[i]});
              console.log(" transaction "+blockData.result.transactions[i]+" db record: " + transaction[0]);

              if(transaction.length == 0)
              {
                const transactionData = await fetchTransactionDataByHashHelper(blockData.result.transactions[i]);
                console.log("transactionData: ",transactionData);
    
                let transactionModelData = await DB(TransactionModel.table);
                await DB(TransactionModel.table)
                .insert({
                  order:  transactionModelData ? (transactionModelData.length + 1).toString() : (1).toString(),
                  hash: transactionData.result.transaction.TransferObj.hash,
                  block : blockNumber.toString(),
                  from: transactionData.result.transaction.TransferObj.from,
                  to: transactionData.result.transaction.TransferObj.to,
                  value: transactionData.result.transaction.TransferObj.value.toString(),
                  //transaction_time: transactionData.result.transaction.transaction_time,
                  transaction_status: transactionData.result.transaction.transaction_status,
                  functionType: transactionData.result.transaction.type,
                  //unix_timestamp: transactionData.result.transaction.unix_timestamp.toString(),
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
              else{
                console.log("Duplicate transaction, skipping it ...  ", blockData.result.transactions[i]);
              }
            }
          }
        }
        //await sleep(wait_to_be_mined);
      }
      else{
        console.log("Duplicate block, skipping it ...  ", blockNumber);
      }
      blockNumber = blockNumber + 1;
    }
  }catch(error){
    console.log("error : ", error);
  }
}

//Indexer();

module.exports = router;
