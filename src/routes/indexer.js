//for all env variables imports
require("dotenv").config();
var express = require('express');
var router = express.Router();
const DB = require("../db");
const BlockchainClient = require("bryt-sdk");
const WebSocket = require('ws');
var BlockModel = require("../db/models/block.model");
var TransactionModel= require("../db/models/transaction.model");
var AlertModel= require("../db/models/alert.model");
var unconfirmedAndBallotedBlockModel= require("../db/models/unconfirmedAndBallotedBlock.model");
var queueModel= require("../db/models/queue.model");
var replayBlocksModel= require("../db/models/replayBlocks.model");

console.log("=========== Connecting with RPCs ===========\n");

let rpcs = [], wss = null, current_rpc = null, wait_to_be_mined = null, total_no_of_retries = null,
lastMinorityBlock = null, latestMajorityBlock = null, minority= null, majority = null,
block = [
  {type:"Unconfirmed", blockNumber: null, totalTransactions: 0 },
  {type:"Balloted", blockNumber: null, totalTransactions: 0 }
];

let JSON_RPC_NODE_URLs = process.env.NODE_URLs.split(',');

let RPC_SOCKET_URLs = [
'ws://' + process.env.NODE_URL +':8010/ws/v2',
'ws://' + process.env.NODE_URL +':8020/ws/v2',
'ws://' + process.env.NODE_URL +':8030/ws/v2',
'ws://' + process.env.NODE_URL +':8040/ws/v2',
'ws://' + process.env.NODE_URL +':8050/ws/v2',
] 

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

