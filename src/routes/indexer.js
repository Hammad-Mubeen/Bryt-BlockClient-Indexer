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

console.log("=========== Connecting with RPCs ===========\n");

let rpcs = [], wss = null, client = null, ballots = [], current_rpc = null, wait_to_be_mined = null, total_no_of_retries = null,
lastMinorityBlock = null, latestMajorityBlock = null, minority= null, majority = null,
block = [
  {type:"Unconfirmed", blockNumber: null, totalTransactions: 0 },
  {type:"Balloted", blockNumber: null, totalTransactions: 0 }
];

let JSON_RPC_NODE_URLs = [
'http://' + process.env.DEVNET_NODE_URL +':8010/rpc',
'http://' + process.env.DEVNET_NODE_URL +':8020/rpc',
'http://' + process.env.DEVNET_NODE_URL +':8030/rpc',
'http://' + process.env.DEVNET_NODE_URL +':8040/rpc',
'http://' + process.env.DEVNET_NODE_URL +':8050/rpc',
];

let RPC_SOCKET_URLs = [
'ws://' + process.env.DEVNET_NODE_URL +':8010/ws/v2',
'ws://' + process.env.DEVNET_NODE_URL +':8020/ws/v2',
'ws://' + process.env.DEVNET_NODE_URL +':8030/ws/v2',
'ws://' + process.env.DEVNET_NODE_URL +':8040/ws/v2',
'ws://' + process.env.DEVNET_NODE_URL +':8050/ws/v2',
] 

