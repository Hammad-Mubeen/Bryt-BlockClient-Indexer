//for all env variables imports
require("dotenv").config();
var express = require('express');
var router = express.Router();
var DB = require("../db");
var BlockchainClient = require("bryt-sdk");
var WebSocket = require('ws');
var serialize = require("serialize-javascript");
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");
var AlertModel= require("../db/models/alert.model");
var FailedTxModel= require("../db/models/failedTx.model");
var replayBlocksModel= require("../db/models/replayBlocks.model");

//Connect to Redis
const {client : redisClient} = require("../../connetRedis");

// Create a pipeline
//let pipeline = redisClient.multi();

console.log("=========== Connecting with RPCs ===========\n");

let rpcs = [], wss = null, current_rpc = null, wait_to_be_mined = null, total_no_of_retries = null,
lastMinorityBlock = null, latestMajorityBlock = null, minority= null, majority = null;

let JSON_RPC_NODE_URLs = process.env.NODE_URLs.split(',');

let RPC_SOCKET_URLs = [
'ws://' + process.env.NODE_URL +':8010/ws/v2',
'ws://' + process.env.NODE_URL +':8020/ws/v2',
'ws://' + process.env.NODE_URL +':8030/ws/v2',
'ws://' + process.env.NODE_URL +':8040/ws/v2',
'ws://' + process.env.NODE_URL +':8050/ws/v2',
] 

//function to deserialize Block Data
function deserialize(serializedJavascript) {
  return eval("(" + serializedJavascript + ")");
}

const sleep = (num) => {
  return new Promise((resolve) => setTimeout(resolve, num));
};