async function updateUnconfirmedOrBallotedBlock(blockNumber)
{
  let unconfirmedTransactionsCount = await DB(TransactionModel.table).where({transaction_Status: "Unconfirmed"});
  let ballotedTransactionsCount = await DB(TransactionModel.table).where({transaction_Status: "Balloted"});

  let arr = await DB(BlockModel.table).count('* as total');
  let count = BigInt(arr[0].total.toString());
  
  //Case 1: Unconfirmed transaction coming and balloted null
  if(unconfirmedTransactionsCount.length > 0 && ballotedTransactionsCount.length == 0)
  {
    block[0].blockNumber = (count + BigInt(1)).toString();
    block[0].totalTransactions = unconfirmedTransactionsCount.length;
    block[1].blockNumber = null;
    block[1].totalTransactions = 0;
    return;
  }

  //Case 2: Unconfirmed transaction null and balloted coming
  if(unconfirmedTransactionsCount.length == 0 && ballotedTransactionsCount.length > 0)
  {
    if(blockNumber == null)
    {
      console.log("(Unconfirmed transaction null and balloted coming) blockbNumber is : ", blockNumber);
      block[0].totalTransactions = unconfirmedTransactionsCount.length;
      block[1].totalTransactions = ballotedTransactionsCount.length;
    }
    else{
      block[0].blockNumber = (BigInt(blockNumber) + BigInt(1)).toString();
      block[0].totalTransactions = unconfirmedTransactionsCount.length;
      block[1].blockNumber = (blockNumber).toString();
      block[1].totalTransactions = ballotedTransactionsCount.length;   
    }
    return;
  }

  //Case 3: Unconfirmed transaction coming and balloted coming
  if(unconfirmedTransactionsCount.length > 0 && ballotedTransactionsCount.length > 0)
  {
    if(blockNumber == null)
    {
      console.log("Unconfirmed transaction came, blockbNumber is : ", blockNumber);
      block[0].totalTransactions = unconfirmedTransactionsCount.length;
      block[1].totalTransactions = ballotedTransactionsCount.length;
    }
    else
    {
      block[0].blockNumber = (BigInt(blockNumber) + BigInt(1)).toString();
      block[0].totalTransactions = unconfirmedTransactionsCount.length;
      block[1].blockNumber = (blockNumber).toString();
      block[1].totalTransactions = ballotedTransactionsCount.length;
    }
    return;  
  }

  //Case 4: Unconfirmed transaction and balloted null
  if(unconfirmedTransactionsCount.length == 0 && ballotedTransactionsCount.length == 0)
  {
    block[0].blockNumber = null;
    block[0].totalTransactions = 0;
    block[1].blockNumber = null;
    block[1].totalTransactions = 0;
    return;
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

async function enqueueInQueue(parsedMessage,timestamp,hash)
{
  try {
    if(parsedMessage.type == "transaction_ballot")
    {
      //enqueue data
      await DB(queueModel.table)
      .insert({
        type: parsedMessage.type,
        hash: hash,
        Status:"process",
        timestamp: timestamp,
        data: JSON.stringify({blockNumber: parsedMessage.data.epochCycle,
          ballotHashes: parsedMessage.data.hashes})
      })
      .onConflict('hash')
      .ignore();
    }
    else{
      //enqueue data
      await DB(queueModel.table)
      .insert({
        type: parsedMessage.type,
        hash: hash,
        Status:"process",
        timestamp: timestamp,
        data: JSON.stringify(parsedMessage.data)
      })
      .onConflict('hash')
      .ignore();
    }
  } catch (error) {
    console.log('enqueueInQueue function closed: ',error);
    console.log('enqueueInQueue function closed at: ',parsedMessage);
    console.log("Attempt to recall enqueueInQueue function after a delay ...");
    setTimeout(() =>enqueueInQueue(parsedMessage,timestamp,hash), 5000);
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
      const timestamp = Date.now();
      const parsedMessage = JSON.parse(event.data);
      if(parsedMessage.type == "mempool_transaction")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("mempool_transaction: ",parsedMessage.data);
        await enqueueInQueue(parsedMessage,timestamp,parsedMessage.data.TransferObj.hash);
      }
      else if(parsedMessage.type == "transaction_ballot")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("transaction_ballot: ",parsedMessage.data);
        if (parsedMessage.data.hashes != null)
        {
          await enqueueInQueue(parsedMessage,timestamp,parsedMessage.data.hashesHex);
        }
      }
      else if(parsedMessage.type == "finalized_block")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("finalized_block: ",parsedMessage.data);
        await enqueueInQueue(parsedMessage,timestamp,parsedMessage.data.block_hash);
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
    await makeRPCSClients();
    //listen for unconfirmed transactions and balloted block
    for (var j = 0; j < RPC_SOCKET_URLs.length; j++)
    {
      await listenToRPCSockets(RPC_SOCKET_URLs[j]);
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

async function processQueue()
{
  try
  {
    //process queue
    let transactionMessage = {}, blockMessage = {};
    while(true)
    {
      let queueData = await DB(queueModel.table)
      .where({Status:"process"})
      .orderBy('timestamp','asc')
      .limit(1);

      console.log("queueData: ",queueData[0]);
      if(queueData[0] != undefined)
      {
        if(queueData[0].type == "mempool_transaction")
        {
          let transaction = JSON.parse(queueData[0].data);
          let arr = await DB(TransactionModel.table).count('* as total');
          let count = BigInt(arr[0].total.toString());
          
          let transactionDataInDb = await DB(TransactionModel.table).where({hash: transaction.TransferObj.hash});

          if(transactionDataInDb.length != 0)
          {
            console.log("mempool came after ballot OR finalized block, skipping it...");
          }
          else{
            console.log("mempool came before ballot OR finalized block...");
            // save unconfirmed transaction in DB
            await DB(TransactionModel.table)
            .insert({
              id: count + BigInt(1),
              transaction_Status: "Unconfirmed",
              hash: transaction.TransferObj.hash,
              from: transaction.TransferObj.from,
              to: transaction.TransferObj.to,
              value: transaction.TransferObj.value.toString(),
              transaction_status: transaction.transaction_status,
              functionType: transaction.type,
              Status: transaction.Status,
              State: transaction.State,
              nonce: transaction.TransferObj.nonce.toString(),
              type: transaction.TransferObj.type.toString(),
              node_id: transaction.TransferObj.node_id,
              gas: transaction.TransferObj.gas.toString(),
              gas_price: transaction.TransferObj.gas_price.toString(),
              input: transaction.TransferObj.input
            });
            await updateUnconfirmedOrBallotedBlock(null);
  
            // save current unconfirmed OR balloted block data 
            let unconfirmedAndBallotedBlockData = await DB(unconfirmedAndBallotedBlockModel.table);
            if(unconfirmedAndBallotedBlockData.length == 0)
            {
              await DB(unconfirmedAndBallotedBlockModel.table)
              .insert({
                id: 1,
                unconfirmed_blocknumber: block[0].blockNumber,
                unconfirmed_total_transactions : block[0].totalTransactions,
                balloted_blocknumber: block[1].blockNumber,
                balloted_total_transactions: block[1].totalTransactions
              }); 
            }
            else{
              await DB(unconfirmedAndBallotedBlockModel.table)
              .where({id: 1})
              .update({
                unconfirmed_blocknumber: block[0].blockNumber,
                unconfirmed_total_transactions : block[0].totalTransactions,
                balloted_blocknumber: block[1].blockNumber,
                balloted_total_transactions: block[1].totalTransactions
              });
            }
    
            transactionMessage = {
              topic: "unconfirmed-transactions",
              message: transaction
            };
            blockMessage = {
              topic: "blocks",
              message: block
            };
    
            //broad cast blockMessage
            wss.clients.forEach(function each(client) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(blockMessage));
              }
            });
            //broad cast transactionMessage
            wss.clients.forEach(function each(client) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(transactionMessage));
              }
            });
            transactionMessage = {}; 
            blockMessage = {};
          }
          await DB(queueModel.table)
          .where({hash: queueData[0].hash})
          .update({Status : "completed"});
        }
        if(queueData[0].type == "transaction_ballot")
        {
          let ballot = JSON.parse(queueData[0].data);
  
          for (var i=0; i< ballot.ballotHashes.length; i++)
          {
            let transactionInDB = await DB(TransactionModel.table).where({ hash :  ballot.ballotHashes[i]});
            console.log(" transaction "+ballot.ballotHashes[i]+" db record: " + transactionInDB[0]);
            if(transactionInDB.length == 0)
            {
              console.log("ballot came before mempool OR finalized Block, skipping it...");
            }
            else if(transactionInDB[0].transaction_Status == "Unconfirmed")
            {
              console.log("ballot came after mempool before finalized block...");
              await DB(TransactionModel.table)
              .where({ hash :  ballot.ballotHashes[i]})
              .update({transaction_Status: "Balloted"});
    
              await updateUnconfirmedOrBallotedBlock(ballot.blockNumber);
  
              // save current unconfirmed OR balloted block data 
              let unconfirmedAndBallotedBlockData = await DB(unconfirmedAndBallotedBlockModel.table);
              if(unconfirmedAndBallotedBlockData.length == 0)
              {
                await DB(unconfirmedAndBallotedBlockModel.table)
                .insert({
                  id: 1,
                  unconfirmed_blocknumber: block[0].blockNumber,
                  unconfirmed_total_transactions : block[0].totalTransactions,
                  balloted_blocknumber: block[1].blockNumber,
                  balloted_total_transactions: block[1].totalTransactions
                });
              }
              else{
                await DB(unconfirmedAndBallotedBlockModel.table)
                .where({id: 1})
                .update({
                  unconfirmed_blocknumber: block[0].blockNumber,
                  unconfirmed_total_transactions : block[0].totalTransactions,
                  balloted_blocknumber: block[1].blockNumber,
                  balloted_total_transactions: block[1].totalTransactions
                });
              }
  
              transactionMessage = {
                topic: "balloted-transactions",
                message: {blockNumber: ballot.blockNumber, hash: ballot.ballotHashes[i]}
              };
              blockMessage = {
                topic: "blocks",
                message: block
              };
  
              //broad cast transactionMessage
              wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(blockMessage));
                }
              });
              //broad cast blockMessage
              wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify(transactionMessage));
                }
              });
              transactionMessage = {}; 
              blockMessage = {};
            }
            else{
              console.log("Already updated to balloted, skipping it...");
            }
          }
          await DB(queueModel.table)
          .where({hash: queueData[0].hash})
          .update({Status : "completed"});
        }
        if(queueData[0].type == "finalized_block")
        {
          let blockData = JSON.parse(queueData[0].data);
  
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
            
            if(blockData.transactions != null)
            {
              console.log("block on a block number with transactions");
              let transactions= blocks[0].transactions;
              if(transactions == null)
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
          
          if(blockData.transactions != null)
          {
            for (var i =0; i < blockData.transactions.length; i++ )
            {
              let transactionInDB = await DB(TransactionModel.table).where({ hash :  blockData.transactions[i]});
              console.log(" transaction "+blockData.transactions[i]+" db record: " + transactionInDB[0]);
              
              if(transactionInDB.length == 0)
              {
                console.log("finalized block came before mempool OR ballot...");
                const transactionData = await fetchTransactionDataByHashHelper(blockData.transactions[i]);
                console.log("transactionData: ",transactionData);

                let arr = await DB(TransactionModel.table).count('* as total');
                let count = BigInt(arr[0].total.toString());

                await DB(TransactionModel.table)
                .insert({
                  id: count + BigInt(1),
                  transaction_Status: "Confirmed",
                  hash: transactionData.result.transaction.TransferObj.hash,
                  block : (blockData.block_number).toString(),
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
              else if(transactionInDB[0].transaction_Status == "Confirmed")
              {
                console.log("Transaction repeated, skipping it...",blockData.transactions[i]);
              }
              else if (transactionInDB[0].transaction_Status == "Unconfirmed" || 
                transactionInDB[0].transaction_Status == "Balloted" )
              {
                console.log("transaction found in the block, updating its status.");
                await DB(TransactionModel.table)
                .where({hash :  blockData.transactions[i]})
                .update({
                  block: (blockData.block_number).toString(),
                  transaction_Status: "Confirmed",
                  unix_timestamp:Date.now()
                });
                await updateUnconfirmedOrBallotedBlock(null);
  
                // save current unconfirmed OR balloted block data 
                let unconfirmedAndBallotedBlockData = await DB(unconfirmedAndBallotedBlockModel.table);
                if(unconfirmedAndBallotedBlockData.length == 0)
                {
                  await DB(unconfirmedAndBallotedBlockModel.table)
                  .insert({
                    id: 1,
                    unconfirmed_blocknumber: block[0].blockNumber,
                    unconfirmed_total_transactions : block[0].totalTransactions,
                    balloted_blocknumber: block[1].blockNumber,
                    balloted_total_transactions: block[1].totalTransactions
                  });
                }
                else{
                  await DB(unconfirmedAndBallotedBlockModel.table)
                  .where({id: 1})
                  .update({
                    unconfirmed_blocknumber: block[0].blockNumber,
                    unconfirmed_total_transactions : block[0].totalTransactions,
                    balloted_blocknumber: block[1].blockNumber,
                    balloted_total_transactions: block[1].totalTransactions
                  });
                }
    
                transactionMessage = {
                  topic: "balloted-transaction-removed",
                  message: {hash: blockData.transactions[i]}
                };
                blockMessage = {
                  topic: "blocks",
                  message: block
                };
    
                //broad cast transactionMessage
                wss.clients.forEach(function each(client) {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(blockMessage));
                  }
                });
                //broad cast blockMessage
                wss.clients.forEach(function each(client) {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(transactionMessage));
                  }
                });
                transactionMessage = {}; 
                blockMessage = {};
              }
            }
          }
          await DB(queueModel.table)
          .where({hash: queueData[0].hash})
          .update({Status : "completed"});
        }
      }
      else{
        console.log("No new queue data is coming...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log('processQueue function closed: ',error);
    console.log("Attempt to recall processQueue function after a delay ...");
    setTimeout(processQueue, 2000);
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

listener();
processQueue();
replayBlocks();

module.exports = {
  router,
  createWebSocketServer
};    