async function createWebSocketServer(server)
{
  wss = new WebSocket.Server({ server });
  wss.on('connection', async(ws) => {
    client = ws;
  });
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

async function updateUnconfirmeOrBallotedBlock()
{
  let arr = await DB(BlockModel.table).count('* as total');
  let count = BigInt(arr[0].total.toString());

  let unconfirmedTransactionsCount = await DB(TransactionModel.table).where({transaction_Status: "Unconfirmed"});
  let ballotedTransactionsCount = await DB(TransactionModel.table).where({transaction_Status: "Balloted"});
  
  if(ballotedTransactionsCount.length == 0)
  {
    block[1].blockNumber = null;
    block[1].totalTransactions = 0; 
    block[0].blockNumber = (count + BigInt(1)).toString();
    block[0].totalTransactions = unconfirmedTransactionsCount.length; 
  }
  else{
    block[1].blockNumber = (count + BigInt(1)).toString();
    block[1].totalTransactions = ballotedTransactionsCount.length; 
    block[0].blockNumber = (count + BigInt(2)).toString();
    block[0].totalTransactions = unconfirmedTransactionsCount.length; 
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
        await checkIfTransactionsFound(transactions_array,results,results_with_all_data);
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
          minority = true;
          if(majority == true || majority == null)
          {
            lastMinorityBlock = blockNumber;
          }
          majority = false;
        }
        else{
          console.log("block data is correct, either all block hashes are same on ports OR a highest occurance of one block hash: ",blockNumber);
          //if no transactions found
          if(transactions_array.length == 0)
          {
            index = results.indexOf(maxDuplicateElement.element);
          }
          block_status="Finalized";

          majority = true;
          latestMajorityBlock = blockNumber;
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
async function listenToRPCSockets(RPCSocketURL,transactions,transactions_with_all_data)
{
  // start listening
  // Create a WebSocket connection
  const socket = new WebSocket(RPCSocketURL);

  // Connection opened event
  socket.addEventListener('open', () => {
      console.log('Connected to RPC WebSocket: ',RPCSocketURL);
  });

  // Message event: handle messages from the server
  socket.addEventListener('message', (event) => {
      const parsedMessage = JSON.parse(event.data);
      if(parsedMessage.type == "mempool_transaction")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("mempool_transaction: ",parsedMessage.data);
        let transaction = parsedMessage.data;
        let transactionHash = transaction.TransferObj.hash;
        
        if (!transactions.includes(transactionHash)) {
          transactions.push(transactionHash);
          transactions_with_all_data.push(transaction);
          console.log(`${transactionHash} transaction hash to the array.`);
        } else {
          console.log(`${transactionHash} is already in the array.`);
        }
      }
      else if(parsedMessage.type == "transaction_ballot")
      {
        console.log('Message from RPC WebSocket: ', RPCSocketURL);
        console.log("transaction_ballot: ",parsedMessage.data);

        let blockNumber = parsedMessage.data.epochCycle;
        let ballotHashes = parsedMessage.data.hashes;

        if (ballotHashes != null)
        {
          if(ballots.length == 0)
          {
            let ballot = {blockNumber: blockNumber, ballotHashes: ballotHashes};
            ballots.push(ballot);
          }
          else{
            let found = ballots.some(obj => Object.values(obj).includes(blockNumber));
            if (!found) 
            {
              let ballot = {blockNumber: blockNumber, ballotHashes: ballotHashes};
              ballots.push(ballot);
            }
            else{
              console.log("blocknumber repeating in ballot...");
            }
          }
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
  });
}
async function listenTransactions()
{
  try
  {
    let transactions=[], transactions_with_all_data=[], ballots=[];
    //listen for unconfirmed transactions and balloted block
    for (var j = 0; j < RPC_SOCKET_URLs.length; j++)
    {
      await listenToRPCSockets(RPC_SOCKET_URLs[j],transactions,transactions_with_all_data,ballots);
    }

    let i = 0, message = {};
    while(true)
    {
      if(transactions_with_all_data[i] != null)
      {
        let transaction = transactions_with_all_data[i];

        message = {
          topic: "unconfirmed-transactions",
          message: transaction
        };
        
        client.send(JSON.stringify(message));

        // save unconfirmed transaction in DB
        let transactionInDB = await DB(TransactionModel.table).where({ hash :  transaction.TransferObj.hash});
        console.log(" transaction "+transaction.TransferObj.hash+" db record: " + transactionInDB[0]);

        if(transactionInDB.length == 0)
        {
          await DB(TransactionModel.table)
          .insert({
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
          })
          .returning("*");
          await updateUnconfirmeOrBallotedBlock();
          message = {
            topic: "blocks",
            message: block
          };
          client.send(JSON.stringify(message));
        }
        else{
          console.log("Already in db, skipping it...");
        }
        i = i + 1;
      }
      else{
        console.log("No new unconfirmed transactions are coming...");
        await sleep(2000);
      }
    }
  } catch (error) {
    console.log("Error : ", error);
  }
}

async function handleBallotedTransactions()
{
  try
  {
    let i = 0, message = {};
    while(true)
    {
      if(ballots[i] != null)
      {
        let ballot = ballots[i];
        for (var j=0; j< ballot.ballotHashes.length; j++)
        {
          let transactionInDB = await DB(TransactionModel.table).where({ hash :  ballot.ballotHashes[j]});
          console.log(" transaction "+ballot.ballotHashes[j]+" db record: " + transactionInDB[0]);

          if(transactionInDB[0].transaction_Status == "Unconfirmed")
          {
            message = {
              topic: "balloted-transactions",
              message: {blockNumber: ballot.blockNumber, hash: ballot.ballotHashes[j]}
            };
            client.send(JSON.stringify(message));

            await DB(TransactionModel.table)
            .where({ hash :  ballot.ballotHashes[j]})
            .update({transaction_Status: "Balloted"})
            .returning("*");
  
            await updateUnconfirmeOrBallotedBlock();
            message = {
              topic: "blocks",
              message: block
            };
            client.send(JSON.stringify(message));
          }
          else{
            console.log("Already updated to balloted, skipping it...");
          }
        }
        i = i + 1;
      }
      else{
        console.log("No balloted transactions are coming...");
        await sleep(2000);
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
    const blockHeight = BigInt(await fetchLatestBlockHeightHelper());
    let blockNumber = (blockHeight);
    console.log("Latest Block Height is: ", blockNumber);

    blockNumber=BigInt(1);

    while (true)
    {
      let blocks = await DB(BlockModel.table).where({ block_number : blockNumber.toString() });
      console.log(" block number " + blockNumber + " db record: " + blocks[0]);
     
      if(blocks.length == 0)
      {
        await setWaitToBeMinedAndRetries(blockNumber);
        let {blockData,block_status} = await getCorrectBlock(blockNumber);
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
    
                await DB(TransactionModel.table)
                .insert({
                  transaction_Status: "Confirmed",
                  hash: transactionData.result.transaction.TransferObj.hash,
                  block : blockNumber.toString(),
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
                if(transaction[0].transaction_Status == "Balloted")
                {
                  console.log("Balloted transaction found in the block, updating its status.");
                  let message = {
                    topic: "balloted-transaction-removed",
                    message: {hash: transaction[0].hash}
                  };
                  client.send(JSON.stringify(message));
                  await DB(TransactionModel.table)
                  .where({hash :  blockData.result.transactions[i]})
                  .update({
                    block: blockNumber.toString(),
                    transaction_Status: "Confirmed"
                  })
                  .returning("*");
                  await updateUnconfirmeOrBallotedBlock();
                  message = {
                    topic: "blocks",
                    message: block
                  };
                  client.send(JSON.stringify(message));
                }
                else{
                  console.log("Duplicate Transaction, skipping it because it is not Balloted...  ", blockData.result.transactions[i]);
                }
              }
            }
          }
        }
      }
      else{
        console.log("Duplicate block, skipping it ...  ", blockNumber);
      }
      blockNumber = blockNumber + BigInt(1);
    }
  }catch(error){
    console.log("error : ", error);
  }
}

handleBallotedTransactions();
listenTransactions();
Indexer();

module.exports = {
  router,
  createWebSocketServer
};    