async function createWebSocketServer(server)
{
  wss = new WebSocket.Server({ server });
  wss.on('connection', async(ws) => {
    console.log('A new client connected');
 
    // Handle client disconnection
    ws.on('close', () => {
      console.log('Client disconnected');
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  console.log('WebSocket server running...');
}

async function makeRPCSClients()
{
  for (var i=0; i < JSON_RPC_NODE_URLs.length; i++)
  {
    rpcs[i] = new BlockchainClient(JSON_RPC_NODE_URLs[i],process.env.PRIVATE_KEY);
  }
  current_rpc = rpcs[0];
}

async function setWaitToBeMinedAndRetries(blockNumber)
{
  let height = BigInt(await fetchLatestBlockHeightHelper());
  let start = height - BigInt(5);
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

async function checkIfTransactionsFound(transactions_array,results,results_with_all_data)
{
  for (var i = 0; i < results.length; i++)
  {
    if (results[i]!=false)
    {
      if(results_with_all_data[i].result.transactions != null)
      {
        for (var j = 0; j < results_with_all_data[i].result.transactions.length; j++)
        {
          transactions_array.push(results_with_all_data[i].result.transactions[j]);
        }
      }
    }
  }
  transactions_array = transactions_array.filter((value, index, self) => self.indexOf(value) === index);
  return transactions_array;
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

async function saveFaultyBlockInDb(blockNumber,block_status)
{
  await DB(AlertModel.table)
  .insert({
    block_number: blockNumber.toString(),
    block_status: block_status
  })
  .returning("*");
}

async function changeFaultyBlockStatusInDb(blockNumber,block_status)
{
  await DB(AlertModel.table)
  .where({ block_hash: blockNumber.toString()})
  .update({
    block_status: block_status
  })
  .returning("*");
}

async function insertInBatches(data, batchSize) {
  if(data.length > 1000)
  {
    const chunks = [];
    for (let i = 0; i < data.length; i += batchSize) {
      chunks.push(data.slice(i, i + batchSize));
    }
    for (const chunk of chunks) {
      await DB(TransactionModel.table).insert(chunk).onConflict('hash').ignore();
    }
  }
  else{
    await DB(TransactionModel.table).insert(data).onConflict('hash').ignore();
  }
}

function generateTransactions(count) {
  const txs = [];
  for (let i = 0; i < count; i++) {
    txs.push({
      transaction_Status: "Confirmed",
      hash: i + "0x000383d26065046e1226d23233e7feae298b88264617e750eabf1727991805c8",
      block : "1",
      from: "0x262B4E4f89302b38Bb53fEfC0193652F56e62a69",
      to: "0x262B4E4f89302b38Bb53fEfC0193652F56e62a69",
      value: "940000000000000",
      transaction_status: false,
      functionType: "Mint",
      Status: false,
      State: false,
      nonce: i,
      type: "0",
      node_id: "2f60583a-7d44-4a55-5164-258fcb4b8608",
      gas: "21000",
      gas_price: "5000000000",
      input: "null"
    });
  }
  return txs;
}

async function testBatchInsert(length,chunk) {
  const txs = generateTransactions(length);
  try {
    console.log('Batch insertion started.');
    await insertInBatches(txs, chunk);
    console.log('All txs inserted successfully.');
  } catch (err) {
    console.error('Error inserting txs:', err);
  }
}

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
async function getBlockData(height, retry, current_rpc) {
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
async function fetchBlockDataHelper(blockNumber,current_rpc) {
  try {
    let retry = {
      rpcFailed: false,
    };
    let blockResult = await getBlockData(blockNumber, retry, current_rpc);
    
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
          blockResult = await getBlockData(blockNumber, retry, current_rpc);
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
        let  i = 0;
        while (transactionResult == false) {
          current_rpc = rpcs[i]
          retry.rpcFailed = false;
          console.log("Retrying the RPC Call for transaction: ", hash);
          transactionResult = await getTransactionData(hash, retry);
          i = i + 1;
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

async function syncData()
{
  if(minority == null || majority == null || minority == false || majority == false)
  {
    console.log("No need to sync the data.");
  }
  else{
    // start syncing data
    minority = false;
    let last_minority_block = lastMinorityBlock, latest_majority_block = latestMajorityBlock;
    let  alertData = await DB(AlertModel.table);
    for (var i =0; i < alertData.length; i++ )
    {
      let alertBlockNumber = BigInt(alertData[i].block_number);
      console.log("syncing block Number: ",alertBlockNumber);
      if(alertBlockNumber >= last_minority_block && alertBlockNumber < latest_majority_block)
      {
        let sync_results=[], sync_results_with_all_data=[];
        for (var j = 0; j < rpcs.length; j++)
        {
          console.log("RPC: ",JSON_RPC_NODE_URLs[j]);
          let result = await fetchBlockDataHelper(alertBlockNumber.toString(),rpcs[j]);
          if(result == false)
          {
            console.log("Either port is stuck or down: ", JSON_RPC_NODE_URLs[j]);
            sync_results_with_all_data=[];
            break;
          }
          sync_results[j] = result.result.block_hash;
          sync_results_with_all_data[j] = result;
          console.log("block data: ",result);
        }
        if(sync_results_with_all_data.length !=0)
        {
          const maxDuplicateElement = await findMaxDuplicateElement(sync_results);
          // if data is correct
          if(maxDuplicateElement.count > 1)
          {
            console.log("correct block data found in syncing: ",alertBlockNumber);
            let index = sync_results.indexOf(maxDuplicateElement.element);
            await DB(BlockModel.table)
            .where({ block_number: alertBlockNumber.toString() })
            .update({
              version: sync_results_with_all_data[index].result.version.toString(),
              merkle_root: sync_results_with_all_data[index].result.version,
              block_status: "Finalized",
              previous_hash: sync_results_with_all_data[index].result.previous_hash,
              state_root: sync_results_with_all_data[index].result.state_root,
              transaction_root : sync_results_with_all_data[index].result.transaction_root,
              reciept_root: sync_results_with_all_data[index].result.reciept_root,
              //timestamp: sync_results_with_all_data[index].result.timestamp.toString(),
              logs_bloom: sync_results_with_all_data[index].result.logs_bloom,
              transactions: sync_results_with_all_data[index].result.transactions,
              block_reward: sync_results_with_all_data[index].result.block_reward,
              value: sync_results_with_all_data[index].result.value,
              data: sync_results_with_all_data[index].result.data,
              to: sync_results_with_all_data[index].result.to,
              block_hash: sync_results_with_all_data[index].result.block_hash
            })
            .returning("*");
            if(sync_results_with_all_data[index].result.transactions != null)
            {
              for (var k =0; k < sync_results_with_all_data[index].result.transactions.length; k++ )
              {
                await DB(TransactionModel.table)
                .where({ hash: sync_results_with_all_data[index].result.transactions[k]})
                .update({
                  block : alertBlockNumber.toString(),
                })
                .returning("*");
              }
            }
            console.log("changing block status in alert table.");
            await changeFaultyBlockStatusInDb(alertBlockNumber,"Finalized");
          }
          else{
            console.log("Majority data not found in syncing for block number: ",alertBlockNumber);
          }
        }
      }
      if(alertBlockNumber == latestMajorityBlock)
      {
        let block = await DB(BlockModel.table).where({ block_number: alertBlockNumber.toString() });
        if(block.result.transactions != null)
        {
          for (var j =0; j < block.result.transactions.length; j++ )
          {
            await DB(TransactionModel.table)
            .where({ hash: block.result.transactions[j]})
            .update({
              block : alertBlockNumber.toString(),
            })
            .returning("*");
          }
        }
      }
    }
  }
}

// This function is to get correct block
async function getCorrectBlock(blockNumber) {
  try {
    let results=[], results_without_false=[], results_with_all_data=[], index, block_status;
    //read all RPCS for blocks
    for (var i = 0; i < rpcs.length; i++)
    {
      current_rpc = rpcs[i];
      console.log("RPC: ",JSON_RPC_NODE_URLs[i]);
      let result = await fetchBlockDataHelper(blockNumber.toString(),current_rpc);
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

    // return false after saving faulty block number
    let result = !results.some(e => e);
    if (result == true)
    {
      block_status= "not found";
      console.log("block data not found on any RPC: ",blockNumber);
      await saveFaultyBlockInDb(blockNumber,block_status);
      console.log("Saved faulty block in db.");
      return {blockData: false, block_status: block_status};
    }
    else
    {
      // if only 1 port have a block data
      results_without_false= results.filter(element => element !== false);
      if(results_without_false.length == 1)
      {
        console.log("One block data is found, setting that rpc and returning data.");
        console.log("block data is correct for blocknumber: ",blockNumber);
        index = results.indexOf(results_without_false[0]);
        block_status="Finalized";
      }
      else{
        //check highest block hash occurance
        const maxDuplicateElement = await findMaxDuplicateElement(results_without_false);
        let count=0;
        for (var i = 0; i < maxDuplicateElement.array.length; i++)
        {
          if(maxDuplicateElement.count == maxDuplicateElement.array[i].count)
          {
            count++;
          }
        }
        
        //check on which ports transactions found
        let transactions_array=[];
        transactions_array = await checkIfTransactionsFound(transactions_array,results,results_with_all_data);
        if(transactions_array.length != 0){
          index = results.indexOf(results_without_false[0]);
          results_with_all_data[index].result.transactions = transactions_array;
        }
  
        //if data is not correct
        if(maxDuplicateElement.count == 1 || count > 1)
        {  
          block_status="Mined";
          console.log("block data is not correct, either all different block hashes on ports OR no highest occurance of one block hash: ",blockNumber);
          await saveFaultyBlockInDb(blockNumber,block_status);
          console.log("Saved faulty block in db.");
          //if no transactions found
          if(transactions_array.length == 0)
          {
            index = results.indexOf(results_without_false[0]);
          }
          // minority = true;
          // if(majority == true || majority == null)
          // {
          //   lastMinorityBlock = blockNumber;
          // }
          // majority = false;
        }
        else{
          console.log("block data is correct, either all block hashes are same on ports OR a highest occurance of one block hash: ",blockNumber);
          //if no transactions found
          if(transactions_array.length == 0)
          {
            index = results.indexOf(maxDuplicateElement.element);
          }
          block_status="Finalized";

          //majority = true;
          //latestMajorityBlock = blockNumber;
          //syncData();
        }
      }
      current_rpc = rpcs[index];
      return {blockData: results_with_all_data[index], block_status:block_status};
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

async function listenToRPCSockets(RPCSocketURL)
{
  // start listening
  // Create a WebSocket connection
  const socket = new WebSocket(RPCSocketURL);

  // Connection opened event
  socket.addEventListener('open', () => {
      console.log('Connected to RPC WebSocket: ',RPCSocketURL);
  });

  // Message event: handle messages from the server
  socket.addEventListener('message', async (event) => {
      const parsedMessage = JSON.parse(event.data);
      if(parsedMessage.type == "mempool_transaction")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("mempool_transaction: ",parsedMessage.data);
        redisClient.RPUSH(
          process.env.MEMPOOL_REDIS_QUEUE,
          serialize({ obj: {
            hash: parsedMessage.data.TransferObj.hash,
            data: parsedMessage.data
          }})
        );
      }
      else if(parsedMessage.type == "transaction_ballot")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("transaction_ballot: ",parsedMessage.data);
        if (parsedMessage.data.hashes.length != 0)
        {
          redisClient.RPUSH(
            process.env.BALLOT_REDIS_QUEUE,
            serialize({ obj: {
              hash: parsedMessage.data.hashesHex,
              data: parsedMessage.data
            }})
          );
        }
      }
      else if(parsedMessage.type == "finalized_block")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("finalized_block: ",parsedMessage.data);
        redisClient.RPUSH(
          process.env.BLOCK_REDIS_QUEUE,
          serialize({ obj: {
            hash: parsedMessage.data.block.block_hash,
            data: parsedMessage.data.block
          }})
        );
        if(parsedMessage.data.transactions_array != null)
        {
          redisClient.RPUSH(
            process.env.TRANSACTION_REDIS_QUEUE,
            serialize({ obj: {
              block_number: parsedMessage.data.block.block_number,
              data: parsedMessage.data.transactions_array
            }})
          );
        }
      }
  });

  // Handle errors
  socket.addEventListener('error', (error) => {
      console.log('RPC WebSocket error: ',RPCSocketURL, ' :',error);
  });

  // Close event: handle when the connection is closed
  socket.addEventListener('close', () => {
      console.log('WebSocket connection closed: ', RPCSocketURL);
      // Attempt to reconnect after a delay when the connection is closed
      console.log("Attempt to reconnect after a delay when the connection is closed...");
      setTimeout(() =>listenToRPCSockets(RPCSocketURL), 5000); // Reconnect after 5 seconds
  });
}

async function listener()
{
  try
  {
    //listen for unconfirmed transactions and balloted block
    for (var j = 0; j < RPC_SOCKET_URLs.length; j++)
    {
      await listenToRPCSockets(RPC_SOCKET_URLs[j]);
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

async function handleUnconfirmedTransactions(queue)
{
  try
  {
    let transactionMessage = {};
    while(true)
    {
      let redisLength = await redisClient.LLEN(queue);
      if (redisLength > 0) {
        let headValue = await redisClient.LINDEX(queue, 0);
        let deserializedValue = deserialize(headValue).obj;
        if (await redisClient.SISMEMBER('seen_set_mempool', deserializedValue.hash))
        {
          console.log("Mempool Tx read from queue's head is duplicated, poping it... ", deserializedValue.hash);
          await redisClient.LPOP(queue);
        }   
        else
        {
          console.log("Mempool Tx read from queue's head is unique, processing it... ", deserializedValue.hash);

          transactionMessage = {
            topic: "unconfirmed-transactions",
            message: deserializedValue.data
          };

          //broad cast transactionMessage
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(transactionMessage));
            }
          });

          redisClient.RPUSH(
            process.env.FAILURE_CHECKUP_MEMPOOL_REDIS_QUEUE,
            deserializedValue.hash
          );

          await redisClient.SADD('seen_set_mempool', deserializedValue.hash);
          await redisClient.LPOP(queue);
        }
      } else {
        console.log("There are currently no Txs in the Mempool Redis queue...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('handleUnconfirmedTransactions function closed: ',error);
    console.log("Attempt to recall handleUnconfirmedTransactions function after a delay ...");
    setTimeout(() => handleUnconfirmedTransactions(queue), 2000);
  }
}

async function handleBallotedTransactions(queue)
{
  try
  {
    let transactionMessage = {};
    while(true)
    {
      let redisLength = await redisClient.LLEN(queue);
      if (redisLength > 0) {
        let headValue = await redisClient.LINDEX(queue, 0);
        let deserializedValue = deserialize(headValue).obj;
        let ballot = deserializedValue.data;

        for (var i=0; i< ballot.hashes.length; i++)
        {
          if (await redisClient.SISMEMBER('seen_set_ballot', ballot.hashes[i]))
          {
            console.log("Ballot tx hash read is duplicated...", ballot.hashes[i]);
          }   
          else
          {
            console.log("Ballot tx hash is unique, processing it... ", ballot.hashes[i]);
            transactionMessage = {
              topic: "balloted-transactions",
              message: {blockNumber: ballot.epochCycle, hash: ballot.hashes[i]}
            };
            
            //broad cast blockMessage
            wss.clients.forEach(function each(client) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(transactionMessage));
              }
            });
            await redisClient.SADD('seen_set_ballot', ballot.hashes[i]);
          } 
        }
        await redisClient.LPOP(queue);
      } else {
        console.log("There are currently no Txs in the Ballot Redis queue...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('handleBallotedTransactions function closed: ',error);
    console.log("Attempt to recall handleBallotedTransactions function after a delay ...");
    setTimeout(() => handleBallotedTransactions(queue), 2000);
  }
}

async function handleBlocks(queue)
{
  try
  {
    while(true)
    { 
      let redisLength = await redisClient.LLEN(queue);
      if (redisLength > 0) {
        let headValue = await redisClient.LINDEX(queue, 0);
        let deserializedValue = deserialize(headValue).obj;
        if (await redisClient.SISMEMBER('seen_set_block', deserializedValue.hash))
        {
          console.log("Block read from queue's head is duplicated, poping it... ", deserializedValue.hash);
          await redisClient.LPOP(queue);
        }   
        else
        {
          console.log("Block read from queue's head is unique, processing it... ", deserializedValue.hash);

          let blockData = deserializedValue.data;
          let blocks = await DB(BlockModel.table).where({ block_number : (blockData.block_number).toString() });
          console.log(" block number " + blockData.block_number + " db record: " + blocks[0]);
          
          if(blocks.length == 0)
          {
            console.log("New block");
            await DB(BlockModel.table)
            .insert({
              id: blockData.block_number,
              version: blockData.version.toString(),
              merkle_root: blockData.version,
              block_number: blockData.block_number,
              block_status: "Mined",
              previous_hash: blockData.previous_hash,
              state_root: blockData.state_root,
              transaction_root : blockData.transaction_root,
              reciept_root: blockData.reciept_root,
              logs_bloom: blockData.logs_bloom,
              transactions: blockData.transactions,
              block_reward: blockData.block_reward,
              value: blockData.value,
              data: blockData.data,
              to: blockData.to,
              block_hash: blockData.block_hash
            });
          }
          else{
            if(blockData.transactions.length != 0)
            {
              console.log("block on a block number with transactions");
              let transactions= blocks[0].transactions;
              if(transactions.length == 0)
              {
                await DB(BlockModel.table)
                .where({ block_number : (blockData.block_number).toString() })
                .update({transactions: blockData.transactions});
              }
              else{
                for (var i=0; i<blockData.transactions.length;i++)
                {
                  if(!transactions.includes(blockData.transactions[i]))
                  {
                    transactions.push(blockData.transactions[i]);
                  }
                }
                await DB(BlockModel.table)
                .where({ block_number : (blockData.block_number).toString() })
                .update({transactions: transactions});
              }
            }
            else{
              console.log("block on a block number with zero tranactions");
            }
          }
          await redisClient.SADD('seen_set_block', deserializedValue.hash);
          await redisClient.LPOP(queue);
        }
      } else {
        console.log("There are currently no blocks in the Block Redis queue...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('handleBlocks function closed: ',error);
    console.log("Attempt to recall handleBlocks function after a delay ...");
    setTimeout(() =>handleBlocks(queue), 2000);
  }
}

async function handleFinalizedTransactions(queue)
{
  try
  {
    let transactionMessage = {};
    while(true)
    { 
      let redisLength = await redisClient.LLEN(queue);
      if (redisLength > 0) {
        let headValue = await redisClient.LINDEX(queue, 0);
        let deserializedValue = deserialize(headValue).obj;
        let transactionsArray = deserializedValue.data;
        let uniqueTxs=[];
        
        for (var i =0; i < transactionsArray.length; i++ )
        {
          let hash = transactionsArray[i].TransferObj.hash;
          if (await redisClient.SISMEMBER('seen_set_transaction', hash))
          {
            console.log("Tx is duplicated: ", hash);
          }
          else{
            console.log("Tx is unique: ", hash);
            let obj = {
              transaction_Status: "Confirmed",
              hash: transactionsArray[i].TransferObj.hash,
              block : (deserializedValue.block_number).toString(),
              from: transactionsArray[i].TransferObj.from,
              to: transactionsArray[i].TransferObj.to,
              value: transactionsArray[i].TransferObj.value.toString(),
              transaction_status: transactionsArray[i].transaction_status,
              functionType: transactionsArray[i].type,
              Status: transactionsArray[i].Status,
              State: transactionsArray[i].State,
              nonce: transactionsArray[i].TransferObj.nonce.toString(),
              type: transactionsArray[i].TransferObj.type.toString(),
              node_id: transactionsArray[i].TransferObj.node_id,
              gas: transactionsArray[i].TransferObj.gas.toString(),
              gas_price: transactionsArray[i].TransferObj.gas_price.toString(),
              input: transactionsArray[i].TransferObj.input
            } 
            uniqueTxs.push(obj);
          } 
        }

        if(uniqueTxs.length != 0)
        {
          //Batch Insert Unique Txs Only
          await insertInBatches(uniqueTxs, 1000);
        }
        
        for (var i =0; i < uniqueTxs.length; i++ )
        {
          transactionMessage = {
            topic: "balloted-transaction-removed",
            message: {hash: uniqueTxs[i].hash}
          };

          //broad cast blockMessage
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(transactionMessage));
            }
          });
          await redisClient.SADD('seen_set_transaction', uniqueTxs[i].hash);
        }
        await redisClient.LPOP(queue);
      } else {
        console.log("There are currently no finalized Txs in the Transaction Redis queue...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('handleFinalizedTransactions function closed: ',error);
    console.log("Attempt to recall handleFinalizedTransactions function after a delay ...");
    setTimeout(() => handleFinalizedTransactions(queue), 2000);
  }
}

async function checkTxsStatuses(values,hashes)
{
  try
  {
    for( var i = 0; i < values.length; i++)
    {
      let hash = values[i];
      if (await redisClient.SISMEMBER('seen_set_ballot', hash) && await redisClient.SISMEMBER('seen_set_transaction', hash))
      {
        let obj = { hash: hash ,mempoolToBalloted: true, ballotedToFinalized: true };
        hashes.push(obj);
      }
    }
  } catch (error) {
    console.log('checkupTxsStatuses function closed: ',error);
  }
}

async function transactionsFailureCheckup(queue)
{
  try
  {
    while(true)
    {
      let redisLength = await redisClient.LLEN(queue);
      if (redisLength > 0) {
        await sleep(8000);
        let totalTxToCheck = process.env.TOTAL_TRANSACTIONS_AFTER_WAITING;
        let values = await redisClient.LRANGE(queue,0,process.env.TOTAL_TRANSACTIONS_AFTER_WAITING);
        if(values.length != totalTxToCheck)
        {
          totalTxToCheck = values.length;
        }
        console.log("Checking Txs Journey Completion: ",values);

        let hashes = [],flag = false;
        let retries = process.env.RETRIES_FOR_BALLOT_AND_FINALIZED;
        //wait for all txs to come in ballot and finalized block
        while(true)
        {
          hashes = [];
          await checkTxsStatuses(values,hashes,retries);
          console.log("Hashes: ", hashes.length);
          if (hashes.length == totalTxToCheck)
          {
            hashes = [];
            flag = true;
            break;
          }
          retries = retries - 1;
          if(retries == 0)
          {
            hashes = [];
            flag = false;
            break;
          }
          await sleep(8000);
        }
        console.log("flag: ",flag);
        //finding txs whose journey not completed
        if(flag == false)
        {
          for( var i = 0; i < values.length; i++)
          {
            let hash = values[i];
            let obj = { hash: hash ,mempoolToBalloted: false, ballotedToFinalized: false };
            if (!await redisClient.SISMEMBER('seen_set_ballot', hash))
            {
              obj.mempoolToBalloted = false;
            }

            if (!await redisClient.SISMEMBER('seen_set_transaction', hash))
            {
              obj.ballotedToFinalized = false;
            }

            if (obj.mempoolToBalloted == false || obj.ballotedToFinalized == false)
            {
              hashes.push(obj);
            }
          }
        }
        
        //batch inserting txs whose journey not completed
        if(hashes.length != 0)
        {
          await DB(FailedTxModel.table).insert(hashes).onConflict('hash').ignore();
          console.log("Not completed journey Txs batch insert successfully...");
        }

        // for (let i = 0; i < totalTxToCheck; i++) {
        //   pipeline.LPOP(queue);
        // }

        //await pipeline.exec();
      } else {
        console.log("There are currently no Txs in the Failure Checkup Mempool Redis queue...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('transactionsFailureCheckup function closed: ',error);
    console.log("Attempt to recall transactionsFailureCheckup function after a delay ...");
    setTimeout(() => transactionsFailureCheckup(queue), 2000);
  }
}

async function replayBlocks()
{
  try{
    let replayBlock = await DB(replayBlocksModel.table);
    if(replayBlock[0].replayBlocks == true)
    {
      let last = BigInt(replayBlock[0].lastBlock), lastBlockNumber= BigInt(replayBlock[0].lastBlock);
      console.log("Last Block Height is: ", lastBlockNumber);

      console.log("replay Blocks initiated...");
      await makeRPCSClients();

      // getting latest block Number
      const blockHeight = BigInt(await fetchLatestBlockHeightHelper());
      let blockNumber = (blockHeight);
      console.log("Latest Block Height is: ", blockNumber);

      await DB(replayBlocksModel.table)
      .where({id: replayBlock[0].id})
      .update({Status: "Progress"});

      while (true)
      {
        let blocks = await DB(BlockModel.table).where({ block_number : lastBlockNumber.toString() });
        console.log(" block number " + lastBlockNumber + " db record: " + blocks[0]);
      
        if(blocks.length == 0)
        {
          await setWaitToBeMinedAndRetries(lastBlockNumber);
          let {blockData,block_status} = await getCorrectBlock(lastBlockNumber);
          if (blockData == false)
          {
            console.log("RPCs have block's data issue at blockNumber: ",lastBlockNumber);
          }
          else
          {
            await DB(BlockModel.table)
            .insert({
              id: lastBlockNumber.toString(),
              version: blockData.result.version.toString(),
              merkle_root: blockData.result.version,
              block_number: lastBlockNumber.toString(),
              block_status: block_status,
              previous_hash: blockData.result.previous_hash,
              state_root: blockData.result.state_root,
              transaction_root : blockData.result.transaction_root,
              reciept_root: blockData.result.reciept_root,
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

                  let arr = await DB(TransactionModel.table).count('* as total');
                  let count = BigInt(arr[0].total.toString());

                  await DB(TransactionModel.table)
                  .insert({
                    id: count + BigInt(1),
                    transaction_Status: "Confirmed",
                    hash: transactionData.result.transaction.TransferObj.hash,
                    block : lastBlockNumber.toString(),
                    from: transactionData.result.transaction.TransferObj.from,
                    to: transactionData.result.transaction.TransferObj.to,
                    value: transactionData.result.transaction.TransferObj.value.toString(),
                    transaction_status: transactionData.result.transaction.transaction_status,
                    functionType: transactionData.result.transaction.type,
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
                  console.log("Duplicate Transaction, skipping it...  ", blockData.result.transactions[i]);
                }
              }
            }
          }
        }
        else{
          console.log("Duplicate block, skipping it ...  ", lastBlockNumber);
        }
        lastBlockNumber = lastBlockNumber + BigInt(1);
        if(lastBlockNumber > blockNumber)
        {
          break;
        }
      }
      console.log("replay blocks successfull from lastBlock " + last + " to block height " + blockNumber + "...");
      await DB(replayBlocksModel.table)
      .where({id: replayBlock[0].id})
      .update({
        replayBlocks: false,
        lastBlock: (last).toString(),
        latestBlock: (blockNumber).toString(),
        Status: "Completed"
      });
    }
    else{
      console.log("No need to replay blocks...");
    }
  }catch(error){
    console.log("error : ", error);
  }
}

//listener();
//handleUnconfirmedTransactions(process.env.MEMPOOL_REDIS_QUEUE);
//handleBallotedTransactions(process.env.BALLOT_REDIS_QUEUE);
//handleBlocks(process.env.BLOCK_REDIS_QUEUE);
//handleFinalizedTransactions(process.env.TRANSACTION_REDIS_QUEUE);
//transactionsFailureCheckup(process.env.FAILURE_CHECKUP_MEMPOOL_REDIS_QUEUE);
//replayBlocks();
//testBatchInsert(13000,1000);

module.exports = {
  router,
  createWebSocketServer
};    